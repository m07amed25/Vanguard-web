"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  FEATURE_SLUGS,
  type FeatureReadinessItem,
  type FeatureSlug,
  type FileScannerSlug,
  type PendingTriageHandoff,
  type ServiceReadinessSnapshot,
  type TriageDraftState,
} from "@/lib/features/types";

const HANDOFF_TTL_MS = 30_000;
const REFRESH_COOLDOWN_MS = 2_000;
const INITIAL_STREAM_FALLBACK_MS = 2_000;

function createInitialPlaceholderSnapshot(): ServiceReadinessSnapshot {
  const features = Object.fromEntries(
    FEATURE_SLUGS.map((slug) => [
      slug,
      {
        slug,
        ready: false,
        reachable: false,
        statusLabel: "Unavailable" as const,
        latencyMs: null,
      },
    ]),
  ) as Record<FeatureSlug, FeatureReadinessItem>;

  return {
    overallStatus: "down",
    readyCount: 0,
    totalCount: FEATURE_SLUGS.length,
    checkedAt: "",
    features,
  };
}

function mintHandoffId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `handoff-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface ReadinessContextValue {
  snapshot: ServiceReadinessSnapshot;
  isChecking: boolean;
  isInitialLoading: boolean;
  refreshError: string | null;
  refreshHealth: () => Promise<ServiceReadinessSnapshot>;
  waitForInitialSnapshot: () => Promise<ServiceReadinessSnapshot>;
  hydrateSnapshot: (snapshot: ServiceReadinessSnapshot) => void;
}

export type NewPendingTriageHandoff =
  | {
      readonly kind: "file";
      readonly slug: FileScannerSlug;
      readonly mode: "single";
      readonly file: File;
      readonly autoSubmit: true;
    }
  | {
      readonly kind: "url";
      readonly slug: "url";
      readonly mode: "single";
      readonly text: string;
      readonly autoSubmit: true;
    }
  | {
      readonly kind: "url";
      readonly slug: "url";
      readonly mode: "batch";
      readonly text: string;
      readonly autoSubmit: false;
    }
  | {
      readonly kind: "sms";
      readonly slug: "sms";
      readonly mode: "single" | "batch";
      readonly text: string;
      readonly autoSubmit: boolean;
    };

export interface TriageHandoffContextValue {
  drafts: TriageDraftState;
  setFileDraft: (file: File | null) => void;
  setUrlDraft: (url: string) => void;
  setSmsDraft: (sms: string) => void;
  stageHandoff: (handoff: NewPendingTriageHandoff) => string;
  claimHandoff: (slug: FeatureSlug) => PendingTriageHandoff | null;
}

const ReadinessContext = createContext<ReadinessContextValue | null>(null);
const TriageHandoffContext = createContext<TriageHandoffContextValue | null>(
  null,
);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const [snapshot, setSnapshot] = useState<ServiceReadinessSnapshot>(
    createInitialPlaceholderSnapshot,
  );
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const snapshotRef = useRef<ServiceReadinessSnapshot>(snapshot);
  const isInitialLoadingRef = useRef(true);
  const hasManualRefreshRef = useRef(false);
  const lastManualRefreshAtRef = useRef(0);
  const inFlightRefreshRef = useRef<Promise<ServiceReadinessSnapshot> | null>(
    null,
  );
  const initialWaitersRef = useRef<
    Array<(resolved: ServiceReadinessSnapshot) => void>
  >([]);

  const flushInitialWaiters = useCallback(
    (resolved: ServiceReadinessSnapshot) => {
      if (initialWaitersRef.current.length === 0) return;
      const waiters = initialWaitersRef.current.splice(
        0,
        initialWaitersRef.current.length,
      );
      for (const resolve of waiters) {
        resolve(resolved);
      }
    },
    [],
  );

  const initialTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const timers = initialTimersRef.current;
    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const hydrateSnapshot = useCallback(
    (incoming: ServiceReadinessSnapshot) => {
      if (hasManualRefreshRef.current && snapshotRef.current.checkedAt !== "") {
        isInitialLoadingRef.current = false;
        setIsInitialLoading(false);
        flushInitialWaiters(snapshotRef.current);
        return;
      }
      snapshotRef.current = incoming;
      isInitialLoadingRef.current = false;
      setSnapshot(incoming);
      setIsInitialLoading(false);
      flushInitialWaiters(incoming);
    },
    [flushInitialWaiters],
  );

  const executeRefresh = useCallback(
    async (bypassCooldown: boolean): Promise<ServiceReadinessSnapshot> => {
      if (inFlightRefreshRef.current) {
        return inFlightRefreshRef.current;
      }

      const now = Date.now();
      if (
        !bypassCooldown &&
        !isInitialLoadingRef.current &&
        now - lastManualRefreshAtRef.current < REFRESH_COOLDOWN_MS
      ) {
        return snapshotRef.current;
      }

      lastManualRefreshAtRef.current = now;
      setIsChecking(true);
      setRefreshError(null);

      const promise = (async () => {
        try {
          const response = await fetch("/api/features/health", {
            cache: "no-store",
          });
          if (response.ok) {
            const next = (await response.json()) as ServiceReadinessSnapshot;
            hasManualRefreshRef.current = true;
            snapshotRef.current = next;
            isInitialLoadingRef.current = false;
            setSnapshot(next);
            setIsInitialLoading(false);
            setRefreshError(null);
            flushInitialWaiters(next);
            return next;
          }

          if (response.status === 429) {
            let rateMsg =
              "Too many health status checks. Wait a moment and try again (limit: 12 per minute).";
            try {
              const errBody = (await response.json()) as { message?: string };
              if (errBody.message) rateMsg = errBody.message;
            } catch {
              // Keep default rate-limit message
            }
            setRefreshError(rateMsg);
          } else {
            setRefreshError(
              "Could not refresh scanner status right now. Showing last known status.",
            );
          }
        } catch {
          setRefreshError(
            "Could not refresh scanner status right now. Showing last known status.",
          );
        } finally {
          isInitialLoadingRef.current = false;
          setIsInitialLoading(false);
          setIsChecking(false);
          inFlightRefreshRef.current = null;
          flushInitialWaiters(snapshotRef.current);
        }
        return snapshotRef.current;
      })();

      inFlightRefreshRef.current = promise;
      return promise;
    },
    [flushInitialWaiters],
  );

  const refreshHealth = useCallback((): Promise<ServiceReadinessSnapshot> => {
    return executeRefresh(false);
  }, [executeRefresh]);

  const waitForInitialSnapshot =
    useCallback((): Promise<ServiceReadinessSnapshot> => {
      if (!isInitialLoadingRef.current) {
        return Promise.resolve(snapshotRef.current);
      }

      return new Promise<ServiceReadinessSnapshot>((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
          initialTimersRef.current.delete(timer);
          if (!settled && isInitialLoadingRef.current) {
            void executeRefresh(true).then((snap) => {
              if (!settled) {
                settled = true;
                resolve(snap);
              }
            });
          }
        }, INITIAL_STREAM_FALLBACK_MS);
        initialTimersRef.current.add(timer);

        initialWaitersRef.current.push((snap) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            initialTimersRef.current.delete(timer);
            resolve(snap);
          }
        });
      });
    }, [executeRefresh]);

  const [drafts, setDrafts] = useState<TriageDraftState>({
    file: null,
    url: "",
    sms: "",
  });

  const pendingRef = useRef<PendingTriageHandoff | null>(null);

  const setFileDraft = useCallback((file: File | null) => {
    setDrafts((prev) => ({ ...prev, file }));
  }, []);

  const setUrlDraft = useCallback((url: string) => {
    setDrafts((prev) => ({ ...prev, url }));
  }, []);

  const setSmsDraft = useCallback((sms: string) => {
    setDrafts((prev) => ({ ...prev, sms }));
  }, []);

  const stageHandoff = useCallback((input: NewPendingTriageHandoff): string => {
    const id = mintHandoffId();
    const createdAt = Date.now();
    pendingRef.current = {
      ...input,
      id,
      createdAt,
    } as PendingTriageHandoff;

    setDrafts((prev) => {
      if (input.kind === "file") {
        return { ...prev, file: null };
      }
      if (input.kind === "url") {
        return { ...prev, url: "" };
      }
      return { ...prev, sms: "" };
    });

    return id;
  }, []);

  const claimHandoff = useCallback(
    (slug: FeatureSlug): PendingTriageHandoff | null => {
      const current = pendingRef.current;
      if (!current) return null;

      if (Date.now() - current.createdAt > HANDOFF_TTL_MS) {
        pendingRef.current = null;
        return null;
      }

      if (current.slug !== slug) {
        return null;
      }

      pendingRef.current = null;
      return current;
    },
    [],
  );

  useEffect(() => {
    const current = pendingRef.current;
    if (!current || !pathname) return;
    const expectedPath = `/features/${current.slug}`;
    if (pathname !== "/features" && pathname !== expectedPath) {
      pendingRef.current = null;
    }
  }, [pathname]);

  const readinessValue = useMemo<ReadinessContextValue>(
    () => ({
      snapshot,
      isChecking,
      isInitialLoading,
      refreshError,
      refreshHealth,
      waitForInitialSnapshot,
      hydrateSnapshot,
    }),
    [
      snapshot,
      isChecking,
      isInitialLoading,
      refreshError,
      refreshHealth,
      waitForInitialSnapshot,
      hydrateSnapshot,
    ],
  );

  const triageValue = useMemo<TriageHandoffContextValue>(
    () => ({
      drafts,
      setFileDraft,
      setUrlDraft,
      setSmsDraft,
      stageHandoff,
      claimHandoff,
    }),
    [
      drafts,
      setFileDraft,
      setUrlDraft,
      setSmsDraft,
      stageHandoff,
      claimHandoff,
    ],
  );

  return (
    <ReadinessContext.Provider value={readinessValue}>
      <TriageHandoffContext.Provider value={triageValue}>
        {children}
      </TriageHandoffContext.Provider>
    </ReadinessContext.Provider>
  );
}

export function useReadiness(): ReadinessContextValue {
  const ctx = useContext(ReadinessContext);
  if (!ctx) {
    throw new Error("useReadiness must be used within a WorkspaceProvider");
  }
  return ctx;
}

export function useTriageHandoff(): TriageHandoffContextValue {
  const ctx = useContext(TriageHandoffContext);
  if (!ctx) {
    throw new Error("useTriageHandoff must be used within a WorkspaceProvider");
  }
  return ctx;
}

export function WorkspaceReadinessSync({
  snapshot,
}: {
  snapshot: ServiceReadinessSnapshot;
}) {
  const { hydrateSnapshot } = useReadiness();

  useEffect(() => {
    hydrateSnapshot(snapshot);
  }, [hydrateSnapshot, snapshot]);

  return null;
}
