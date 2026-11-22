import {
  SINGLE_SCAN_TIMEOUT_MS,
  TWENTY_FIVE_MIB,
} from "@/lib/features/catalog";
import { validateOfficeBytes } from "@/lib/features/server/file-validation";
import { postGatewayFile } from "@/lib/features/server/gateway-client";
import { mapOfficeResponse } from "@/lib/features/server/mappers";
import {
  enforceScanRateLimit,
  handleRouteError,
  sanitizeDisplayFilename,
  scanErrorResponse,
  scanSuccessResponse,
} from "@/lib/features/server/route-helpers";

export const maxDuration = 35;

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
      message: "Could not read the uploaded Office document. Select a file and try again.",
      retryable: false,
    });
  }

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    return scanErrorResponse({
      status: 400,
      code: "validation_error",
      message: "Choose a supported Microsoft Office or RTF document (up to 25 MiB) to scan.",
      fieldErrors: { file: "An Office document file is required." },
      retryable: false,
    });
  }

  if (fileEntry.size > TWENTY_FIVE_MIB) {
    return scanErrorResponse({
      status: 413,
      code: "payload_too_large",
      message: "Office documents must be 25 MiB or smaller.",
      fieldErrors: { file: "File exceeds the 25 MiB upload limit." },
      retryable: false,
    });
  }

  const filename = sanitizeDisplayFilename(fileEntry.name, "document.docx");
  const bytes = new Uint8Array(await fileEntry.arrayBuffer());
  const validation = validateOfficeBytes(bytes, filename);
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
      endpoint: "office",
      fileBytes: bytes,
      filename,
      contentType: fileEntry.type || "application/octet-stream",
      timeoutMs: SINGLE_SCAN_TIMEOUT_MS,
    });

    const outcome = mapOfficeResponse(upstream, {
      filename,
      sizeBytes: bytes.byteLength,
    });
    return scanSuccessResponse(outcome);
  } catch (error) {
    return handleRouteError(error);
  }
}
