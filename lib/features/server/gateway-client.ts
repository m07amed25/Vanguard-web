import {
  FEATURE_SLUGS,
  type FeatureReadinessItem,
  type FeatureSlug,
  type ServiceReadinessSnapshot,
} from "../types.ts";

const HEALTH_TIMEOUT_MS = 5_000;
const HEALTH_SINGLEFLIGHT_TTL_MS = 1_500;

let inFlightHealth: {
  baseKey: string;
  promise: Promise<ServiceReadinessSnapshot>;
} | null = null;

let cachedHealth: {
  baseKey: string;
  expiresAt: number;
  snapshot: ServiceReadinessSnapshot;
} | null = null;

const UPSTREAM_ENDPOINTS = {
  health: "/health",
  email: "/api/v1/email/predict",
  exe: "/api/v1/exe/scan",
  office: "/api/v1/office/scan",
  pdf: "/api/v1/pdf/scan",
  smsSingle: "/api/v1/sms/predict",
  smsBatch: "/api/v1/sms/predict/batch",
  urlSingle: "/api/v1/url/predict",
  urlBatch: "/api/v1/url/predict/batch",
} as const;

export type UpstreamEndpointKey = keyof typeof UPSTREAM_ENDPOINTS;

export class GatewayError extends Error {
  readonly code:
    | "service_unavailable"
    | "timeout"
    | "payload_too_large"
    | "unsupported_content"
    | "upstream_error";
  readonly httpStatus: number;
  readonly retryable: boolean;

  constructor(options: {
    code:
      | "service_unavailable"
      | "timeout"
      | "payload_too_large"
      | "unsupported_content"
      | "upstream_error";
    httpStatus: number;
    message: string;
    retryable: boolean;
  }) {
    super(options.message);
    this.name = "GatewayError";
    this.code = options.code;
    this.httpStatus = options.httpStatus;
    this.retryable = options.retryable;
  }
}

export function resolveGatewayBaseUrl(): URL | null {
  const raw = process.env.VANGUARD_API?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed;
  } catch {
    return null;
  }
}

function buildGatewayUrl(
  base: URL,
  endpointKey: UpstreamEndpointKey,
  queryParams?: Record<string, string | number | boolean | null | undefined>,
): URL {
  const path = UPSTREAM_ENDPOINTS[endpointKey];
  if (!path) {
    throw new GatewayError({
      code: "upstream_error",
      httpStatus: 502,
      message: `Unrecognized upstream scanner endpoint: ${String(endpointKey)}.`,
      retryable: false,
    });
  }
  const basePath = base.pathname === "/" ? "" : base.pathname;
  const target = new URL(`${basePath}${path}`, base.origin);
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== null && value !== undefined && value !== "") {
        target.searchParams.set(key, String(value));
      }
    }
  }
  return target;
}

function buildGatewayHeaders(extra?: Record<string, string>): Headers {
  const headers = new Headers(extra);
  const apiKey = process.env.VANGUARD_API_KEY?.trim();
  if (apiKey) {
    headers.set("X-API-Key", apiKey);
  }
  headers.set("Accept", "application/json");
  return headers;
}

function buildUnavailableReadiness(
  overallStatus: "down" | "unconfigured",
): ServiceReadinessSnapshot {
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
    overallStatus,
    readyCount: 0,
    totalCount: FEATURE_SLUGS.length,
    checkedAt: new Date().toISOString(),
    features,
  };
}

async function fetchGatewayHealthUncoalesced(
  base: URL | null,
): Promise<ServiceReadinessSnapshot> {
  if (!base) {
    return buildUnavailableReadiness("unconfigured");
  }

  try {
    const response = await fetch(buildGatewayUrl(base, "health"), {
      method: "GET",
      headers: buildGatewayHeaders(),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return buildUnavailableReadiness("down");
    }

    const raw = (await response.json()) as {
      models?: Record<
        string,
        { ready?: boolean; reachable?: boolean; latency_ms?: number | null }
      >;
    } | null;

    const models =
      raw &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      raw.models &&
      typeof raw.models === "object"
        ? raw.models
        : {};
    let readyCount = 0;

    const features = Object.fromEntries(
      FEATURE_SLUGS.map((slug) => {
        const entry = models[slug];
        const ready = Boolean(entry?.ready);
        const reachable = Boolean(entry?.reachable);
        if (ready) readyCount += 1;
        const latencyMs =
          typeof entry?.latency_ms === "number" &&
          Number.isFinite(entry.latency_ms)
            ? Math.round(entry.latency_ms * 10) / 10
            : null;

        return [
          slug,
          {
            slug,
            ready,
            reachable,
            statusLabel: ready ? ("Ready" as const) : ("Unavailable" as const),
            latencyMs,
          },
        ];
      }),
    ) as Record<FeatureSlug, FeatureReadinessItem>;

    const overallStatus =
      readyCount === FEATURE_SLUGS.length
        ? "healthy"
        : readyCount > 0
          ? "degraded"
          : "down";

    return {
      overallStatus,
      readyCount,
      totalCount: FEATURE_SLUGS.length,
      checkedAt: new Date().toISOString(),
      features,
    };
  } catch {
    return buildUnavailableReadiness("down");
  }
}

export async function fetchGatewayHealth(): Promise<ServiceReadinessSnapshot> {
  const base = resolveGatewayBaseUrl();
  const baseKey = base ? base.href : "unconfigured";
  const now = Date.now();

  if (
    cachedHealth &&
    cachedHealth.baseKey === baseKey &&
    now < cachedHealth.expiresAt
  ) {
    return cachedHealth.snapshot;
  }

  if (inFlightHealth && inFlightHealth.baseKey === baseKey) {
    return inFlightHealth.promise;
  }

  const promise = fetchGatewayHealthUncoalesced(base).then((snapshot) => {
    cachedHealth = {
      baseKey,
      expiresAt: Date.now() + HEALTH_SINGLEFLIGHT_TTL_MS,
      snapshot,
    };
    if (inFlightHealth?.promise === promise) {
      inFlightHealth = null;
    }
    return snapshot;
  });

  inFlightHealth = { baseKey, promise };
  return promise;
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "TimeoutError" ||
    error.name === "AbortError" ||
    error.message.toLowerCase().includes("timed out")
  );
}

async function mapUpstreamResponse(
  response: Response,
  timeoutSeconds: number,
): Promise<unknown> {
  if (response.ok) {
    try {
      return await response.json();
    } catch {
      throw new GatewayError({
        code: "upstream_error",
        httpStatus: 502,
        message:
          "The scanner returned an unreadable response. Please try again in a moment.",
        retryable: true,
      });
    }
  }

  if (response.status === 413) {
    throw new GatewayError({
      code: "payload_too_large",
      httpStatus: 413,
      message:
        "This file exceeds the scanner's maximum upload size limit. Choose a smaller file and try again.",
      retryable: false,
    });
  }

  if (response.status === 400 || response.status === 422) {
    throw new GatewayError({
      code: "unsupported_content",
      httpStatus: 422,
      message:
        "The submitted input could not be parsed by this scanner. Verify the file format or message content and try again.",
      retryable: false,
    });
  }

  if (response.status === 504) {
    throw new GatewayError({
      code: "timeout",
      httpStatus: 504,
      message: `The scan timed out after ${timeoutSeconds} seconds. Please try again.`,
      retryable: true,
    });
  }

  if (
    response.status === 401 ||
    response.status === 403 ||
    response.status === 502 ||
    response.status === 503
  ) {
    throw new GatewayError({
      code: "service_unavailable",
      httpStatus: 503,
      message:
        "This scanning service is temporarily unavailable. Please wait a moment and try again, or choose another scanner.",
      retryable: true,
    });
  }

  throw new GatewayError({
    code: "upstream_error",
    httpStatus: 502,
    message:
      "The scanning service encountered an unexpected error. Please try again.",
    retryable: true,
  });
}

export async function postGatewayFile(options: {
  endpoint: Exclude<
    UpstreamEndpointKey,
    "health" | "smsSingle" | "smsBatch" | "urlSingle" | "urlBatch"
  >;
  fileBytes: Uint8Array;
  filename: string;
  contentType: string;
  queryParams?: Record<string, string | number | boolean | null | undefined>;
  timeoutMs: number;
}): Promise<unknown> {
  const base = resolveGatewayBaseUrl();
  if (!base) {
    throw new GatewayError({
      code: "service_unavailable",
      httpStatus: 503,
      message:
        "Live scanning is currently unavailable in this environment. Please try again later.",
      retryable: true,
    });
  }

  const formData = new FormData();
  const safeBytes = new Uint8Array(options.fileBytes);
  const blob = new Blob([safeBytes], {
    type: options.contentType || "application/octet-stream",
  });
  formData.append("file", blob, options.filename);

  const timeoutSeconds = Math.round(options.timeoutMs / 1_000);

  try {
    const response = await fetch(
      buildGatewayUrl(base, options.endpoint, options.queryParams),
      {
        method: "POST",
        headers: buildGatewayHeaders(),
        body: formData,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(options.timeoutMs),
      },
    );
    return await mapUpstreamResponse(response, timeoutSeconds);
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    if (isTimeoutError(error)) {
      throw new GatewayError({
        code: "timeout",
        httpStatus: 504,
        message: `The scan timed out after ${timeoutSeconds} seconds. Please try again.`,
        retryable: true,
      });
    }
    throw new GatewayError({
      code: "service_unavailable",
      httpStatus: 503,
      message:
        "Could not reach the scanning service right now. Please check readiness and try again.",
      retryable: true,
    });
  }
}

export async function postGatewayJson(options: {
  endpoint: "smsSingle" | "smsBatch" | "urlSingle" | "urlBatch";
  payload: Record<string, unknown>;
  timeoutMs: number;
}): Promise<unknown> {
  const base = resolveGatewayBaseUrl();
  if (!base) {
    throw new GatewayError({
      code: "service_unavailable",
      httpStatus: 503,
      message:
        "Live scanning is currently unavailable in this environment. Please try again later.",
      retryable: true,
    });
  }

  const timeoutSeconds = Math.round(options.timeoutMs / 1_000);

  try {
    const response = await fetch(buildGatewayUrl(base, options.endpoint), {
      method: "POST",
      headers: buildGatewayHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(options.payload),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    return await mapUpstreamResponse(response, timeoutSeconds);
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    if (isTimeoutError(error)) {
      throw new GatewayError({
        code: "timeout",
        httpStatus: 504,
        message: `The scan timed out after ${timeoutSeconds} seconds. Please try again.`,
        retryable: true,
      });
    }
    throw new GatewayError({
      code: "service_unavailable",
      httpStatus: 503,
      message:
        "Could not reach the scanning service right now. Please check readiness and try again.",
      retryable: true,
    });
  }
}
