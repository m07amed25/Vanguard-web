export const FEATURE_SLUGS = [
  "url",
  "email",
  "sms",
  "office",
  "pdf",
  "exe",
] as const;

export type FeatureSlug = (typeof FEATURE_SLUGS)[number];

export type ExecutionState = "idle" | "submitting" | "completed" | "failed";

export type CoverageStatus =
  | "complete"
  | "partial"
  | "encrypted"
  | "unsupported"
  | "unreadable"
  | "ambiguous"
  | "limited";

export type AdvisoryVerdict = "benign" | "malicious" | "review";

export type RiskTier =
  | "SAFE"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL"
  | "UNAVAILABLE";

export type FeatureDomainGroup =
  | "Links & Destinations"
  | "Messages"
  | "Files & Binaries";

export type FeatureIconKey =
  | "overview"
  | "link"
  | "mail"
  | "message-square"
  | "file-spreadsheet"
  | "file-text"
  | "binary";

export interface FeatureGroupDefinition {
  readonly category: FeatureDomainGroup;
  readonly slugs: readonly FeatureSlug[];
}

export interface ScanningFeatureDefinition {
  readonly slug: FeatureSlug;
  readonly name: string;
  readonly shortLabel: string;
  readonly category: FeatureDomainGroup;
  readonly iconKey: FeatureIconKey;
  readonly summary: string;
  readonly route: `/features/${FeatureSlug}`;
  readonly apiPath: `/api/features/${FeatureSlug}`;
  readonly inputKind: "file" | "text-or-batch";
  readonly acceptedExtensions: readonly string[];
  readonly formatLabel: string;
  readonly limitLabel: string;
  readonly maxFileSizeBytes: number | null;
  readonly maxTextLength: number | null;
  readonly maxBatchItems: number | null;
  readonly timeoutMs: number;
  readonly batchTimeoutMs: number | null;
  readonly hasBatchMode: boolean;
  readonly hasAdvancedOptions: boolean;
  readonly staticSafetyNote: string;
}

export type FileScannerSlug = "email" | "office" | "pdf" | "exe";

export type DetectedContentKind =
  | FileScannerSlug
  | "generic-zip"
  | "image"
  | "archive"
  | "executable-other"
  | "text-unstructured"
  | "polyglot"
  | "unknown";

export type FileSignatureFailureCode =
  | "validation_error"
  | "payload_too_large"
  | "unsupported_content"
  | "extension_mismatch";

export interface FileClassificationInput {
  readonly filename: string;
  readonly totalSizeBytes: number;
  readonly prefixBytes: Uint8Array;
  readonly tailBytes?: Uint8Array;
  readonly expectedSlug?: FileScannerSlug;
}

export type FileSignatureResult =
  | {
      ok: true;
      targetSlug: FileScannerSlug;
      detectedLabel: string;
      claimedExtension: string | null;
      isExtensionless: boolean;
    }
  | {
      ok: false;
      code: FileSignatureFailureCode;
      httpStatus: 400 | 413 | 422;
      message: string;
      fieldError: string;
      claimedExtension: string | null;
      detectedKind: DetectedContentKind;
    };

export type TriageMode = "file" | "url" | "sms";

export interface TriageDraftState {
  file: File | null;
  url: string;
  sms: string;
}

export type PendingTriageHandoff =
  | {
      readonly id: string;
      readonly kind: "file";
      readonly slug: FileScannerSlug;
      readonly mode: "single";
      readonly file: File;
      readonly autoSubmit: true;
      readonly createdAt: number;
    }
  | {
      readonly id: string;
      readonly kind: "url";
      readonly slug: "url";
      readonly mode: "single";
      readonly text: string;
      readonly autoSubmit: true;
      readonly createdAt: number;
    }
  | {
      readonly id: string;
      readonly kind: "url";
      readonly slug: "url";
      readonly mode: "batch";
      readonly text: string;
      readonly autoSubmit: false;
      readonly createdAt: number;
    }
  | {
      readonly id: string;
      readonly kind: "sms";
      readonly slug: "sms";
      readonly mode: "single" | "batch";
      readonly text: string;
      readonly autoSubmit: boolean;
      readonly createdAt: number;
    };

export interface FeatureReadinessItem {
  slug: FeatureSlug;
  ready: boolean;
  reachable: boolean;
  statusLabel: "Ready" | "Unavailable";
  latencyMs: number | null;
}

export interface ServiceReadinessSnapshot {
  overallStatus: "healthy" | "degraded" | "down" | "unconfigured";
  readyCount: number;
  totalCount: number;
  checkedAt: string;
  features: Record<FeatureSlug, FeatureReadinessItem>;
}

export interface EmailAttachmentSummary {
  filename: string | null;
  contentType: string;
  disposition: string | null;
  contentId: string | null;
  sizeBytes: number | null;
}

export interface EmailScanDetails {
  kind: "email";
  mode: string;
  action: string;
  threshold: number | null;
  severeScore: number | null;
  modelVersion: string | null;
  policyVersion: string | null;
  reasonCodes: string[];
  cleanedSubject: string;
  cleanedBodyExcerpt: string;
  emailAddresses: string[];
  links: string[];
  attachments: EmailAttachmentSummary[];
}

export interface ExeSectionSummary {
  name: string;
  entropy: number | null;
  virtualSize: number | null;
  rawSize: number | null;
  isExec: boolean;
  isWrite: boolean;
  isRead: boolean;
  isWx: boolean;
}

export interface ExeExplanationFactor {
  feature: string;
  direction: string;
  contribution: number | null;
  description: string | null;
}

export interface ExeScanDetails {
  kind: "exe";
  prediction: string;
  malwareProbability: number | null;
  benignProbability: number | null;
  modelDisagreement: number | null;
  predictionEntropy: number | null;
  threshold: number | null;
  operatingPoint: string | null;
  decisionMargin: number | null;
  models: {
    hybridProbability: number | null;
    gbdtProbability: number | null;
    ensembleProbability: number | null;
    consensus: string | null;
    activeRunId: string | null;
  } | null;
  hashes: {
    sha256?: string;
    md5?: string;
    sha1?: string;
    imphash?: string;
  } | null;
  peHeaders: {
    machine?: string;
    subsystem?: string;
    compilationTimestamp?: string;
    isTimestomped?: boolean;
    isSigned?: boolean;
    hasTlsCallbacks?: boolean;
    entryPointSection?: string;
  } | null;
  sections: ExeSectionSummary[];
  securityIndicators: {
    maxSectionEntropy: number | null;
    isHighEntropy: boolean;
    hasWxSections: boolean;
    packerDetected: boolean;
    suspiciousApis: string[];
    heuristicRedFlags: string[];
    topIndicators: string[];
  } | null;
  explanationSummary: string | null;
  topFactors: ExeExplanationFactor[];
}

export interface OfficeScanDetails {
  kind: "office";
  requestId: string | null;
  modelVersion: string | null;
  observedFormat: string;
  formatCandidates: string[];
  rawScanStatus: string;
  reasonCodes: string[];
  disagreement: number | null;
  modalityAvailability: Record<string, boolean> | null;
  primaryAttribution: string | null;
  primaryAttributionScore: number | null;
  lowConfidenceAttribution: boolean | null;
  threatCategories: Array<{ category: string; score: number }>;
}

export interface PdfFeatureContribution {
  feature: string;
  value: number | null;
  contribution: number | null;
  direction: string;
}

export interface PdfScanDetails {
  kind: "pdf";
  prediction: string;
  maliciousProbability: number | null;
  benignProbability: number | null;
  modelDisagreement: number | null;
  predictionEntropy: number | null;
  threshold: number | null;
  estimatorUsed: string | null;
  decisionMargin: number | null;
  models: {
    rfProbability: number | null;
    etProbability: number | null;
    lrProbability: number | null;
    lgbmProbability: number | null;
    ensembleProbability: number | null;
    stdDev: number | null;
    consensus: string | null;
    modelVersion: string | null;
  } | null;
  hashes: {
    sha256?: string;
    md5?: string;
    sha1?: string;
  } | null;
  metadata: {
    pdfVersion: string | null;
    numPages: number | null;
    isEncrypted: boolean;
    parseSuccess: boolean;
    author: string | null;
    creator: string | null;
    producer: string | null;
    title: string | null;
    parsersUsed: string[];
    parserErrors: string[];
  } | null;
  securityIndicators: {
    byteEntropy: number | null;
    javascriptCount: number;
    openActionCount: number;
    aaCount: number;
    launchCount: number;
    embeddedFileCount: number;
    xfaCount: number;
    acroFormCount: number;
    uriCount: number;
    nameObfuscationCount: number;
    extractedUrls: string[];
    suspiciousStrings: string[];
    heuristicRedFlags: string[];
  } | null;
  explanationSummary: string | null;
  topContributingFeatures: PdfFeatureContribution[];
  rawFeatures: Record<string, number> | null;
}

export interface SmsItemOutcome {
  index: number;
  id: string | null;
  sender: string | null;
  textExcerpt: string;
  verdict: AdvisoryVerdict;
  label: string;
  riskTier: RiskTier;
  spamProbability: number | null;
  confidence: number | null;
  isUncertain: boolean;
  uncertaintyFactors: string[];
  language: string | null;
  script: string | null;
  tokenCount: number | null;
  windowCount: number | null;
  truncatedMiddle: boolean;
  entities: {
    urls: string[];
    shortenedUrls: string[];
    emails: string[];
    phoneNumbers: string[];
    otpCodes: string[];
    hasZeroWidthChars: boolean;
    hasLookalikeChars: boolean;
  };
  heuristicSignals: string[];
  looksLikeOtp: boolean;
  hasObfuscation: boolean;
}

export interface SmsScanDetails {
  kind: "sms";
  mode: "single" | "batch";
  modelId: string | null;
  thresholdUsed: number | null;
  thresholdOverridden: boolean;
  batchSummary: {
    totalMessages: number;
    spamCount: number;
    hamCount: number;
    uncertainCount: number;
    averageLatencyMs: number | null;
  } | null;
  items: SmsItemOutcome[];
}

export interface UrlParsedComponentSummary {
  status: string;
  reasonCode: string;
  inputForm: string;
  inputKind: string;
  scheme: string;
  host: string;
  modelHost: string;
  port: number | null;
  path: string;
  query: string;
  suffix: string;
  modelText: string;
  isIp: boolean;
  isIdna: boolean;
}

export interface UrlBranchBreakdown {
  route: string;
  fusionLogit: number | null;
  branchLogits: Record<string, number>;
  branchProbabilities: Record<string, number>;
}

export interface UrlItemOutcome {
  index: number;
  id: string | null;
  url: string;
  status: "ok" | "unsupported" | "unavailable";
  reasonCode: string;
  inputKind: string;
  verdict: AdvisoryVerdict;
  label: string;
  riskTier: RiskTier;
  maliciousProbability: number | null;
  benignProbability: number | null;
  confidence: number | null;
  isUncertain: boolean;
  predictionEntropy: number | null;
  uncertaintyFactors: string[];
  policyDecision: string | null;
  proposedDecision: string | null;
  thresholdApplied: number | null;
  decisionMargin: number | null;
  parsedUrl: UrlParsedComponentSummary | null;
  lexicalFeatures: Record<string, number> | null;
  branches: UrlBranchBreakdown | null;
  latencyMs: number | null;
  device: string | null;
}

export interface UrlScanDetails {
  kind: "url";
  mode: "single" | "batch";
  modelId: string | null;
  bundleId: string | null;
  policyVersion: string | null;
  route: string | null;
  policyMode: string | null;
  policyStatus: string | null;
  thresholdUsed: number | null;
  thresholdOverridden: boolean;
  thresholdSource: string | null;
  batchSummary: {
    totalUrls: number;
    scoredCount: number;
    unsupportedCount: number;
    unavailableCount: number;
    maliciousCount: number;
    benignCount: number;
    uncertainCount: number;
    averageLatencyMs: number | null;
  } | null;
  items: UrlItemOutcome[];
}

export type FeatureSpecificDetails =
  | EmailScanDetails
  | ExeScanDetails
  | OfficeScanDetails
  | PdfScanDetails
  | SmsScanDetails
  | UrlScanDetails;

export interface ScanOutcome {
  status: "completed";
  scanId: string;
  feature: FeatureSlug;
  analyzedAt: string;
  inputLabel: string;
  inputSizeBytes: number | null;
  verdict: AdvisoryVerdict;
  verdictLabel: string;
  coverage: CoverageStatus;
  coverageLabel: string;
  coverageDetail: string | null;
  riskTier: RiskTier;
  riskScore: number | null;
  confidence: number | null;
  isUncertain: boolean;
  uncertaintyReasons: string[];
  advisoryNotice: string;
  summary: string;
  recommendedActions: string[];
  latencyMs: number | null;
  details: FeatureSpecificDetails;
}

export type ScanErrorCode =
  | "validation_error"
  | "payload_too_large"
  | "unsupported_content"
  | "rate_limited"
  | "service_unavailable"
  | "timeout"
  | "upstream_error";

export interface ScanErrorResponse {
  status: "failed";
  code: ScanErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
  retryable: boolean;
  retryAfterSeconds?: number;
  diagnosticId: string;
}

export type ScanApiResponse = ScanOutcome | ScanErrorResponse;
