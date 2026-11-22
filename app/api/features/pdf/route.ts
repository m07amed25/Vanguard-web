import {
  SINGLE_SCAN_TIMEOUT_MS,
  TWENTY_FIVE_MIB,
} from "@/lib/features/catalog";
import {
  validatePdfBytes,
  validatePdfOptions,
} from "@/lib/features/server/file-validation";
import { postGatewayFile } from "@/lib/features/server/gateway-client";
import { mapPdfResponse } from "@/lib/features/server/mappers";
import {
  enforceScanRateLimit,
  handleRouteError,
  sanitizeDisplayFilename,
  scanErrorResponse,
  scanSuccessResponse,
} from "@/lib/features/server/route-helpers";

export const maxDuration = 35;

function readFormString(formData: FormData, key: string): string | null {
  const val = formData.get(key);
  return typeof val === "string" ? val : null;
}

export async function POST(request: Request) {
  const rateLimited = enforceScanRateLimit(request);
  if (rateLimited) return rateLimited;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return scanErrorResponse({
      status: 400,
      code: "validation_error",
      message: "Could not read the uploaded PDF form data. Select a PDF file and try again.",
      retryable: false,
    });
  }

  const optionsCheck = validatePdfOptions({
    threshold: readFormString(formData, "threshold"),
    estimator: readFormString(formData, "estimator"),
    deepInspection: readFormString(formData, "deepInspection"),
    includeFeatures: readFormString(formData, "includeFeatures"),
  });
  if (!optionsCheck.ok) {
    return scanErrorResponse({
      status: optionsCheck.httpStatus,
      code: optionsCheck.code,
      message: optionsCheck.message,
      fieldErrors: optionsCheck.fieldErrors,
      retryable: false,
    });
  }

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    return scanErrorResponse({
      status: 400,
      code: "validation_error",
      message: "Choose a PDF document (up to 25 MiB) to scan.",
      fieldErrors: { file: "A .pdf file is required." },
      retryable: false,
    });
  }

  if (fileEntry.size > TWENTY_FIVE_MIB) {
    return scanErrorResponse({
      status: 413,
      code: "payload_too_large",
      message: "PDF files must be 25 MiB or smaller.",
      fieldErrors: { file: "File exceeds the 25 MiB upload limit." },
      retryable: false,
    });
  }

  const filename = sanitizeDisplayFilename(fileEntry.name, "document.pdf");
  const bytes = new Uint8Array(await fileEntry.arrayBuffer());
  const validation = validatePdfBytes(bytes, filename);
  if (!validation.ok) {
    return scanErrorResponse({
      status: validation.httpStatus,
      code: validation.code,
      message: validation.message,
      fieldErrors: validation.fieldErrors,
      retryable: false,
    });
  }

  try {
    const upstream = await postGatewayFile({
      endpoint: "pdf",
      fileBytes: bytes,
      filename,
      contentType: fileEntry.type || "application/pdf",
      queryParams: {
        threshold: optionsCheck.data.threshold,
        estimator: optionsCheck.data.estimator,
        deep_inspection: optionsCheck.data.deepInspection,
        include_features: optionsCheck.data.includeFeatures,
      },
      timeoutMs: SINGLE_SCAN_TIMEOUT_MS,
    });

    const outcome = mapPdfResponse(upstream, {
      filename,
      sizeBytes: bytes.byteLength,
      deepInspection: optionsCheck.data.deepInspection,
    });
    return scanSuccessResponse(outcome);
  } catch (error) {
    return handleRouteError(error);
  }
}
