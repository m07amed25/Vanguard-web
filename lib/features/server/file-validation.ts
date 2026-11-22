import { classifyFileBytes } from "../file-signature.ts";
import type { FileScannerSlug } from "../types.ts";

export type FileValidationResult =
  | { ok: true }
  | {
      ok: false;
      code: "validation_error" | "payload_too_large" | "unsupported_content";
      httpStatus: number;
      message: string;
      fieldErrors?: Record<string, string>;
    };

export interface ValidatedExeOptions {
  operatingPoint: "fpr_1pct" | "fpr_0.1pct";
  threshold: number | null;
  modelType: "hybrid" | "gbdt" | "both";
  deepInspection: boolean;
}

export interface ValidatedPdfOptions {
  threshold: number;
  estimator: "ensemble" | "rf" | "et" | "lr" | "lgbm";
  deepInspection: boolean;
  includeFeatures: boolean;
}

export type OptionValidationResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: "validation_error";
      httpStatus: 400;
      message: string;
      fieldErrors: Record<string, string>;
    };

function parseBoolOption(
  raw: string | null | undefined,
  defaultValue: boolean,
): boolean {
  if (raw === undefined || raw === null || raw === "") return defaultValue;
  return raw.toLowerCase() !== "false";
}

function validateScannerFileBytes(
  bytes: Uint8Array,
  expectedSlug: FileScannerSlug,
  filename = "",
): FileValidationResult {
  const result = classifyFileBytes({
    filename,
    totalSizeBytes: bytes.byteLength,
    prefixBytes: bytes,
    tailBytes: bytes,
    expectedSlug,
  });

  if (result.ok) {
    return { ok: true };
  }

  return {
    ok: false,
    code:
      result.code === "extension_mismatch"
        ? "unsupported_content"
        : result.code,
    httpStatus: result.httpStatus,
    message: result.message,
    fieldErrors: { file: result.fieldError },
  };
}

export function validateEmailBytes(
  bytes: Uint8Array,
  filename?: string,
): FileValidationResult {
  return validateScannerFileBytes(bytes, "email", filename);
}

export function validateExeBytes(
  bytes: Uint8Array,
  filename?: string,
): FileValidationResult {
  return validateScannerFileBytes(bytes, "exe", filename);
}

export function validateOfficeBytes(
  bytes: Uint8Array,
  filename?: string,
): FileValidationResult {
  return validateScannerFileBytes(bytes, "office", filename);
}

export function validatePdfBytes(
  bytes: Uint8Array,
  filename?: string,
): FileValidationResult {
  return validateScannerFileBytes(bytes, "pdf", filename);
}

export function validateExeOptions(raw: {
  operatingPoint?: string | null;
  threshold?: string | null;
  modelType?: string | null;
  deepInspection?: string | null;
}): OptionValidationResult<ValidatedExeOptions> {
  const fieldErrors: Record<string, string> = {};

  const operatingPoint = (raw.operatingPoint?.trim() || "fpr_1pct") as
    | "fpr_1pct"
    | "fpr_0.1pct";
  if (operatingPoint !== "fpr_1pct" && operatingPoint !== "fpr_0.1pct") {
    fieldErrors.operatingPoint =
      "Select either balanced (1% false-alarm target) or strict (0.1% false-alarm target) sensitivity.";
  }

  const modelType = (raw.modelType?.trim() || "both") as
    | "hybrid"
    | "gbdt"
    | "both";
  if (modelType !== "hybrid" && modelType !== "gbdt" && modelType !== "both") {
    fieldErrors.modelType =
      "Select combined, byte-sequence pattern, or structural attribute analysis.";
  }

  let threshold: number | null = null;
  if (
    raw.threshold !== undefined &&
    raw.threshold !== null &&
    raw.threshold.trim() !== ""
  ) {
    const parsed = Number(raw.threshold.trim());
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      fieldErrors.threshold =
        "Custom threshold must be a number between 0 and 1.";
    } else {
      threshold = parsed;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      code: "validation_error",
      httpStatus: 400,
      message: Object.values(fieldErrors)[0] ?? "Check the advanced options.",
      fieldErrors,
    };
  }

  return {
    ok: true,
    data: {
      operatingPoint,
      threshold,
      modelType,
      deepInspection: parseBoolOption(raw.deepInspection, true),
    },
  };
}

export function validatePdfOptions(raw: {
  threshold?: string | null;
  estimator?: string | null;
  deepInspection?: string | null;
  includeFeatures?: string | null;
}): OptionValidationResult<ValidatedPdfOptions> {
  const fieldErrors: Record<string, string> = {};

  let threshold = 0.5;
  if (
    raw.threshold !== undefined &&
    raw.threshold !== null &&
    raw.threshold.trim() !== ""
  ) {
    const parsed = Number(raw.threshold.trim());
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      fieldErrors.threshold =
        "Custom threshold must be a number between 0 and 1.";
    } else {
      threshold = parsed;
    }
  }

  const estimator = (raw.estimator?.trim() || "ensemble") as
    | "ensemble"
    | "rf"
    | "et"
    | "lr"
    | "lgbm";
  if (!["ensemble", "rf", "et", "lr", "lgbm"].includes(estimator)) {
    fieldErrors.estimator =
      "Choose a supported PDF evaluation mode (ensemble, rf, et, lr, or lgbm).";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      code: "validation_error",
      httpStatus: 400,
      message: Object.values(fieldErrors)[0] ?? "Check the advanced options.",
      fieldErrors,
    };
  }

  return {
    ok: true,
    data: {
      threshold,
      estimator,
      deepInspection: parseBoolOption(raw.deepInspection, true),
      includeFeatures: parseBoolOption(raw.includeFeatures, false),
    },
  };
}
