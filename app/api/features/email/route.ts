import { FIVE_MIB, SINGLE_SCAN_TIMEOUT_MS } from "@/lib/features/catalog";
import { validateEmailBytes } from "@/lib/features/server/file-validation";
import { postGatewayFile } from "@/lib/features/server/gateway-client";
import { mapEmailResponse } from "@/lib/features/server/mappers";
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
      message: "Could not read the uploaded email form data. Select your .eml file and try again.",
      retryable: false,
    });
  }

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    return scanErrorResponse({
      status: 400,
      code: "validation_error",
      message: "Choose a raw .eml file (up to 5 MiB) to scan.",
      fieldErrors: { file: "An .eml file is required." },
      retryable: false,
    });
  }

  if (fileEntry.size > FIVE_MIB) {
    return scanErrorResponse({
      status: 413,
      code: "payload_too_large",
      message: "Email files must be 5 MiB or smaller.",
      fieldErrors: { file: "File exceeds the 5 MiB upload limit." },
      retryable: false,
    });
  }

  const filename = sanitizeDisplayFilename(fileEntry.name, "message.eml");
  const bytes = new Uint8Array(await fileEntry.arrayBuffer());
  const validation = validateEmailBytes(bytes, filename);
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
      endpoint: "email",
      fileBytes: bytes,
      filename,
      contentType: fileEntry.type || "message/rfc822",
      timeoutMs: SINGLE_SCAN_TIMEOUT_MS,
    });

    const outcome = mapEmailResponse(upstream, {
      filename,
      sizeBytes: bytes.byteLength,
    });
    return scanSuccessResponse(outcome);
  } catch (error) {
    return handleRouteError(error);
  }
}
