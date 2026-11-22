import { FIVE_MIB, TWENTY_FIVE_MIB } from "./catalog.ts";
import type {
  DetectedContentKind,
  FileClassificationInput,
  FileScannerSlug,
  FileSignatureResult,
} from "./types.ts";

export const BOUNDED_SIGNATURE_SLICE_BYTES = 65_536;

const DETECTED_LABELS: Record<FileScannerSlug, string> = {
  email: "Email Message (.eml)",
  office: "Office / RTF Document",
  pdf: "PDF Document (.pdf)",
  exe: "Windows PE Binary (.exe / .dll / .sys)",
};

const EXPECTED_SCANNER_NAMES: Record<FileScannerSlug, string> = {
  email: "Email (.eml)",
  office: "Office Document",
  pdf: "PDF Document",
  exe: "Windows Executable",
};

const EXTENSION_TO_SLUG: Record<string, FileScannerSlug> = {
  ".eml": "email",
  ".pdf": "pdf",
  ".exe": "exe",
  ".dll": "exe",
  ".sys": "exe",
  ".docx": "office",
  ".docm": "office",
  ".xlsx": "office",
  ".xlsm": "office",
  ".pptx": "office",
  ".pptm": "office",
  ".doc": "office",
  ".xls": "office",
  ".ppt": "office",
  ".rtf": "office",
};

const CANONICAL_EMAIL_HEADERS = new Set([
  "from",
  "to",
  "subject",
  "date",
  "message-id",
  "mime-version",
  "return-path",
  "received",
  "reply-to",
  "content-type",
  "cc",
  "bcc",
  "sender",
  "delivered-to",
  "authentication-results",
  "dkim-signature",
  "arc-authentication-results",
]);

const EMAIL_TRANSPORT_HEADERS = new Set([
  "to",
  "return-path",
  "received",
  "message-id",
  "delivered-to",
  "authentication-results",
  "dkim-signature",
  "reply-to",
]);

const OOXML_ENTRY_PREFIXES = [
  "[content_types].xml",
  "_rels/",
  "word/",
  "xl/",
  "ppt/",
  "docprops/",
  "customxml/",
] as const;

function startsWithBytes(
  bytes: Uint8Array,
  prefix: readonly number[],
): boolean {
  if (bytes.byteLength < prefix.length) return false;
  for (let i = 0; i < prefix.length; i += 1) {
    if (bytes[i] !== prefix[i]) return false;
  }
  return true;
}

function isScannerSlug(kind: DetectedContentKind): kind is FileScannerSlug {
  return (
    kind === "email" || kind === "office" || kind === "pdf" || kind === "exe"
  );
}

function describeDetectedKind(kind: DetectedContentKind): string {
  switch (kind) {
    case "email":
      return DETECTED_LABELS.email;
    case "office":
      return DETECTED_LABELS.office;
    case "pdf":
      return DETECTED_LABELS.pdf;
    case "exe":
      return DETECTED_LABELS.exe;
    case "generic-zip":
      return "generic ZIP archive (non-Office)";
    case "image":
      return "image file (PNG / JPEG / GIF / WebP)";
    case "archive":
      return "compressed archive";
    case "executable-other":
      return "non-Windows executable binary (ELF / Mach-O)";
    case "text-unstructured":
      return "plain text or source file";
    case "polyglot":
      return "conflicting multi-format signatures";
    case "unknown":
      return "unrecognized binary data";
  }
}

export function extractClaimedExtension(filename: string): {
  claimedExtension: string | null;
  isExtensionless: boolean;
} {
  const base = (filename.split(/[\\/]/).pop() ?? "").trim();
  if (!base) {
    return { claimedExtension: null, isExtensionless: true };
  }
  const dotIdx = base.lastIndexOf(".");
  if (dotIdx <= 0 || dotIdx === base.length - 1) {
    return { claimedExtension: null, isExtensionless: true };
  }
  return {
    claimedExtension: base.slice(dotIdx).toLowerCase(),
    isExtensionless: false,
  };
}

function isMachOMagic(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4) return false;
  const b0 = bytes[0];
  const b1 = bytes[1];
  const b2 = bytes[2];
  const b3 = bytes[3];
  return (
    (b0 === 0xfe && b1 === 0xed && b2 === 0xfa && (b3 === 0xce || b3 === 0xcf)) ||
    ((b0 === 0xce || b0 === 0xcf) && b1 === 0xfa && b2 === 0xed && b3 === 0xfe) ||
    (b0 === 0xca && b1 === 0xfe && b2 === 0xba && b3 === 0xbe)
  );
}

function hasLeadingExecutableMagic(bytes: Uint8Array): boolean {
  return (
    startsWithBytes(bytes, [0x4d, 0x5a]) ||
    startsWithBytes(bytes, [0x7f, 0x45, 0x4c, 0x46]) ||
    isMachOMagic(bytes)
  );
}

function isValidPeBinary(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 64) return false;
  if (bytes[0] !== 0x4d || bytes[1] !== 0x5a) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const peOffset = view.getUint32(0x3c, true);
  if (peOffset < 0x40 || peOffset + 4 > bytes.byteLength) return false;
  return (
    bytes[peOffset] === 0x50 &&
    bytes[peOffset + 1] === 0x45 &&
    bytes[peOffset + 2] === 0x00 &&
    bytes[peOffset + 3] === 0x00
  );
}

function isOoxmlEntryPath(rawName: string): boolean {
  const normalized = rawName.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
  return OOXML_ENTRY_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(prefix),
  );
}

function inspectZipContainer(
  prefixBytes: Uint8Array,
  tailBytes?: Uint8Array,
): "office" | "generic-zip" {
  const decoder = new TextDecoder("latin1");
  const cdSource = tailBytes ?? prefixBytes;
  const cdView = new DataView(
    cdSource.buffer,
    cdSource.byteOffset,
    cdSource.byteLength,
  );

  // 1. Validate End of Central Directory (PK\x05\x06) structurally and walk Central Directory sequentially
  let cdStart = -1;
  let cdEnd = -1;
  for (
    let i = cdSource.byteLength - 22;
    i >= Math.max(0, cdSource.byteLength - 65_558);
    i -= 1
  ) {
    if (
      cdSource[i] === 0x50 &&
      cdSource[i + 1] === 0x4b &&
      cdSource[i + 2] === 0x05 &&
      cdSource[i + 3] === 0x06
    ) {
      const commentLen = cdView.getUint16(i + 20, true);
      if (i + 22 + commentLen !== cdSource.byteLength) {
        continue;
      }
      const cdSize = cdView.getUint32(i + 12, true);
      if (
        cdSize > 0 &&
        cdSize <= i &&
        cdSource[i - cdSize] === 0x50 &&
        cdSource[i - cdSize + 1] === 0x4b &&
        cdSource[i - cdSize + 2] === 0x01 &&
        cdSource[i - cdSize + 3] === 0x02
      ) {
        cdStart = i - cdSize;
        cdEnd = i;
      }
      break;
    }
  }

  if (cdStart !== -1 && cdEnd > cdStart) {
    let pos = cdStart;
    let cdChecked = 0;
    while (pos + 46 <= cdEnd && cdChecked < 512) {
      if (
        cdSource[pos] !== 0x50 ||
        cdSource[pos + 1] !== 0x4b ||
        cdSource[pos + 2] !== 0x01 ||
        cdSource[pos + 3] !== 0x02
      ) {
        break;
      }
      const nameLen = cdView.getUint16(pos + 28, true);
      const extraLen = cdView.getUint16(pos + 30, true);
      const commentLen = cdView.getUint16(pos + 32, true);
      const entryEnd = pos + 46 + nameLen + extraLen + commentLen;
      if (nameLen === 0 || nameLen > 512 || entryEnd > cdEnd) {
        break;
      }
      const name = decoder.decode(
        cdSource.subarray(pos + 46, pos + 46 + nameLen),
      );
      if (isOoxmlEntryPath(name)) {
        return "office";
      }
      cdChecked += 1;
      pos = entryEnd;
    }
  }

  // 2. Bounded Local File Header (PK\x03\x04) walk in prefixBytes (up to 32 headers)
  const localView = new DataView(
    prefixBytes.buffer,
    prefixBytes.byteOffset,
    prefixBytes.byteLength,
  );
  let pos = 0;
  let localChecked = 0;
  while (pos + 30 <= prefixBytes.byteLength && localChecked < 32) {
    if (
      prefixBytes[pos] !== 0x50 ||
      prefixBytes[pos + 1] !== 0x4b ||
      prefixBytes[pos + 2] !== 0x03 ||
      prefixBytes[pos + 3] !== 0x04
    ) {
      break;
    }
    const flags = localView.getUint16(pos + 6, true);
    const compSize = localView.getUint32(pos + 18, true);
    const nameLen = localView.getUint16(pos + 26, true);
    const extraLen = localView.getUint16(pos + 28, true);
    if (nameLen === 0 || nameLen > 512 || pos + 30 + nameLen > prefixBytes.byteLength) {
      break;
    }
    const name = decoder.decode(
      prefixBytes.subarray(pos + 30, pos + 30 + nameLen),
    );
    if (isOoxmlEntryPath(name)) {
      return "office";
    }
    localChecked += 1;

    const headerEnd = pos + 30 + nameLen + extraLen;
    if ((flags & 0x0008) !== 0 && compSize === 0) {
      // Data descriptor present: scan forward for next PK\x03\x04 in prefixBytes
      let nextPos = -1;
      for (let scan = headerEnd; scan + 30 <= prefixBytes.byteLength; scan += 1) {
        if (
          prefixBytes[scan] === 0x50 &&
          prefixBytes[scan + 1] === 0x4b &&
          prefixBytes[scan + 2] === 0x03 &&
          prefixBytes[scan + 3] === 0x04
        ) {
          nextPos = scan;
          break;
        }
      }
      if (nextPos === -1) break;
      pos = nextPos;
    } else if (compSize === 0xffffffff || headerEnd + compSize > prefixBytes.byteLength) {
      break;
    } else {
      pos = headerEnd + compSize;
    }
  }

  return "generic-zip";
}

function isImageBytes(bytes: Uint8Array): boolean {
  if (
    startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
    startsWithBytes(bytes, [0xff, 0xd8, 0xff]) ||
    startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38])
  ) {
    return true;
  }
  if (
    bytes.byteLength >= 12 &&
    startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }
  return false;
}

function isArchiveBytes(bytes: Uint8Array): boolean {
  return (
    startsWithBytes(bytes, [0x1f, 0x8b]) ||
    startsWithBytes(bytes, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) ||
    startsWithBytes(bytes, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]) ||
    startsWithBytes(bytes, [0x50, 0x4b, 0x05, 0x06])
  );
}

function inspectTextHeaders(bytes: Uint8Array): {
  isEmail: boolean;
  isMhtmlOffice: boolean;
  headerSeparatorOffset: number;
} {
  const checkLen = Math.min(bytes.byteLength, 4096);
  for (let i = 0; i < checkLen; i += 1) {
    if (bytes[i] === 0x00) {
      return { isEmail: false, isMhtmlOffice: false, headerSeparatorOffset: -1 };
    }
  }

  if (
    hasLeadingExecutableMagic(bytes) ||
    startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWithBytes(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) ||
    isImageBytes(bytes) ||
    isArchiveBytes(bytes)
  ) {
    return { isEmail: false, isMhtmlOffice: false, headerSeparatorOffset: -1 };
  }

  const textSlice = new TextDecoder("latin1")
    .decode(bytes.subarray(0, Math.min(bytes.byteLength, 16_384)))
    .replace(/^\uFEFF/, "");

  if (textSlice.trimStart().startsWith("{\\rtf")) {
    return { isEmail: false, isMhtmlOffice: false, headerSeparatorOffset: -1 };
  }

  const sepMatch = /\r?\n\r?\n/.exec(textSlice);
  const headerSeparatorOffset = sepMatch ? sepMatch.index : -1;
  const rawHeaderBlock =
    headerSeparatorOffset !== -1
      ? textSlice.slice(0, Math.min(headerSeparatorOffset, 8192))
      : textSlice.slice(0, 8192);

  // Leading %PDF- before any RFC-5322 headers disqualifies email/MHTML
  if (rawHeaderBlock.trimStart().startsWith("%PDF-")) {
    return { isEmail: false, isMhtmlOffice: false, headerSeparatorOffset };
  }

  const rawLines = rawHeaderBlock.split(/\r?\n/).slice(0, 48);
  const parsedHeaders: Array<{ name: string; value: string }> = [];

  for (let i = 0; i < rawLines.length; i += 1) {
    const line = rawLines[i] ?? "";
    if (!line.trim()) break;
    if (i === 0 && /^From\s+\S+/i.test(line.trim())) {
      continue;
    }
    if (/^[ \t]+/.test(line)) {
      if (parsedHeaders.length === 0) {
        return { isEmail: false, isMhtmlOffice: false, headerSeparatorOffset };
      }
      const last = parsedHeaders[parsedHeaders.length - 1];
      if (last) {
        last.value += " " + line.trim();
      }
      continue;
    }
    const match = /^([A-Za-z0-9!#$%&'*+\-.^_`|~]{2,64}):(?:[ \t]+(.*))?$/.exec(
      line,
    );
    if (!match) {
      return { isEmail: false, isMhtmlOffice: false, headerSeparatorOffset };
    }
    const name = (match[1] ?? "").toLowerCase();
    const value = (match[2] ?? "").trim();
    // Reject URL schemes like https://example.com where match[2] wasn't separated by space
    if (line.slice(name.length + 1).startsWith("//")) {
      return { isEmail: false, isMhtmlOffice: false, headerSeparatorOffset };
    }
    parsedHeaders.push({ name, value });
  }

  if (parsedHeaders.length === 0) {
    return { isEmail: false, isMhtmlOffice: false, headerSeparatorOffset };
  }

  const headerNames = new Set(parsedHeaders.map((h) => h.name));
  const canonicalCount = parsedHeaders.filter((h) =>
    CANONICAL_EMAIL_HEADERS.has(h.name),
  ).length;
  const hasTransportHeader = parsedHeaders.some((h) =>
    EMAIL_TRANSPORT_HEADERS.has(h.name),
  );

  const hasMimeHeader =
    headerNames.has("mime-version") ||
    parsedHeaders.some(
      (h) =>
        h.name === "content-type" &&
        h.value.toLowerCase().includes("multipart/related"),
    );
  const hasOfficeMimeMarkers =
    headerNames.has("x-mimeole") ||
    /urn:schemas-microsoft-com:office:|progid=["']?word\.|application\/msword/i.test(
      textSlice.slice(0, 4096),
    );

  if (hasMimeHeader && hasOfficeMimeMarkers && !hasTransportHeader) {
    return { isEmail: false, isMhtmlOffice: true, headerSeparatorOffset };
  }

  const hasCoreIdentityHeader =
    headerNames.has("from") ||
    headerNames.has("subject") ||
    headerNames.has("received") ||
    headerNames.has("message-id") ||
    headerNames.has("return-path");

  const isEmail =
    canonicalCount >= 2 ||
    (canonicalCount >= 1 && parsedHeaders.length >= 2 && hasCoreIdentityHeader);

  return { isEmail, isMhtmlOffice: false, headerSeparatorOffset };
}

function looksLikePrintableText(bytes: Uint8Array): boolean {
  const sampleLen = Math.min(bytes.byteLength, 2048);
  if (sampleLen === 0) return false;
  let printable = 0;
  for (let i = 0; i < sampleLen; i += 1) {
    const b = bytes[i] ?? 0;
    if (b === 0x00) return false;
    if (b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e) || b >= 0x80) {
      printable += 1;
    }
  }
  return printable / sampleLen >= 0.85;
}

export function classifyFileBytes(
  input: FileClassificationInput,
): FileSignatureResult {
  const { filename, totalSizeBytes, prefixBytes, tailBytes, expectedSlug } = input;
  const { claimedExtension, isExtensionless } = extractClaimedExtension(filename);

  // Step 1: Empty / unreadable file guard
  if (totalSizeBytes <= 0 || prefixBytes.byteLength === 0) {
    return {
      ok: false,
      code: "validation_error",
      httpStatus: 400,
      message:
        "The selected file is empty (0 bytes). Choose a non-empty file and try again.",
      fieldError: "The selected file is empty (0 bytes).",
      claimedExtension,
      detectedKind: "unknown",
    };
  }

  // Step 2: Global upload cap (plus immediate 5 MiB cap when expectedSlug === "email")
  if (totalSizeBytes > TWENTY_FIVE_MIB) {
    return {
      ok: false,
      code: "payload_too_large",
      httpStatus: 413,
      message: "Files must be 25 MiB or smaller.",
      fieldError: "Files must be 25 MiB or smaller.",
      claimedExtension,
      detectedKind: "unknown",
    };
  }
  if (expectedSlug === "email" && totalSizeBytes > FIVE_MIB) {
    return {
      ok: false,
      code: "payload_too_large",
      httpStatus: 413,
      message: "Email (.eml) files must be 5 MiB or smaller.",
      fieldError: "Email (.eml) files must be 5 MiB or smaller.",
      claimedExtension,
      detectedKind: "email",
    };
  }

  // Step 3: Minimum prefix length & truncated ZIP guard
  if (
    prefixBytes.byteLength < 5 ||
    (startsWithBytes(prefixBytes, [0x50, 0x4b, 0x03, 0x04]) &&
      prefixBytes.byteLength < 30)
  ) {
    return {
      ok: false,
      code: "unsupported_content",
      httpStatus: 422,
      message: "File is too small or truncated to match a supported format.",
      fieldError: "File is too small or truncated to match a supported format.",
      claimedExtension,
      detectedKind: "unknown",
    };
  }

  // Step 4: Multi-family bounded signature inspection
  const isExe = isValidPeBinary(prefixBytes);
  const leadingExeMagic = hasLeadingExecutableMagic(prefixBytes);
  const textInfo = inspectTextHeaders(prefixBytes);

  const head1024 = new TextDecoder("latin1").decode(
    prefixBytes.subarray(0, Math.min(prefixBytes.byteLength, 1024)),
  );
  const pdfIdx = head1024.indexOf("%PDF-");
  const isPdf = pdfIdx !== -1 && !textInfo.isEmail;

  let zipKind: "office" | "generic-zip" | null = null;
  if (
    startsWithBytes(prefixBytes, [0x50, 0x4b, 0x03, 0x04]) &&
    prefixBytes.byteLength >= 30
  ) {
    zipKind = inspectZipContainer(prefixBytes, tailBytes);
  }

  const head4k = new TextDecoder("latin1")
    .decode(prefixBytes.subarray(0, Math.min(prefixBytes.byteLength, 4096)))
    .replace(/^\uFEFF/, "");
  const trimmedHead = head4k.trimStart();

  const isOle2 = startsWithBytes(prefixBytes, [
    0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
  ]);
  const isOneNote = startsWithBytes(prefixBytes, [
    0xe4, 0x52, 0x5c, 0x7b, 0x8c, 0xd8, 0xa7, 0x4d, 0xae, 0xb1, 0x53, 0x78,
    0xd0, 0x29, 0x96, 0xd3,
  ]);
  const isRtf = trimmedHead.startsWith("{\\rtf");
  const isOfficeXml =
    trimmedHead.startsWith("<w:wordDocument") ||
    trimmedHead.startsWith("<Workbook") ||
    (trimmedHead.startsWith("<?xml") &&
      /(?:<w:wordDocument|<Workbook|<pkg:package|schemas\.microsoft\.com\/office|urn:schemas-microsoft-com:office)/i.test(
        head4k,
      ));

  const isOffice =
    isOle2 ||
    isOneNote ||
    isRtf ||
    isOfficeXml ||
    textInfo.isMhtmlOffice ||
    zipKind === "office";

  const isEmail = textInfo.isEmail && !isOffice;

  const hasNonScannerBinaryContainer =
    zipKind === "generic-zip" ||
    isImageBytes(prefixBytes) ||
    isArchiveBytes(prefixBytes);

  const matchedFamilies: FileScannerSlug[] = [];
  if (isExe) matchedFamilies.push("exe");
  if (isPdf) matchedFamilies.push("pdf");
  if (isOffice) matchedFamilies.push("office");
  if (isEmail) matchedFamilies.push("email");

  // Short-circuit ONLY on polyglot conflicts
  if (
    matchedFamilies.length >= 2 ||
    (leadingExeMagic && (isPdf || isOffice || isEmail)) ||
    (hasNonScannerBinaryContainer && isPdf)
  ) {
    return {
      ok: false,
      code: "unsupported_content",
      httpStatus: 422,
      message:
        "Conflicting file format signatures detected — this file cannot be safely routed or scanned.",
      fieldError: "Conflicting file format signatures detected.",
      claimedExtension,
      detectedKind: "polyglot",
    };
  }

  let detectedKind: DetectedContentKind;
  if (matchedFamilies.length === 1 && matchedFamilies[0]) {
    detectedKind = matchedFamilies[0];
  } else if (zipKind === "generic-zip") {
    detectedKind = "generic-zip";
  } else if (isImageBytes(prefixBytes)) {
    detectedKind = "image";
  } else if (isArchiveBytes(prefixBytes)) {
    detectedKind = "archive";
  } else if (
    startsWithBytes(prefixBytes, [0x7f, 0x45, 0x4c, 0x46]) ||
    isMachOMagic(prefixBytes)
  ) {
    detectedKind = "executable-other";
  } else if (looksLikePrintableText(prefixBytes)) {
    detectedKind = "text-unstructured";
  } else {
    detectedKind = "unknown";
  }

  // Step 5: Extension mismatch check & unsupported-kind rejection
  if (claimedExtension !== null) {
    const expectedForExt = EXTENSION_TO_SLUG[claimedExtension];
    if (expectedForExt !== undefined && detectedKind !== expectedForExt) {
      const detectedDesc = describeDetectedKind(detectedKind);
      return {
        ok: false,
        code: "extension_mismatch",
        httpStatus: 422,
        message: `Extension mismatch: file is named ${claimedExtension}, but its content signature matches ${detectedDesc}. Vanguard AV blocks files whose content conflicts with their extension.`,
        fieldError: `Extension mismatch: ${claimedExtension} conflicts with detected ${detectedDesc}.`,
        claimedExtension,
        detectedKind,
      };
    }

    if (expectedForExt === undefined && isScannerSlug(detectedKind)) {
      const detectedDesc = DETECTED_LABELS[detectedKind];
      return {
        ok: false,
        code: "extension_mismatch",
        httpStatus: 422,
        message: `Extension mismatch: file is named ${claimedExtension}, but its content signature matches ${detectedDesc}. Rename or upload an unmodified file.`,
        fieldError: `Extension mismatch: ${claimedExtension} conflicts with detected ${detectedDesc}.`,
        claimedExtension,
        detectedKind,
      };
    }
  }

  if (!isScannerSlug(detectedKind)) {
    const detectedDesc = describeDetectedKind(detectedKind);
    return {
      ok: false,
      code: "unsupported_content",
      httpStatus: 422,
      message: `Unsupported file type (${detectedDesc}). Supported formats are Email (.eml), Microsoft Office / RTF documents, PDF documents (.pdf), and Windows PE binaries (.exe, .dll, .sys).`,
      fieldError: `Unsupported file format (${detectedDesc}).`,
      claimedExtension,
      detectedKind,
    };
  }

  // Step 6: Expected scanner gate & capability byte ceiling
  if (expectedSlug !== undefined && expectedSlug !== detectedKind) {
    return {
      ok: false,
      code: "unsupported_content",
      httpStatus: 422,
      message: `File content matches ${DETECTED_LABELS[detectedKind]}, which cannot be scanned by the ${EXPECTED_SCANNER_NAMES[expectedSlug]} scanner.`,
      fieldError: `File content matches ${DETECTED_LABELS[detectedKind]}, not ${EXPECTED_SCANNER_NAMES[expectedSlug]}.`,
      claimedExtension,
      detectedKind,
    };
  }

  if (detectedKind === "email" && totalSizeBytes > FIVE_MIB) {
    return {
      ok: false,
      code: "payload_too_large",
      httpStatus: 413,
      message: "Email (.eml) files must be 5 MiB or smaller.",
      fieldError: "Email (.eml) files must be 5 MiB or smaller.",
      claimedExtension,
      detectedKind,
    };
  }

  return {
    ok: true,
    targetSlug: detectedKind,
    detectedLabel: DETECTED_LABELS[detectedKind],
    claimedExtension,
    isExtensionless,
  };
}

export async function inspectBrowserFileSignature(
  file: File,
  expectedSlug?: FileScannerSlug,
): Promise<FileSignatureResult> {
  const { claimedExtension } = extractClaimedExtension(file.name);
  try {
    const headEnd = Math.min(file.size, BOUNDED_SIGNATURE_SLICE_BYTES);
    const prefixBuffer = await file.slice(0, headEnd).arrayBuffer();
    const prefixBytes = new Uint8Array(prefixBuffer);

    let tailBytes: Uint8Array | undefined;
    if (
      file.size > BOUNDED_SIGNATURE_SLICE_BYTES &&
      startsWithBytes(prefixBytes, [0x50, 0x4b, 0x03, 0x04])
    ) {
      const tailStart = Math.max(0, file.size - BOUNDED_SIGNATURE_SLICE_BYTES);
      const tailBuffer = await file.slice(tailStart, file.size).arrayBuffer();
      tailBytes = new Uint8Array(tailBuffer);
    }

    return classifyFileBytes({
      filename: file.name,
      totalSizeBytes: file.size,
      prefixBytes,
      tailBytes,
      expectedSlug,
    });
  } catch {
    return {
      ok: false,
      code: "validation_error",
      httpStatus: 400,
      message:
        "Unable to read the selected file. Make sure you chose a readable file, not a folder.",
      fieldError: "Unable to read the selected file.",
      claimedExtension,
      detectedKind: "unknown",
    };
  }
}
