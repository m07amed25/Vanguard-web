import { randomUUID } from "node:crypto";
import type {
  ScanErrorCode,
  ScanErrorResponse,
  ScanOutcome,
} from "../types.ts";
import { GatewayError } from "./gateway-client.ts";
import { healthRateLimiter, scanRateLimiter } from "./rate-limit.ts";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
} as const;

export function privateJsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const headers = new Headers(PRIVATE_NO_STORE_HEADERS);
  if (init.headers) {
    for (const [k, v] of Object.entries(init.headers)) {
      headers.set(k, v);
    }
  }
  return Response.json(body, {
    status: init.status ?? 200,
    headers,
  });
}

export function scanSuccessResponse(outcome: ScanOutcome): Response {
  return privateJsonResponse(outcome, { status: 200 });
}

export function scanErrorResponse(options: {
  status: number;
  code: ScanErrorCode;
  message: string;
  retryable: boolean;
  fieldErrors?: Record<string, string>;
  retryAfterSeconds?: number;
  diagnosticId?: string;
}): Response {
  const diagnosticId = options.diagnosticId ?? randomUUID();
  const payload: ScanErrorResponse = {
    status: "failed",
    code: options.code,
    message: options.message,
    retryable: options.retryable,
    diagnosticId,
    ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
    ...(options.retryAfterSeconds !== undefined
      ? { retryAfterSeconds: options.retryAfterSeconds }
      : {}),
  };

  const extraHeaders: Record<string, string> = {};
  if (options.retryAfterSeconds !== undefined) {
    extraHeaders["Retry-After"] = String(options.retryAfterSeconds);
  }

  return privateJsonResponse(payload, {
    status: options.status,
    headers: extraHeaders,
  });
}

function normalizeVisitorHeaderValue(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, 128);
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveVisitorKey(request: Request): string {
  const pinnedHeader = process.env.TRUSTED_PROXY_HEADER?.trim().toLowerCase();
  if (pinnedHeader) {
    const pinnedRaw = request.headers.get(pinnedHeader);
    if (pinnedRaw) {
      const parts = pinnedRaw
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      const candidate = normalizeVisitorHeaderValue(parts[parts.length - 1]);
      if (candidate) return candidate;
    }
    return "local-visitor";
  }

  const vercelForwarded = request.headers.get("x-vercel-forwarded-for");
  if (vercelForwarded) {
    const parts = vercelForwarded
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const candidate = normalizeVisitorHeaderValue(parts[parts.length - 1]);
    if (candidate) return candidate;
  }

  const cfIp = normalizeVisitorHeaderValue(
    request.headers.get("cf-connecting-ip"),
  );
  if (cfIp) return cfIp;

  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const rightmost = normalizeVisitorHeaderValue(parts[parts.length - 1]);
    if (rightmost) return rightmost;
  }

  const realIp = normalizeVisitorHeaderValue(request.headers.get("x-real-ip"));
  if (realIp) return realIp;

  return "local-visitor";
}

export function enforceScanRateLimit(request: Request): Response | null {
  const visitorKey = resolveVisitorKey(request);
  const decision = scanRateLimiter.consume(visitorKey);
  if (decision.allowed) return null;

  return scanErrorResponse({
    status: 429,
    code: "rate_limited",
    message: `You have reached the temporary scan limit (20 scans per minute). Please wait ${decision.retryAfterSeconds} seconds and try again.`,
    retryable: true,
    retryAfterSeconds: decision.retryAfterSeconds,
  });
}

export function enforceHealthRateLimit(request: Request): Response | null {
  const visitorKey = resolveVisitorKey(request);
  const decision = healthRateLimiter.consume(visitorKey);
  if (decision.allowed) return null;

  return scanErrorResponse({
    status: 429,
    code: "rate_limited",
    message:
      "Too many health status checks. Wait a moment and try again (limit: 12 per minute).",
    retryable: true,
    retryAfterSeconds: decision.retryAfterSeconds,
  });
}

export function handleRouteError(error: unknown): Response {
  if (error instanceof GatewayError) {
    return scanErrorResponse({
      status: error.httpStatus,
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    });
  }

  return scanErrorResponse({
    status: 502,
    code: "upstream_error",
    message:
      "We could not complete this scan right now. Please try again in a moment.",
    retryable: true,
  });
}

export function sanitizeDisplayFilename(
  rawName: string | null | undefined,
  fallback: string,
): string {
  if (!rawName) return fallback;
  const base = rawName.split(/[\\/]/).pop() ?? fallback;
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!cleaned) return fallback;
  if (cleaned.length <= 180) return cleaned;

  const dotIdx = cleaned.lastIndexOf(".");
  if (dotIdx > 0 && dotIdx < cleaned.length - 1 && cleaned.length - dotIdx <= 16) {
    const ext = cleaned.slice(dotIdx);
    const stem = cleaned.slice(0, Math.max(1, 180 - ext.length));
    return `${stem}${ext}`;
  }
  return cleaned.slice(0, 180);
}
