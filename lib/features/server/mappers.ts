import { randomUUID } from "node:crypto";
import type {
  AdvisoryVerdict,
  CoverageStatus,
  EmailAttachmentSummary,
  ExeExplanationFactor,
  ExeSectionSummary,
  PdfFeatureContribution,
  RiskTier,
  ScanOutcome,
  SmsItemOutcome,
  UrlBranchBreakdown,
  UrlItemOutcome,
  UrlParsedComponentSummary,
} from "../types.ts";

const ADVISORY_NOTICE =
  "Advisory static assessment only — Vanguard AV does not automatically block, execute, or quarantine files on your device. Combine this finding with source verification before acting.";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function normalizeRiskTier(value: unknown): RiskTier {
  if (typeof value !== "string") return "UNAVAILABLE";
  const upper = value.trim().toUpperCase();
  if (
    upper === "SAFE" ||
    upper === "LOW" ||
    upper === "MEDIUM" ||
    upper === "HIGH" ||
    upper === "CRITICAL"
  ) {
    return upper;
  }
  return "UNAVAILABLE";
}

function deriveRiskTierFromScore(
  score: number | null,
  verdict: AdvisoryVerdict,
): RiskTier {
  if (score === null) return "UNAVAILABLE";
  if (verdict === "malicious") {
    if (score >= 0.85) return "CRITICAL";
    if (score >= 0.65) return "HIGH";
    return "MEDIUM";
  }
  if (verdict === "review") return "MEDIUM";
  if (score <= 0.15) return "SAFE";
  return "LOW";
}

function base64DecodedSize(b64: string | null): number | null {
  if (!b64) return null;
  const cleaned = b64.replace(/\s+/g, "");
  if (!cleaned) return 0;
  let padding = 0;
  if (cleaned.endsWith("==")) padding = 2;
  else if (cleaned.endsWith("=")) padding = 1;
  return Math.max(0, Math.floor((cleaned.length * 3) / 4) - padding);
}

function verdictLabelFor(verdict: AdvisoryVerdict, domain: string): string {
  if (verdict === "malicious") return `${domain} indicators detected`;
  if (verdict === "review") return "Needs human review";
  return "No threats detected";
}

function coverageLabelFor(coverage: CoverageStatus): string {
  switch (coverage) {
    case "complete":
      return "Complete static inspection";
    case "partial":
      return "Partial inspection";
    case "encrypted":
      return "Encrypted — restricted coverage";
    case "unsupported":
      return "Unsupported format";
    case "unreadable":
      return "Unreadable or malformed input";
    case "ambiguous":
      return "Uncertain / conflicting signals";
    case "limited":
      return "Limited inspection scope";
  }
}

export function mapEmailResponse(
  raw: unknown,
  meta: { filename: string; sizeBytes: number },
): ScanOutcome {
  const obj = asRecord(raw);
  const pred = asRecord(obj.prediction);
  const modelInput = asRecord(obj.model_input);

  const mode = asString(pred.mode) ?? "unavailable";
  const action = asString(pred.action) ?? "review";
  const rawVerdict = asString(pred.verdict)?.toLowerCase() ?? null;
  const riskScore = asNumber(pred.risk_score);
  const severeScore = asNumber(pred.severe_score);
  const threshold = asNumber(pred.threshold);
  const reasonCodes = asStringArray(pred.reason_codes);

  const emailAddresses = asStringArray(obj.email_addresses);
  const links = asStringArray(obj.links);
  const rawAttachments = Array.isArray(obj.attachments) ? obj.attachments : [];

  // Strip raw base64 payloads (`eml_base64`, `message`, `attachments[].content_base64`)
  const attachments: EmailAttachmentSummary[] = rawAttachments.map((item) => {
    const rec = asRecord(item);
    return {
      filename: asString(rec.filename),
      contentType: asString(rec.content_type) ?? "application/octet-stream",
      disposition: asString(rec.disposition),
      contentId: asString(rec.content_id),
      sizeBytes: base64DecodedSize(asString(rec.content_base64)),
    };
  });

  const hasScorerFailure =
    mode === "unavailable" ||
    rawVerdict === null ||
    reasonCodes.some((c) => c.includes("error") || c.includes("timeout") || c.includes("unavailable"));

  let coverage: CoverageStatus = "complete";
  let coverageDetail: string | null = null;
  let verdict: AdvisoryVerdict = "review";

  if (hasScorerFailure) {
    coverage = "unreadable";
    coverageDetail =
      "The email scorer could not complete a full assessment on this message; review the extracted headers, links, and attachments manually.";
    verdict = "review";
  } else {
    if (mode === "text") {
      coverage = "limited";
      coverageDetail =
        "Scored using the text-only fallback profile because full MIME authentication metadata was unavailable.";
    }
    verdict =
      rawVerdict === "malicious"
        ? "malicious"
        : rawVerdict === "safe"
          ? "benign"
          : "review";
  }

  const confidence =
    verdict === "review" || coverage !== "complete"
      ? null
      : riskScore !== null
        ? verdict === "malicious"
          ? riskScore
          : 1 - riskScore
        : null;

  const summary =
    verdict === "malicious"
      ? "Static inspection flagged phishing or malicious email indicators in this message."
      : verdict === "review"
        ? "Inspection could not reach a definitive verdict — review this email before trusting links or attachments."
        : "Static inspection found no phishing or malicious indicators in this email.";

  const recommendedActions =
    verdict === "malicious"
      ? [
          "Do not click any links, reply with credentials, or open attachments from this email.",
          "Inspect the extracted addresses and links in Technical Evidence below (rendered safely as non-clickable text).",
          "Report or quarantine the message through your email provider and verify requests via an independent channel.",
        ]
      : verdict === "review"
        ? [
            "Treat this email with caution until verified out-of-band with the claimed sender.",
            "Check any extracted attachments separately using the Office, PDF, or Executable scanners.",
          ]
        : [
            "No threats were flagged by static email analysis, though you should still verify unexpected requests.",
            attachments.length > 0
              ? "Scan extracted attachments individually if they came from an unfamiliar sender."
              : "Confirm the sender domain matches the organization you expect.",
          ];

  const cleanedSubject = asString(modelInput.subject) ?? "";
  const cleanedBody = asString(modelInput.body) ?? "";

  return {
    status: "completed",
    scanId: randomUUID(),
    feature: "email",
    analyzedAt: new Date().toISOString(),
    inputLabel: meta.filename,
    inputSizeBytes: meta.sizeBytes,
    verdict,
    verdictLabel: verdictLabelFor(verdict, "Phishing / malware"),
    coverage,
    coverageLabel: coverageLabelFor(coverage),
    coverageDetail,
    riskTier: deriveRiskTierFromScore(riskScore, verdict),
    riskScore,
    confidence,
    isUncertain: verdict === "review",
    uncertaintyReasons: verdict === "review" ? reasonCodes : [],
    advisoryNotice: ADVISORY_NOTICE,
    summary,
    recommendedActions,
    latencyMs: null,
    details: {
      kind: "email",
      mode,
      action,
      threshold,
      severeScore,
      modelVersion: asString(pred.model_version),
      policyVersion: asString(pred.policy_version),
      reasonCodes,
      cleanedSubject: cleanedSubject.slice(0, 500),
      cleanedBodyExcerpt: cleanedBody.slice(0, 2000),
      emailAddresses,
      links,
      attachments,
    },
  };
}

export function mapOfficeResponse(
  raw: unknown,
  meta: { filename: string; sizeBytes: number },
): ScanOutcome {
  const obj = asRecord(raw);
  const rawScanStatus = (asString(obj.scan_status) ?? "error").toLowerCase();
  const rawVerdict = (asString(obj.verdict) ?? "review").toLowerCase();
  const observedFormat = asString(obj.observed_format) ?? "unknown";
  const formatCandidates = asStringArray(obj.format_candidates);
  const reasonCodes = asStringArray(obj.reason_codes);
  const maliceProb = asNumber(obj.malice_prob);
  const disagreement = asNumber(obj.disagreement);
  const primaryAttribution = asString(obj.primary_attribution);
  const primaryAttributionScore = asNumber(obj.primary_attribution_score);
  const lowConfidenceAttribution =
    typeof obj.low_confidence_attribution === "boolean"
      ? obj.low_confidence_attribution
      : null;

  let coverage: CoverageStatus;
  let coverageDetail: string | null = null;
  switch (rawScanStatus) {
    case "complete":
      coverage = "complete";
      break;
    case "partial":
      coverage = "partial";
      coverageDetail =
        "Only part of this document could be extracted statically. Because coverage is incomplete, this result requires human review.";
      break;
    case "opaque_encrypted":
      coverage = "encrypted";
      coverageDetail =
        "This document is encrypted or password-protected, preventing full static inspection. Encrypted files are always routed to review.";
      break;
    case "unsupported":
      coverage = "unsupported";
      coverageDetail =
        "The observed document container is outside the Office scanner's qualified format coverage.";
      break;
    case "ambiguous":
      coverage = "ambiguous";
      coverageDetail =
        "Format or static model signals were ambiguous; manual review is required.";
      break;
    default:
      coverage = "unreadable";
      coverageDetail =
        "The document could not be parsed completely within static safety budgets.";
      break;
  }

  // Enforce constitutional precedence: incomplete/encrypted/unsupported never collapses to benign.
  let verdict: AdvisoryVerdict;
  if (coverage !== "complete") {
    verdict = "review";
  } else if (rawVerdict === "malicious") {
    verdict = "malicious";
  } else if (rawVerdict === "benign") {
    verdict = "benign";
  } else {
    verdict = "review";
  }

  const rawThreat = asRecord(obj.threat_category);
  const threatCategories = Object.entries(rawThreat)
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
    .map(([category, score]) => ({ category, score: score as number }))
    .sort((a, b) => b.score - a.score);

  const rawModalities = asRecord(obj.modality_availability);
  const modalityEntries = Object.entries(rawModalities).filter(
    ([, v]) => typeof v === "boolean",
  ) as Array<[string, boolean]>;
  const modalityAvailability =
    modalityEntries.length > 0 ? Object.fromEntries(modalityEntries) : null;

  const confidence =
    verdict === "review" || coverage !== "complete"
      ? null
      : maliceProb !== null
        ? verdict === "malicious"
          ? maliceProb
          : 1 - maliceProb
        : null;

  const summary =
    verdict === "malicious"
      ? primaryAttribution
        ? `Static inspection flagged malicious Office indicators (primary attribution: ${primaryAttribution}).`
        : "Static inspection flagged malicious indicators in this Office document."
      : verdict === "review"
        ? `Static inspection requires human review (${coverageLabelFor(coverage).toLowerCase()}).`
        : "Static inspection completed and found no malicious indicators in this Office document.";

  const recommendedActions =
    verdict === "malicious"
      ? [
          "Do not open this document or enable macros / external content.",
          "Inspect the threat attribution and reason codes in Technical Evidence below.",
          "Quarantine the file and verify the document's origin with the sender through another channel.",
        ]
      : verdict === "review"
        ? [
            "Do not treat an incomplete, encrypted, or uncertain scan as clean.",
            "Confirm the document's source before opening, and keep macros disabled in Protected View.",
          ]
        : [
            "No malicious patterns were detected during static analysis.",
            "Continue opening external documents in Protected View with macros disabled by default.",
          ];

  return {
    status: "completed",
    scanId: randomUUID(),
    feature: "office",
    analyzedAt: new Date().toISOString(),
    inputLabel: meta.filename,
    inputSizeBytes: meta.sizeBytes,
    verdict,
    verdictLabel: verdictLabelFor(verdict, "Office malware"),
    coverage,
    coverageLabel: coverageLabelFor(coverage),
    coverageDetail,
    riskTier: deriveRiskTierFromScore(maliceProb, verdict),
    riskScore: maliceProb,
    confidence,
    isUncertain: verdict === "review",
    uncertaintyReasons: verdict === "review" ? reasonCodes : [],
    advisoryNotice: ADVISORY_NOTICE,
    summary,
    recommendedActions,
    latencyMs: null,
    details: {
      kind: "office",
      requestId: asString(obj.request_id),
      modelVersion: asString(obj.model_version),
      observedFormat,
      formatCandidates,
      rawScanStatus,
      reasonCodes,
      disagreement,
      modalityAvailability,
      primaryAttribution,
      primaryAttributionScore,
      lowConfidenceAttribution,
      threatCategories,
    },
  };
}

export function mapPdfResponse(
  raw: unknown,
  meta: { filename: string; sizeBytes: number; deepInspection: boolean },
): ScanOutcome {
  const obj = asRecord(raw);
  const verdictDetails = asRecord(obj.verdict_details);
  const modelsRaw = asRecord(obj.models);
  const hashesRaw = asRecord(obj.hashes);
  const pdfMetaRaw = asRecord(obj.pdf_metadata);
  const indicatorsRaw = asRecord(obj.security_indicators);
  const explanationRaw = asRecord(obj.explanation);
  const perfRaw = asRecord(obj.performance);

  const isMalicious = asBoolean(obj.is_malicious);
  const isUncertain = asBoolean(obj.is_uncertain);
  const maliciousProb = asNumber(obj.malicious_probability);
  const benignProb = asNumber(obj.benign_probability);
  const confidence = asNumber(obj.confidence);
  const isEncrypted = asBoolean(pdfMetaRaw.is_encrypted);
  const parseSuccess = asBoolean(pdfMetaRaw.parse_success, true);

  let coverage: CoverageStatus = "complete";
  let coverageDetail: string | null = null;

  if (isEncrypted) {
    coverage = "encrypted";
    coverageDetail =
      "This PDF is encrypted or password-protected; embedded objects and scripts may not be fully inspectable.";
  } else if (!parseSuccess) {
    coverage = "unreadable";
    coverageDetail =
      "One or more PDF structures failed to parse cleanly; review parser notices before trusting this file.";
  } else if (isUncertain) {
    coverage = "ambiguous";
    coverageDetail =
      "Ensemble estimators showed elevated uncertainty or disagreement on this PDF.";
  } else if (!meta.deepInspection) {
    coverage = "limited";
    coverageDetail =
      "Deep static PDF metadata and active-content inspection was turned off for this scan.";
  }

  let verdict: AdvisoryVerdict;
  if (isEncrypted || !parseSuccess || isUncertain) {
    verdict = isMalicious && !isUncertain ? "malicious" : "review";
  } else {
    verdict = isMalicious ? "malicious" : "benign";
  }

  const uncertaintyReasons = asStringArray(verdictDetails.uncertainty_factors);
  const topRaw = Array.isArray(explanationRaw.top_contributing_features)
    ? explanationRaw.top_contributing_features
    : [];
  const topContributingFeatures: PdfFeatureContribution[] = topRaw.map((entry) => {
    const rec = asRecord(entry);
    return {
      feature: asString(rec.feature) ?? "unknown",
      value: asNumber(rec.value),
      contribution: asNumber(rec.contribution),
      direction: asString(rec.direction) ?? "neutral",
    };
  });

  const rawFeaturesObj = asRecord(obj.features);
  const rawFeaturesEntries = Object.entries(rawFeaturesObj).filter(
    ([, v]) => typeof v === "number" && Number.isFinite(v),
  ) as Array<[string, number]>;

  const summary =
    verdict === "malicious"
      ? "Static PDF inspection flagged malicious structures or active-content risk indicators."
      : verdict === "review"
        ? `Static PDF inspection requires human review (${coverageLabelFor(coverage).toLowerCase()}).`
        : "Static PDF inspection found no malicious structures or active-content threats.";

  const recommendedActions =
    verdict === "malicious"
      ? [
          "Do not open this PDF in a viewer with JavaScript or external launch actions enabled.",
          "Review active-content indicators and extracted inert URLs in Technical Evidence below.",
          "Quarantine the document and request a verified copy from a trusted source.",
        ]
      : verdict === "review"
        ? [
            "Do not treat an encrypted, partially parsed, or uncertain PDF scan as safe.",
            "Verify the sender and inspect parser notices and active-content flags in Technical Evidence.",
          ]
        : [
            "No malicious PDF indicators were found during static analysis.",
            "Keep PDF JavaScript disabled in your viewer for defense in depth.",
          ];

  return {
    status: "completed",
    scanId: randomUUID(),
    feature: "pdf",
    analyzedAt: asString(obj.analyzed_at) ?? new Date().toISOString(),
    inputLabel: meta.filename,
    inputSizeBytes: asNumber(obj.file_size_bytes) ?? meta.sizeBytes,
    verdict,
    verdictLabel: verdictLabelFor(verdict, "PDF malware"),
    coverage,
    coverageLabel: coverageLabelFor(coverage),
    coverageDetail,
    riskTier:
      isEncrypted || !parseSuccess
        ? "UNAVAILABLE"
        : verdict === "review"
          ? deriveRiskTierFromScore(maliciousProb, verdict)
          : normalizeRiskTier(obj.risk_level) !== "UNAVAILABLE"
            ? normalizeRiskTier(obj.risk_level)
            : deriveRiskTierFromScore(maliciousProb, verdict),
    riskScore: maliciousProb,
    confidence: isEncrypted || !parseSuccess ? null : confidence,
    isUncertain: isUncertain || verdict === "review",
    uncertaintyReasons,
    advisoryNotice: ADVISORY_NOTICE,
    summary,
    recommendedActions,
    latencyMs: asNumber(perfRaw.total_latency_ms),
    details: {
      kind: "pdf",
      prediction: asString(obj.prediction) ?? verdict,
      maliciousProbability: maliciousProb,
      benignProbability: benignProb,
      modelDisagreement: asNumber(obj.model_disagreement),
      predictionEntropy: asNumber(obj.prediction_entropy),
      threshold: asNumber(verdictDetails.threshold),
      estimatorUsed: asString(verdictDetails.estimator_used),
      decisionMargin: asNumber(verdictDetails.decision_margin),
      models:
        Object.keys(modelsRaw).length > 0
          ? {
              rfProbability: asNumber(modelsRaw.rf_probability),
              etProbability: asNumber(modelsRaw.et_probability),
              lrProbability: asNumber(modelsRaw.lr_probability),
              lgbmProbability: asNumber(modelsRaw.lgbm_probability),
              ensembleProbability: asNumber(modelsRaw.ensemble_probability),
              stdDev: asNumber(modelsRaw.std_dev),
              consensus: asString(modelsRaw.consensus),
              modelVersion: asString(modelsRaw.model_version),
            }
          : null,
      hashes:
        Object.keys(hashesRaw).length > 0
          ? {
              sha256: asString(hashesRaw.sha256) ?? undefined,
              md5: asString(hashesRaw.md5) ?? undefined,
              sha1: asString(hashesRaw.sha1) ?? undefined,
            }
          : null,
      metadata:
        Object.keys(pdfMetaRaw).length > 0
          ? {
              pdfVersion: asString(pdfMetaRaw.pdf_version),
              numPages: asNumber(pdfMetaRaw.num_pages),
              isEncrypted,
              parseSuccess,
              author: asString(pdfMetaRaw.author),
              creator: asString(pdfMetaRaw.creator),
              producer: asString(pdfMetaRaw.producer),
              title: asString(pdfMetaRaw.title),
              parsersUsed: asStringArray(pdfMetaRaw.parsers_used),
              parserErrors: asStringArray(pdfMetaRaw.parser_errors),
            }
          : null,
      securityIndicators:
        Object.keys(indicatorsRaw).length > 0
          ? {
              byteEntropy: asNumber(indicatorsRaw.byte_entropy),
              javascriptCount: asNumber(indicatorsRaw.javascript_count) ?? 0,
              openActionCount: asNumber(indicatorsRaw.openaction_count) ?? 0,
              aaCount: asNumber(indicatorsRaw.aa_count) ?? 0,
              launchCount: asNumber(indicatorsRaw.launch_count) ?? 0,
              embeddedFileCount: asNumber(indicatorsRaw.embedded_file_count) ?? 0,
              xfaCount: asNumber(indicatorsRaw.xfa_count) ?? 0,
              acroFormCount: asNumber(indicatorsRaw.acroform_count) ?? 0,
              uriCount: asNumber(indicatorsRaw.uri_count) ?? 0,
              nameObfuscationCount:
                asNumber(indicatorsRaw.name_obfuscation_count) ?? 0,
              extractedUrls: asStringArray(indicatorsRaw.extracted_urls),
              suspiciousStrings: asStringArray(indicatorsRaw.suspicious_strings),
              heuristicRedFlags: asStringArray(indicatorsRaw.heuristic_red_flags),
            }
          : null,
      explanationSummary: asString(explanationRaw.summary),
      topContributingFeatures,
      rawFeatures:
        rawFeaturesEntries.length > 0
          ? Object.fromEntries(rawFeaturesEntries)
          : null,
    },
  };
}

export function mapExeResponse(
  raw: unknown,
  meta: { filename: string; sizeBytes: number; deepInspection: boolean },
): ScanOutcome {
  const obj = asRecord(raw);
  const verdictDetails = asRecord(obj.verdict_details);
  const modelsRaw = asRecord(obj.models);
  const hashesRaw = asRecord(obj.hashes);
  const peRaw = asRecord(obj.pe_headers);
  const indicatorsRaw = asRecord(obj.security_indicators);
  const explanationRaw = asRecord(obj.explanation);
  const perfRaw = asRecord(obj.performance);

  const isMalicious = asBoolean(obj.is_malicious);
  const isUncertain = asBoolean(obj.is_uncertain);
  const malwareProb = asNumber(obj.malware_probability);
  const benignProb = asNumber(obj.benign_probability);
  const confidence = asNumber(obj.confidence);

  let coverage: CoverageStatus = "complete";
  let coverageDetail: string | null = null;
  if (isUncertain) {
    coverage = "ambiguous";
    coverageDetail =
      "Model confidence or branch agreement fell inside the uncertainty region — human review is recommended.";
  } else if (!meta.deepInspection) {
    coverage = "limited";
    coverageDetail =
      "Deep static PE header, section, and Authenticode inspection was turned off for this scan.";
  }

  const verdict: AdvisoryVerdict = isUncertain
    ? "review"
    : isMalicious
      ? "malicious"
      : "benign";

  const sectionsRaw = Array.isArray(obj.sections) ? obj.sections : [];
  const sections: ExeSectionSummary[] = sectionsRaw.map((entry) => {
    const rec = asRecord(entry);
    return {
      name: asString(rec.name) ?? "",
      entropy: asNumber(rec.entropy),
      virtualSize: asNumber(rec.virtual_size),
      rawSize: asNumber(rec.raw_size),
      isExec: asBoolean(rec.is_exec),
      isWrite: asBoolean(rec.is_write),
      isRead: asBoolean(rec.is_read),
      isWx: asBoolean(rec.is_wx),
    };
  });

  const combinedFactorsRaw = [
    ...(Array.isArray(explanationRaw.top_structural_factors)
      ? explanationRaw.top_structural_factors
      : []),
    ...(Array.isArray(explanationRaw.top_byte_factors)
      ? explanationRaw.top_byte_factors
      : []),
    ...(Array.isArray(explanationRaw.gbdt_top_factors)
      ? explanationRaw.gbdt_top_factors
      : []),
  ];
  const topFactors: ExeExplanationFactor[] = combinedFactorsRaw
    .slice(0, 12)
    .map((entry) => {
      const rec = asRecord(entry);
      return {
        feature: asString(rec.feature) ?? "factor",
        direction: asString(rec.direction) ?? "neutral",
        contribution: asNumber(rec.contribution),
        description: asString(rec.description),
      };
    });

  const summary =
    verdict === "malicious"
      ? "Static executable inspection flagged malware indicators in this Windows binary."
      : verdict === "review"
        ? "Static binary signals are uncertain or conflicting — review before running this executable."
        : "Static executable inspection found no malware indicators in this Windows binary.";

  const recommendedActions =
    verdict === "malicious"
      ? [
          "Do not execute this file or transfer it to production workstations.",
          "Inspect the cryptographic hashes, signature status, and section entropy in Technical Evidence below.",
          "Isolate the binary and cross-check its SHA-256 fingerprint against trusted vendor releases.",
        ]
      : verdict === "review"
        ? [
            "Do not execute an uncertain binary without verifying its digital signature and download source.",
            "Review model disagreement, PE headers, and flagged APIs in Technical Evidence below.",
          ]
        : [
            "No malware indicators were flagged during static PE analysis.",
            "Verify the publisher's Authenticode signature and checksum before running unfamiliar installers.",
          ];

  return {
    status: "completed",
    scanId: randomUUID(),
    feature: "exe",
    analyzedAt: asString(obj.analyzed_at) ?? new Date().toISOString(),
    inputLabel: meta.filename,
    inputSizeBytes: asNumber(obj.file_size_bytes) ?? meta.sizeBytes,
    verdict,
    verdictLabel: verdictLabelFor(verdict, "Binary malware"),
    coverage,
    coverageLabel: coverageLabelFor(coverage),
    coverageDetail,
    riskTier:
      normalizeRiskTier(obj.risk_level) !== "UNAVAILABLE"
        ? normalizeRiskTier(obj.risk_level)
        : deriveRiskTierFromScore(malwareProb, verdict),
    riskScore: malwareProb,
    confidence,
    isUncertain,
    uncertaintyReasons: asStringArray(verdictDetails.uncertainty_factors),
    advisoryNotice: ADVISORY_NOTICE,
    summary,
    recommendedActions,
    latencyMs: asNumber(perfRaw.total_latency_ms),
    details: {
      kind: "exe",
      prediction: asString(obj.prediction) ?? verdict,
      malwareProbability: malwareProb,
      benignProbability: benignProb,
      modelDisagreement: asNumber(obj.model_disagreement),
      predictionEntropy: asNumber(obj.prediction_entropy),
      threshold: asNumber(verdictDetails.threshold),
      operatingPoint: asString(verdictDetails.operating_point),
      decisionMargin: asNumber(verdictDetails.decision_margin),
      models:
        Object.keys(modelsRaw).length > 0
          ? {
              hybridProbability: asNumber(modelsRaw.hybrid_probability),
              gbdtProbability: asNumber(modelsRaw.gbdt_probability),
              ensembleProbability: asNumber(modelsRaw.ensemble_probability),
              consensus: asString(modelsRaw.consensus),
              activeRunId: asString(modelsRaw.active_run_id),
            }
          : null,
      hashes:
        Object.keys(hashesRaw).length > 0
          ? {
              sha256: asString(hashesRaw.sha256) ?? undefined,
              md5: asString(hashesRaw.md5) ?? undefined,
              sha1: asString(hashesRaw.sha1) ?? undefined,
              imphash: asString(hashesRaw.imphash) ?? undefined,
            }
          : null,
      peHeaders:
        Object.keys(peRaw).length > 0
          ? {
              machine: asString(peRaw.machine) ?? undefined,
              subsystem: asString(peRaw.subsystem) ?? undefined,
              compilationTimestamp:
                asString(peRaw.compilation_timestamp) ?? undefined,
              isTimestomped:
                typeof peRaw.is_timestomped === "boolean"
                  ? peRaw.is_timestomped
                  : undefined,
              isSigned:
                typeof peRaw.is_signed === "boolean"
                  ? peRaw.is_signed
                  : undefined,
              hasTlsCallbacks:
                typeof peRaw.has_tls_callbacks === "boolean"
                  ? peRaw.has_tls_callbacks
                  : undefined,
              entryPointSection:
                asString(peRaw.entry_point_section) ?? undefined,
            }
          : null,
      sections,
      securityIndicators:
        Object.keys(indicatorsRaw).length > 0
          ? {
              maxSectionEntropy: asNumber(indicatorsRaw.max_section_entropy),
              isHighEntropy: asBoolean(indicatorsRaw.is_high_entropy),
              hasWxSections: asBoolean(indicatorsRaw.has_wx_sections),
              packerDetected: asBoolean(indicatorsRaw.packer_detected),
              suspiciousApis: asStringArray(indicatorsRaw.suspicious_apis),
              heuristicRedFlags: asStringArray(indicatorsRaw.heuristic_red_flags),
              topIndicators: asStringArray(indicatorsRaw.top_indicators),
            }
          : null,
      explanationSummary: asString(explanationRaw.summary),
      topFactors,
    },
  };
}

function mapSmsItem(raw: unknown, index: number): SmsItemOutcome {
  const obj = asRecord(raw);
  const verdictDetails = asRecord(obj.verdict_details);
  const textAnalysis = asRecord(obj.text_analysis);
  const entities = asRecord(obj.entities);
  const indicators = asRecord(obj.security_indicators);

  const isSpam = asBoolean(obj.is_spam) || asBoolean(obj.is_malicious);
  const isUncertain = asBoolean(obj.is_uncertain);
  const verdict: AdvisoryVerdict = isUncertain
    ? "review"
    : isSpam
      ? "malicious"
      : "benign";

  const spamProbability = asNumber(obj.spam_probability) ?? asNumber(obj.p_spam);
  const rawText = asString(obj.text) ?? "";

  return {
    index,
    id: asString(obj.id),
    sender: asString(obj.sender),
    textExcerpt: rawText.slice(0, 600),
    verdict,
    label: asString(obj.label) ?? asString(obj.prediction) ?? verdict,
    riskTier:
      normalizeRiskTier(obj.risk_level) !== "UNAVAILABLE"
        ? normalizeRiskTier(obj.risk_level)
        : deriveRiskTierFromScore(spamProbability, verdict),
    spamProbability,
    confidence: asNumber(obj.confidence),
    isUncertain,
    uncertaintyFactors: asStringArray(verdictDetails.uncertainty_factors),
    language: asString(textAnalysis.language),
    script: asString(textAnalysis.script),
    tokenCount: asNumber(textAnalysis.token_count),
    windowCount: asNumber(textAnalysis.window_count),
    truncatedMiddle: asBoolean(textAnalysis.truncated_middle),
    entities: {
      urls: asStringArray(entities.urls),
      shortenedUrls: asStringArray(entities.shortened_urls),
      emails: asStringArray(entities.emails),
      phoneNumbers: asStringArray(entities.phone_numbers),
      otpCodes: asStringArray(entities.otp_codes),
      hasZeroWidthChars: asBoolean(entities.has_zero_width_chars),
      hasLookalikeChars: asBoolean(entities.has_lookalike_chars),
    },
    heuristicSignals: asStringArray(indicators.heuristic_signals),
    looksLikeOtp: asBoolean(indicators.looks_like_otp),
    hasObfuscation: asBoolean(indicators.has_obfuscation),
  };
}

export function mapSmsSingleResponse(raw: unknown): ScanOutcome {
  const obj = asRecord(raw);
  const verdictDetails = asRecord(obj.verdict_details);
  const perf = asRecord(obj.performance);
  const item = mapSmsItem(obj, 0);

  const coverage: CoverageStatus = item.isUncertain
    ? "ambiguous"
    : item.truncatedMiddle
      ? "limited"
      : "complete";

  const coverageDetail = item.isUncertain
    ? "The score fell near the decision boundary; review the message carefully before responding."
    : item.truncatedMiddle
      ? "This long SMS was scored across both opening and closing windows (retaining the higher risk score)."
      : null;

  const summary =
    item.verdict === "malicious"
      ? "This SMS message shows spam or smishing indicators."
      : item.verdict === "review"
        ? "SMS assessment is uncertain — review the sender and any embedded links before acting."
        : "No spam or smishing indicators were detected in this SMS message.";

  const recommendedActions =
    item.verdict === "malicious"
      ? [
          "Do not tap links, call callback numbers, or reply with one-time codes from this text.",
          "Inspect any extracted URLs or phone numbers safely in Technical Evidence below.",
          "Block the sender and verify account notices directly through the organization's official app or website.",
        ]
      : item.verdict === "review"
        ? [
            "Confirm the sender independently before acting on links or urgent requests.",
            "Never share one-time passcodes (OTPs) with anyone who contacts you unexpectedly.",
          ]
        : [
            "No smishing indicators were flagged, though you should still verify unexpected payment or login links.",
          ];

  return {
    status: "completed",
    scanId: randomUUID(),
    feature: "sms",
    analyzedAt: asString(obj.analyzed_at) ?? new Date().toISOString(),
    inputLabel: item.sender ? `Single SMS from ${item.sender}` : "Single SMS message",
    inputSizeBytes: null,
    verdict: item.verdict,
    verdictLabel: verdictLabelFor(item.verdict, "Spam / smishing"),
    coverage,
    coverageLabel: coverageLabelFor(coverage),
    coverageDetail,
    riskTier: item.riskTier,
    riskScore: item.spamProbability,
    confidence: item.confidence,
    isUncertain: item.isUncertain,
    uncertaintyReasons: item.uncertaintyFactors,
    advisoryNotice: ADVISORY_NOTICE,
    summary,
    recommendedActions,
    latencyMs: asNumber(perf.total_latency_ms),
    details: {
      kind: "sms",
      mode: "single",
      modelId: asString(obj.model_id),
      thresholdUsed: asNumber(verdictDetails.threshold),
      thresholdOverridden: asBoolean(verdictDetails.threshold_overridden),
      batchSummary: null,
      items: [item],
    },
  };
}

export function mapSmsBatchResponse(
  raw: unknown,
  meta: { label?: string; customThreshold?: boolean } = {},
): ScanOutcome {
  const obj = asRecord(raw);
  const summaryRaw = asRecord(obj.summary);
  const resultsRaw = Array.isArray(obj.results) ? obj.results : [];
  const items = resultsRaw.map((entry, idx) => mapSmsItem(entry, idx));

  const totalMessages = asNumber(summaryRaw.total_messages) ?? items.length;
  const spamCount =
    asNumber(summaryRaw.spam_count) ??
    items.filter((i) => i.verdict === "malicious").length;
  const hamCount =
    asNumber(summaryRaw.ham_count) ??
    items.filter((i) => i.verdict === "benign").length;
  const uncertainCount =
    asNumber(summaryRaw.uncertain_count) ??
    items.filter((i) => i.verdict === "review").length;

  const hasEmptyResults = items.length === 0;
  const verdict: AdvisoryVerdict = hasEmptyResults
    ? "review"
    : spamCount > 0
      ? "malicious"
      : uncertainCount > 0
        ? "review"
        : "benign";

  const hasTruncated = items.some((i) => i.truncatedMiddle);
  const coverage: CoverageStatus = hasEmptyResults
    ? "unreadable"
    : uncertainCount > 0 && spamCount === 0
      ? "ambiguous"
      : hasTruncated
        ? "limited"
        : "complete";

  const maxSpamProb = items.reduce<number | null>((acc, item) => {
    if (item.spamProbability === null) return acc;
    return acc === null ? item.spamProbability : Math.max(acc, item.spamProbability);
  }, null);

  const summary =
    spamCount > 0
      ? `Flagged ${spamCount} of ${totalMessages} messages for spam or smishing (${uncertainCount} uncertain, ${hamCount} clean).`
      : uncertainCount > 0
        ? `No confirmed spam, but ${uncertainCount} of ${totalMessages} messages need human review.`
        : `All ${totalMessages} messages in this batch showed no spam or smishing indicators.`;

  return {
    status: "completed",
    scanId: randomUUID(),
    feature: "sms",
    analyzedAt: new Date().toISOString(),
    inputLabel: meta.label ?? `SMS batch (${totalMessages} messages)`,
    inputSizeBytes: null,
    verdict,
    verdictLabel:
      verdict === "malicious"
        ? `${spamCount} flagged in batch`
        : verdict === "review"
          ? `${uncertainCount} need review`
          : "Batch clean",
    coverage,
    coverageLabel: coverageLabelFor(coverage),
    coverageDetail:
      uncertainCount > 0
        ? `${uncertainCount} message(s) scored inside the uncertainty band and should be reviewed manually.`
        : hasTruncated
          ? "One or more long messages used dual-window scoring."
          : null,
    riskTier: deriveRiskTierFromScore(maxSpamProb, verdict),
    riskScore: maxSpamProb,
    confidence: null,
    isUncertain: uncertainCount > 0,
    uncertaintyReasons:
      uncertainCount > 0
        ? [`${uncertainCount} of ${totalMessages} messages had elevated uncertainty.`]
        : [],
    advisoryNotice: ADVISORY_NOTICE,
    summary,
    recommendedActions:
      spamCount > 0
        ? [
            "Review each flagged message in the batch breakdown below before responding or following links.",
            "Download the JSON summary report if you need to archive or triage findings locally.",
          ]
        : [
            "Inspect any uncertain items below if present, and verify unexpected links out of band.",
          ],
    latencyMs: asNumber(summaryRaw.total_latency_ms),
    details: {
      kind: "sms",
      mode: "batch",
      modelId: asString(summaryRaw.model_id),
      thresholdUsed: asNumber(summaryRaw.threshold_used),
      thresholdOverridden: Boolean(meta.customThreshold),
      batchSummary: {
        totalMessages,
        spamCount,
        hamCount,
        uncertainCount,
        averageLatencyMs: asNumber(summaryRaw.average_latency_ms),
      },
      items,
    },
  };
}

function asNumberRecord(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as JsonRecord).filter(
    ([, v]) => typeof v === "number" && Number.isFinite(v),
  ) as Array<[string, number]>;
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function mapUrlItem(raw: unknown, index: number): UrlItemOutcome {
  const obj = asRecord(raw);
  const verdictDetails = asRecord(obj.verdict_details);
  const parsedRaw = asRecord(obj.parsed_url);
  const branchesRaw = asRecord(obj.branches);
  const perfRaw = asRecord(obj.performance);

  const rawStatus = (asString(obj.status) ?? "unavailable").toLowerCase();
  const status: "ok" | "unsupported" | "unavailable" =
    rawStatus === "ok"
      ? "ok"
      : rawStatus === "unsupported"
        ? "unsupported"
        : "unavailable";

  const reasonCode = asString(obj.reason_code) ?? "unknown";
  const inputKind = asString(obj.input_kind) ?? "unknown";
  const isMalicious =
    asBoolean(obj.is_malicious) ||
    asString(obj.prediction)?.toLowerCase() === "malicious" ||
    asString(obj.verdict)?.toLowerCase() === "malicious";

  const maliciousProbability =
    asNumber(obj.malicious_probability) ??
    asNumber(obj.calibrated_probability) ??
    asNumber(obj.risk_score) ??
    asNumber(obj.p_malicious);

  const benignProbability =
    asNumber(obj.benign_probability) ??
    (maliciousProbability !== null
      ? Math.max(0, Math.min(1, 1 - maliciousProbability))
      : null);

  const rawVerdict = asString(obj.verdict)?.toLowerCase() ?? "";
  const rawIsUncertain = asBoolean(obj.is_uncertain);
  const isNonCompleteStatus =
    status === "unsupported" || status === "unavailable";

  let verdict: AdvisoryVerdict;
  if (isNonCompleteStatus) {
    verdict = "review";
  } else if (isMalicious) {
    verdict = "malicious";
  } else if (rawIsUncertain || rawVerdict === "review") {
    verdict = "review";
  } else {
    verdict = "benign";
  }

  const isUncertain = isNonCompleteStatus || rawIsUncertain || verdict === "review";
  const rawFactors = asStringArray(verdictDetails.uncertainty_factors);
  const uncertaintyFactors =
    rawFactors.length > 0
      ? rawFactors
      : status === "unsupported"
        ? [
            "URL format or scheme is outside supported HTTP(S) and domain coverage.",
          ]
        : status === "unavailable"
          ? ["URL scoring was unavailable for this item."]
          : [];

  const parsedUrl: UrlParsedComponentSummary | null =
    Object.keys(parsedRaw).length > 0
      ? {
          status: asString(parsedRaw.status) ?? status,
          reasonCode: asString(parsedRaw.reason_code) ?? reasonCode,
          inputForm: asString(parsedRaw.input_form) ?? "unknown",
          inputKind: asString(parsedRaw.input_kind) ?? inputKind,
          scheme: asString(parsedRaw.scheme) ?? "",
          host: asString(parsedRaw.host) ?? "",
          modelHost: asString(parsedRaw.model_host) ?? "",
          port: asNumber(parsedRaw.port),
          path: asString(parsedRaw.path) ?? "",
          query: asString(parsedRaw.query) ?? "",
          suffix: asString(parsedRaw.suffix) ?? "",
          modelText: asString(parsedRaw.model_text) ?? "",
          isIp: asBoolean(parsedRaw.is_ip),
          isIdna: asBoolean(parsedRaw.is_idna),
        }
      : null;

  const branchLogits = asNumberRecord(branchesRaw.branch_logits) ?? {};
  const branchProbabilities =
    asNumberRecord(branchesRaw.branch_probabilities) ?? {};
  const branches: UrlBranchBreakdown | null =
    Object.keys(branchesRaw).length > 0 &&
    (Object.keys(branchLogits).length > 0 ||
      Object.keys(branchProbabilities).length > 0 ||
      asString(branchesRaw.route) !== null)
      ? {
          route: asString(branchesRaw.route) ?? asString(obj.route) ?? "fusion",
          fusionLogit: asNumber(branchesRaw.fusion_logit),
          branchLogits,
          branchProbabilities,
        }
      : null;

  return {
    index,
    id: asString(obj.id),
    url: asString(obj.url) ?? "",
    status,
    reasonCode,
    inputKind,
    verdict,
    label: verdict,
    riskTier:
      normalizeRiskTier(obj.risk_level) !== "UNAVAILABLE"
        ? normalizeRiskTier(obj.risk_level)
        : deriveRiskTierFromScore(maliciousProbability, verdict),
    maliciousProbability,
    benignProbability,
    confidence: asNumber(obj.confidence),
    isUncertain,
    predictionEntropy: asNumber(obj.prediction_entropy),
    uncertaintyFactors,
    policyDecision: asString(obj.policy_decision),
    proposedDecision: asString(obj.proposed_decision),
    thresholdApplied: asNumber(verdictDetails.threshold),
    decisionMargin: asNumber(verdictDetails.decision_margin),
    parsedUrl,
    lexicalFeatures: asNumberRecord(obj.lexical_features),
    branches,
    latencyMs: asNumber(perfRaw.total_latency_ms),
    device: asString(perfRaw.device),
  };
}

export function mapUrlSingleResponse(raw: unknown): ScanOutcome {
  const obj = asRecord(raw);
  const verdictDetails = asRecord(obj.verdict_details);
  const perf = asRecord(obj.performance);
  const item = mapUrlItem(obj, 0);

  let coverage: CoverageStatus = "complete";
  let coverageDetail: string | null = null;
  if (item.status === "unsupported") {
    coverage = "unsupported";
    coverageDetail =
      "This link uses an unsupported scheme or format outside HTTP(S) and domain analysis — review manually.";
  } else if (item.status === "unavailable") {
    coverage = "unreadable";
    coverageDetail =
      "The URL scorer could not complete analysis on this destination — review manually before opening.";
  } else if (item.isUncertain) {
    coverage = "ambiguous";
    coverageDetail =
      "URL signals fell near the decision boundary — verify the domain and sender before opening.";
  }

  const hostNote = item.parsedUrl?.isIp
    ? " (raw IP address host)"
    : item.parsedUrl?.isIdna
      ? " (international domain encoding / Punycode)"
      : "";

  const summary =
    item.verdict === "malicious"
      ? `Static URL inspection flagged phishing or malware indicators${hostNote}.`
      : item.verdict === "review"
        ? `Static URL inspection requires human review (${coverageLabelFor(coverage).toLowerCase()})${hostNote}.`
        : `Static URL inspection found no phishing or malware indicators${hostNote}.`;

  const recommendedActions =
    item.verdict === "malicious"
      ? [
          "Do not open this link, sign in, or download files from this destination.",
          "Inspect the host and path breakdown and pattern scores in Technical Evidence below (all rendered safely as non-clickable text).",
          "If this link arrived in an email or text message, report the message and navigate to the service directly via a known bookmark.",
        ]
      : item.verdict === "review"
        ? [
            "Do not treat an unsupported, unavailable, or uncertain URL scan as safe.",
            "Verify the domain spelling and sender independently before visiting this destination.",
          ]
        : [
            "No phishing or malware indicators were flagged by static URL analysis.",
            "Always confirm the domain spelling and HTTPS certificate before entering credentials on unfamiliar pages.",
          ];

  return {
    status: "completed",
    scanId: randomUUID(),
    feature: "url",
    analyzedAt: asString(obj.analyzed_at) ?? new Date().toISOString(),
    inputLabel: item.url || "Single URL",
    inputSizeBytes: null,
    verdict: item.verdict,
    verdictLabel: verdictLabelFor(item.verdict, "Phishing / malicious URL"),
    coverage,
    coverageLabel: coverageLabelFor(coverage),
    coverageDetail,
    riskTier: item.riskTier,
    riskScore: item.maliciousProbability,
    confidence: item.confidence,
    isUncertain: item.isUncertain,
    uncertaintyReasons: item.uncertaintyFactors,
    advisoryNotice: ADVISORY_NOTICE,
    summary,
    recommendedActions,
    latencyMs: asNumber(perf.total_latency_ms) ?? item.latencyMs,
    details: {
      kind: "url",
      mode: "single",
      modelId: asString(obj.model_id),
      bundleId: asString(obj.bundle_id),
      policyVersion: asString(obj.policy_version),
      route: asString(obj.route) ?? item.branches?.route ?? null,
      policyMode: asString(verdictDetails.policy_mode),
      policyStatus: asString(verdictDetails.policy_status),
      thresholdUsed: asNumber(verdictDetails.threshold),
      thresholdOverridden: asBoolean(verdictDetails.threshold_overridden),
      thresholdSource: asString(verdictDetails.threshold_source),
      batchSummary: null,
      items: [item],
    },
  };
}

export function mapUrlBatchResponse(
  raw: unknown,
  meta: { label?: string; customThreshold?: boolean } = {},
): ScanOutcome {
  const obj = asRecord(raw);
  const summaryRaw = asRecord(obj.summary);
  const resultsRaw = Array.isArray(obj.results) ? obj.results : [];
  const items = resultsRaw.map((entry, idx) => mapUrlItem(entry, idx));

  const totalUrls = asNumber(summaryRaw.total_urls) ?? items.length;
  const scoredItems = items.filter((i) => i.status === "ok");
  const scoredCount = scoredItems.length;
  const unsupportedCount = items.filter((i) => i.status === "unsupported").length;
  const unavailableCount = items.filter((i) => i.status === "unavailable").length;
  const maliciousCount = scoredItems.filter((i) => i.verdict === "malicious").length;
  const uncertainCount = scoredItems.filter((i) => i.verdict === "review").length;
  const benignCount = scoredItems.filter((i) => i.verdict === "benign").length;
  const reviewTotalCount = uncertainCount + unsupportedCount + unavailableCount;

  const hasEmptyResults = items.length === 0;
  const verdict: AdvisoryVerdict = hasEmptyResults
    ? "review"
    : maliciousCount > 0
      ? "malicious"
      : reviewTotalCount > 0
        ? "review"
        : "benign";

  const coverage: CoverageStatus = hasEmptyResults
    ? "unreadable"
    : unsupportedCount > 0 || unavailableCount > 0
      ? "partial"
      : uncertainCount > 0
        ? "ambiguous"
        : "complete";

  const coverageDetail =
    unsupportedCount + unavailableCount > 0
      ? `${unsupportedCount + unavailableCount} URL(s) could not be scored completely and require manual review.`
      : uncertainCount > 0
        ? `${uncertainCount} URL(s) scored inside the uncertainty band and should be reviewed manually.`
        : null;

  const maxMaliciousProb = items.reduce<number | null>((acc, item) => {
    if (item.maliciousProbability === null) return acc;
    return acc === null
      ? item.maliciousProbability
      : Math.max(acc, item.maliciousProbability);
  }, null);

  const summary =
    maliciousCount > 0
      ? `Flagged ${maliciousCount} of ${totalUrls} URLs for phishing or malware (${reviewTotalCount} need review, ${benignCount} benign).`
      : reviewTotalCount > 0
        ? `No confirmed malicious URLs, but ${reviewTotalCount} of ${totalUrls} URLs need human review (${benignCount} benign).`
        : `All ${totalUrls} URLs in this batch showed no phishing or malware indicators.`;

  const firstItemRaw = resultsRaw[0] ? asRecord(resultsRaw[0]) : {};
  const firstVerdictDetails = asRecord(firstItemRaw.verdict_details);

  return {
    status: "completed",
    scanId: randomUUID(),
    feature: "url",
    analyzedAt: new Date().toISOString(),
    inputLabel: meta.label ?? `URL batch (${totalUrls} URLs)`,
    inputSizeBytes: null,
    verdict,
    verdictLabel:
      verdict === "malicious"
        ? `${maliciousCount} flagged in batch`
        : verdict === "review"
          ? `${reviewTotalCount} need review`
          : "Batch clean",
    coverage,
    coverageLabel: coverageLabelFor(coverage),
    coverageDetail,
    riskTier: deriveRiskTierFromScore(maxMaliciousProb, verdict),
    riskScore: maxMaliciousProb,
    confidence: null,
    isUncertain: reviewTotalCount > 0,
    uncertaintyReasons:
      reviewTotalCount > 0
        ? [`${reviewTotalCount} of ${totalUrls} URLs require manual review.`]
        : [],
    advisoryNotice: ADVISORY_NOTICE,
    summary,
    recommendedActions:
      maliciousCount > 0
        ? [
            "Review each flagged URL and its host and path breakdown in Technical Evidence below before opening any link.",
            "Download the JSON summary report to archive or share inert indicators with your security team.",
          ]
        : reviewTotalCount > 0
          ? [
              "Inspect the items marked for review in Technical Evidence below and verify unfamiliar domains independently.",
            ]
          : [
              "No phishing or malware indicators were flagged across the submitted URLs.",
            ],
    latencyMs: asNumber(summaryRaw.total_latency_ms),
    details: {
      kind: "url",
      mode: "batch",
      modelId:
        asString(summaryRaw.model_id) ?? asString(firstItemRaw.model_id),
      bundleId: asString(firstItemRaw.bundle_id),
      policyVersion: asString(firstItemRaw.policy_version),
      route: asString(firstItemRaw.route),
      policyMode: asString(firstVerdictDetails.policy_mode),
      policyStatus: asString(firstVerdictDetails.policy_status),
      thresholdUsed: asNumber(summaryRaw.threshold_used),
      thresholdOverridden: Boolean(meta.customThreshold),
      thresholdSource: asString(firstVerdictDetails.threshold_source),
      batchSummary: {
        totalUrls,
        scoredCount,
        unsupportedCount,
        unavailableCount,
        maliciousCount,
        benignCount,
        uncertainCount,
        averageLatencyMs: asNumber(summaryRaw.average_latency_ms),
      },
      items,
    },
  };
}
