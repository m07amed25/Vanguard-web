import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyFileBytes } from "../../lib/features/file-signature.ts";

function buildPeStub(): Uint8Array {
  const bytes = new Uint8Array(128);
  bytes[0] = 0x4d; // M
  bytes[1] = 0x5a; // Z
  bytes[0x3c] = 0x40;
  bytes[0x40] = 0x50; // P
  bytes[0x41] = 0x45; // E
  bytes[0x42] = 0x00;
  bytes[0x43] = 0x00;
  return bytes;
}

function buildZipArchive(
  entries: Array<{ name: string; data?: Uint8Array; useDataDescriptor?: boolean }>,
): Uint8Array {
  const enc = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const cdChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const body = entry.data ?? new Uint8Array([0x3c, 0x61, 0x2f, 0x3e]);
    const localHeader = new Uint8Array(30 + nameBytes.length + body.length);
    const view = new DataView(localHeader.buffer);
    // Local file header signature PK\x03\x04
    localHeader[0] = 0x50;
    localHeader[1] = 0x4b;
    localHeader[2] = 0x03;
    localHeader[3] = 0x04;
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, entry.useDataDescriptor ? 0x0008 : 0x0000, true); // flags
    view.setUint16(8, 0, true); // compression method (store)
    view.setUint32(18, entry.useDataDescriptor ? 0 : body.length, true); // compressed size
    view.setUint32(22, entry.useDataDescriptor ? 0 : body.length, true); // uncompressed size
    view.setUint16(26, nameBytes.length, true); // file name length
    view.setUint16(28, 0, true); // extra field length
    localHeader.set(nameBytes, 30);
    localHeader.set(body, 30 + nameBytes.length);
    localChunks.push(localHeader);

    // Central Directory header PK\x01\x02 (46 bytes + filename)
    const cdHeader = new Uint8Array(46 + nameBytes.length);
    const cdView = new DataView(cdHeader.buffer);
    cdHeader[0] = 0x50;
    cdHeader[1] = 0x4b;
    cdHeader[2] = 0x01;
    cdHeader[3] = 0x02;
    cdView.setUint16(4, 20, true);
    cdView.setUint16(6, 20, true);
    cdView.setUint16(8, entry.useDataDescriptor ? 0x0008 : 0x0000, true);
    cdView.setUint16(10, 0, true);
    cdView.setUint32(20, body.length, true);
    cdView.setUint32(24, body.length, true);
    cdView.setUint16(28, nameBytes.length, true);
    cdView.setUint16(30, 0, true); // extra len
    cdView.setUint16(32, 0, true); // comment len
    cdView.setUint32(42, offset, true); // relative offset of local header
    cdHeader.set(nameBytes, 46);
    cdChunks.push(cdHeader);

    offset += localHeader.length;
  }

  const cdOffset = offset;
  const cdSize = cdChunks.reduce((sum, c) => sum + c.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocd[0] = 0x50;
  eocd[1] = 0x4b;
  eocd[2] = 0x05;
  eocd[3] = 0x06;
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, cdSize, true);
  eocdView.setUint32(16, cdOffset, true);

  const total = new Uint8Array(offset + cdSize + eocd.length);
  let pos = 0;
  for (const chunk of localChunks) {
    total.set(chunk, pos);
    pos += chunk.length;
  }
  for (const chunk of cdChunks) {
    total.set(chunk, pos);
    pos += chunk.length;
  }
  total.set(eocd, pos);
  return total;
}

describe("bounded non-decompressing file signature classifier", () => {
  it("rejects empty (0-byte), >25 MiB, <5-byte, <30-byte truncated PK\\x03\\x04, and bare PK\\x05\\x06 files", () => {
    const empty = classifyFileBytes({
      filename: "empty.pdf",
      totalSizeBytes: 0,
      prefixBytes: new Uint8Array(0),
    });
    assert.equal(empty.ok, false);
    if (!empty.ok) {
      assert.equal(empty.code, "validation_error");
      assert.equal(empty.httpStatus, 400);
    }

    const oversized = classifyFileBytes({
      filename: "huge.pdf",
      totalSizeBytes: 25 * 1024 * 1024 + 1,
      prefixBytes: new TextEncoder().encode("%PDF-1.7"),
    });
    assert.equal(oversized.ok, false);
    if (!oversized.ok) {
      assert.equal(oversized.code, "payload_too_large");
      assert.equal(oversized.httpStatus, 413);
    }

    const tiny = classifyFileBytes({
      filename: "tiny.bin",
      totalSizeBytes: 4,
      prefixBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    });
    assert.equal(tiny.ok, false);
    if (!tiny.ok) {
      assert.equal(tiny.code, "unsupported_content");
      assert.equal(tiny.httpStatus, 422);
    }

    const truncatedZip = classifyFileBytes({
      filename: "truncated.docx",
      totalSizeBytes: 6,
      prefixBytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]),
    });
    assert.equal(truncatedZip.ok, false);
    if (!truncatedZip.ok) {
      assert.equal(truncatedZip.code, "unsupported_content");
      assert.equal(truncatedZip.httpStatus, 422);
    }

    const bareEocd = new Uint8Array(22);
    bareEocd[0] = 0x50;
    bareEocd[1] = 0x4b;
    bareEocd[2] = 0x05;
    bareEocd[3] = 0x06;
    const bareZipRes = classifyFileBytes({
      filename: "empty.docx",
      totalSizeBytes: bareEocd.length,
      prefixBytes: bareEocd,
    });
    assert.equal(bareZipRes.ok, false);
  });

  it("classifies valid OOXML via Central Directory (including flags & 0x0008 data descriptors) and rejects generic non-Office ZIPs", () => {
    const validDocx = buildZipArchive([
      { name: "[Content_Types].xml" },
      { name: "word/document.xml" },
    ]);
    const docxRes = classifyFileBytes({
      filename: "contract.docx",
      totalSizeBytes: validDocx.length,
      prefixBytes: validDocx,
    });
    assert.equal(docxRes.ok, true);
    if (docxRes.ok) {
      assert.equal(docxRes.targetSlug, "office");
      assert.equal(docxRes.claimedExtension, ".docx");
    }

    // Large streaming OOXML with flags & 0x0008 (compSize=0 in local header) and 70 KiB first entry
    const largeFirstBody = new Uint8Array(70_000);
    const streamingDocx = buildZipArchive([
      { name: "media/banner.bin", data: largeFirstBody, useDataDescriptor: true },
      { name: "word/document.xml", useDataDescriptor: true },
    ]);
    const headSlice = streamingDocx.subarray(0, 65_536);
    const tailSlice = streamingDocx.subarray(streamingDocx.length - 65_536);
    const streamRes = classifyFileBytes({
      filename: "streaming.docx",
      totalSizeBytes: streamingDocx.length,
      prefixBytes: headSlice,
      tailBytes: tailSlice,
    });
    assert.equal(streamRes.ok, true);
    if (streamRes.ok) {
      assert.equal(streamRes.targetSlug, "office");
    }

    // Generic non-Office ZIP
    const genericZip = buildZipArchive([
      { name: "readme.txt" },
      { name: "src/index.js" },
    ]);
    const genericAsZip = classifyFileBytes({
      filename: "bundle.zip",
      totalSizeBytes: genericZip.length,
      prefixBytes: genericZip,
    });
    assert.equal(genericAsZip.ok, false);
    if (!genericAsZip.ok) {
      assert.equal(genericAsZip.code, "unsupported_content");
      assert.equal(genericAsZip.detectedKind, "generic-zip");
      assert.equal(genericAsZip.message.includes("etc."), false);
    }

    const genericAsDocx = classifyFileBytes({
      filename: "spoofed.docx",
      totalSizeBytes: genericZip.length,
      prefixBytes: genericZip,
    });
    assert.equal(genericAsDocx.ok, false);
    if (!genericAsDocx.ok) {
      assert.equal(genericAsDocx.code, "extension_mismatch");
      assert.equal(genericAsDocx.detectedKind, "generic-zip");
      assert.equal(genericAsDocx.claimedExtension, ".docx");
    }
  });

  it("detects MZ/PE binaries, extension spoofs, and MZ+%PDF- / ELF+%PDF- polyglots", () => {
    const pe = buildPeStub();
    const validExe = classifyFileBytes({
      filename: "setup.exe",
      totalSizeBytes: pe.length,
      prefixBytes: pe,
    });
    assert.equal(validExe.ok, true);
    if (validExe.ok) {
      assert.equal(validExe.targetSlug, "exe");
    }

    const peAsPdf = classifyFileBytes({
      filename: "invoice.pdf",
      totalSizeBytes: pe.length,
      prefixBytes: pe,
    });
    assert.equal(peAsPdf.ok, false);
    if (!peAsPdf.ok) {
      assert.equal(peAsPdf.code, "extension_mismatch");
      assert.equal(peAsPdf.detectedKind, "exe");
      assert.equal(peAsPdf.claimedExtension, ".pdf");
    }

    // Leading MZ without in-slice PE\0\0 combined with %PDF- within first 1024 bytes -> polyglot!
    const mzPdfPolyglot = new TextEncoder().encode("MZ\x90\x00%PDF-1.5\n1 0 obj\n<<>>\nendobj");
    const polyRes = classifyFileBytes({
      filename: "hybrid.pdf",
      totalSizeBytes: mzPdfPolyglot.length,
      prefixBytes: mzPdfPolyglot,
    });
    assert.equal(polyRes.ok, false);
    if (!polyRes.ok) {
      assert.equal(polyRes.code, "unsupported_content");
      assert.equal(polyRes.detectedKind, "polyglot");
    }
  });

  it("distinguishes canonical RFC-5322 .eml from URLs, YAML, and MHTML Office documents", () => {
    const enc = new TextEncoder();
    const validEml = enc.encode(
      "From: security@example.test\r\nTo: user@example.test\r\nSubject: Report\r\n\r\nSee %PDF-1.4 note inside body.",
    );
    const emlRes = classifyFileBytes({
      filename: "alert.eml",
      totalSizeBytes: validEml.length,
      prefixBytes: validEml,
    });
    assert.equal(emlRes.ok, true);
    if (emlRes.ok) {
      assert.equal(emlRes.targetSlug, "email");
    }

    const urlAsEml = enc.encode("https://example.com/phishing/login\r\n\r\nClick here");
    const urlRes = classifyFileBytes({
      filename: "fake.eml",
      totalSizeBytes: urlAsEml.length,
      prefixBytes: urlAsEml,
    });
    assert.equal(urlRes.ok, false);
    if (!urlRes.ok) {
      assert.equal(urlRes.code, "extension_mismatch");
      assert.equal(urlRes.claimedExtension, ".eml");
    }

    const yamlAsEml = enc.encode("server: localhost\r\nport: 8080\r\n\r\nbody");
    const yamlRes = classifyFileBytes({
      filename: "config.eml",
      totalSizeBytes: yamlAsEml.length,
      prefixBytes: yamlAsEml,
    });
    assert.equal(yamlRes.ok, false);
    if (!yamlRes.ok) {
      assert.equal(yamlRes.code, "extension_mismatch");
    }

    const mhtmlOffice = enc.encode(
      'MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="----=_NextPart_01"\r\nX-MimeOLE: Produced By Microsoft MimeOLE V6.00\r\n\r\n<html xmlns:o="urn:schemas-microsoft-com:office:office"></html>',
    );
    const mhtmlRes = classifyFileBytes({
      filename: "exported.doc",
      totalSizeBytes: mhtmlOffice.length,
      prefixBytes: mhtmlOffice,
    });
    assert.equal(mhtmlRes.ok, true);
    if (mhtmlRes.ok) {
      assert.equal(mhtmlRes.targetSlug, "office");
    }
  });

  it("blocks non-scanner extension mismatches (.png -> .pdf) and classifies valid extensionless & dotfile payloads", () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const pngAsPdf = classifyFileBytes({
      filename: "receipt.pdf",
      totalSizeBytes: pngBytes.length,
      prefixBytes: pngBytes,
    });
    assert.equal(pngAsPdf.ok, false);
    if (!pngAsPdf.ok) {
      assert.equal(pngAsPdf.code, "extension_mismatch");
      assert.equal(pngAsPdf.detectedKind, "image");
      assert.equal(pngAsPdf.claimedExtension, ".pdf");
    }

    const pdfBytes = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");
    const pdfAsPng = classifyFileBytes({
      filename: "image.png",
      totalSizeBytes: pdfBytes.length,
      prefixBytes: pdfBytes,
    });
    assert.equal(pdfAsPng.ok, false);
    if (!pdfAsPng.ok) {
      assert.equal(pdfAsPng.code, "extension_mismatch");
      assert.equal(pdfAsPng.detectedKind, "pdf");
      assert.equal(pdfAsPng.claimedExtension, ".png");
    }

    // Extensionless valid PDF
    const extlessPdf = classifyFileBytes({
      filename: "suspect_attachment",
      totalSizeBytes: pdfBytes.length,
      prefixBytes: pdfBytes,
    });
    assert.equal(extlessPdf.ok, true);
    if (extlessPdf.ok) {
      assert.equal(extlessPdf.targetSlug, "pdf");
      assert.equal(extlessPdf.claimedExtension, null);
      assert.equal(extlessPdf.isExtensionless, true);
    }

    // Dotfile and trailing-dot filenames treated as extensionless
    const dotfilePdf = classifyFileBytes({
      filename: ".pdf",
      totalSizeBytes: pdfBytes.length,
      prefixBytes: pdfBytes,
    });
    assert.equal(dotfilePdf.ok, true);
    if (dotfilePdf.ok) {
      assert.equal(dotfilePdf.targetSlug, "pdf");
      assert.equal(dotfilePdf.isExtensionless, true);
    }

    const trailingDotPdf = classifyFileBytes({
      filename: "document.",
      totalSizeBytes: pdfBytes.length,
      prefixBytes: pdfBytes,
    });
    assert.equal(trailingDotPdf.ok, true);
    if (trailingDotPdf.ok) {
      assert.equal(trailingDotPdf.targetSlug, "pdf");
      assert.equal(trailingDotPdf.isExtensionless, true);
    }
  });

  it("enforces capability-specific 5 MiB email ceiling vs 25 MiB file ceiling and expectedSlug gate", () => {
    const enc = new TextEncoder();
    const validEml = enc.encode(
      "From: a@example.test\r\nTo: b@example.test\r\nSubject: S\r\n\r\nHello",
    );
    const overFiveMibEml = classifyFileBytes({
      filename: "large.eml",
      totalSizeBytes: 5 * 1024 * 1024 + 1,
      prefixBytes: validEml,
    });
    assert.equal(overFiveMibEml.ok, false);
    if (!overFiveMibEml.ok) {
      assert.equal(overFiveMibEml.code, "payload_too_large");
      assert.equal(overFiveMibEml.httpStatus, 413);
    }

    const pdfBytes = enc.encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj");
    const tenMibPdf = classifyFileBytes({
      filename: "manual.pdf",
      totalSizeBytes: 10 * 1024 * 1024,
      prefixBytes: pdfBytes,
    });
    assert.equal(tenMibPdf.ok, true);

    const wrongExpectedSlug = classifyFileBytes({
      filename: "attachment",
      totalSizeBytes: pdfBytes.length,
      prefixBytes: pdfBytes,
      expectedSlug: "office",
    });
    assert.equal(wrongExpectedSlug.ok, false);
    if (!wrongExpectedSlug.ok) {
      assert.equal(wrongExpectedSlug.code, "unsupported_content");
      assert.equal(wrongExpectedSlug.httpStatus, 422);
    }
  });

  it("blocks forged PK\\x01\\x02 payload spoofing inside generic ZIPs and ZIP/PNG+%PDF- polyglots while keeping %PDF- in email Subject valid", () => {
    const enc = new TextEncoder();
    // Forged Central Directory header embedded inside a generic ZIP's stored file data
    const fakeName = enc.encode("word/document.xml");
    const fakeCd = new Uint8Array(46 + fakeName.length);
    const fakeCdView = new DataView(fakeCd.buffer);
    fakeCd[0] = 0x50;
    fakeCd[1] = 0x4b;
    fakeCd[2] = 0x01;
    fakeCd[3] = 0x02;
    fakeCdView.setUint16(28, fakeName.length, true);
    fakeCd.set(fakeName, 46);

    const forgedZip = buildZipArchive([
      { name: "payload.bin", data: fakeCd },
    ]);
    // Slice head only (no EOCD in slice) so naive byte-scan would hit fakeCd in payload
    const headOnly = forgedZip.subarray(0, forgedZip.length - 25);
    const forgedRes = classifyFileBytes({
      filename: "spoofed.docx",
      totalSizeBytes: forgedZip.length,
      prefixBytes: headOnly,
    });
    assert.equal(forgedRes.ok, false);
    if (!forgedRes.ok) {
      assert.equal(forgedRes.code, "extension_mismatch");
      assert.equal(forgedRes.detectedKind, "generic-zip");
    }

    // PNG + %PDF- polyglot
    const pngPdf = new Uint8Array(64);
    pngPdf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    pngPdf.set(enc.encode("%PDF-1.5\n"), 16);
    const pngPdfRes = classifyFileBytes({
      filename: "poly.pdf",
      totalSizeBytes: pngPdf.length,
      prefixBytes: pngPdf,
    });
    assert.equal(pngPdfRes.ok, false);
    if (!pngPdfRes.ok) {
      assert.equal(pngPdfRes.code, "unsupported_content");
      assert.equal(pngPdfRes.detectedKind, "polyglot");
    }

    // Generic ZIP storing an uncompressed %PDF- in first 1024 bytes -> polyglot
    const zipPdf = buildZipArchive([
      { name: "embedded.txt", data: enc.encode("%PDF-1.7\n1 0 obj\n") },
    ]);
    const zipPdfRes = classifyFileBytes({
      filename: "poly.pdf",
      totalSizeBytes: zipPdf.length,
      prefixBytes: zipPdf,
    });
    assert.equal(zipPdfRes.ok, false);
    if (!zipPdfRes.ok) {
      assert.equal(zipPdfRes.code, "unsupported_content");
      assert.equal(zipPdfRes.detectedKind, "polyglot");
    }

    // Legitimate .eml whose Subject header mentions %PDF-1.4 must remain email
    const emlWithPdfSubject = enc.encode(
      "From: analyst@example.test\r\nTo: ops@example.test\r\nSubject: Check %PDF-1.4 header rule\r\n\r\nDetails inside.",
    );
    const emlSubjectRes = classifyFileBytes({
      filename: "report.eml",
      totalSizeBytes: emlWithPdfSubject.length,
      prefixBytes: emlWithPdfSubject,
    });
    assert.equal(emlSubjectRes.ok, true);
    if (emlSubjectRes.ok) {
      assert.equal(emlSubjectRes.targetSlug, "email");
    }
  });
});
