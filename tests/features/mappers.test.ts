import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapEmailResponse,
  mapExeResponse,
  mapOfficeResponse,
  mapPdfResponse,
  mapSmsBatchResponse,
  mapSmsSingleResponse,
  mapUrlBatchResponse,
  mapUrlSingleResponse,
} from "../../lib/features/server/mappers.ts";

describe("upstream response normalizers", () => {
  it("strips raw base64 payloads from Email responses and preserves inert artifacts", () => {
    const raw = {
      filename: "notice.eml",
      model_input: { subject: "Invoice", body: "Visit https://example.test/pay" },
      prediction: {
        risk_score: 0.91,
        severe_score: 0.44,
        action: "quarantine",
        mode: "full",
        reason_codes: ["suspicious_link"],
        model_version: "email-v2",
        policy_version: "policy-1",
        verdict: "malicious",
        threshold: 0.5,
      },
      email_addresses: ["billing@example.test"],
      links: ["https://example.test/pay"],
      attachments: [
        {
          filename: "doc.pdf",
          content_type: "application/pdf",
          disposition: "attachment",
          content_id: null,
          content_base64: "SGVsbG8=", // 5 bytes
        },
      ],
      eml_base64: "U0VDUkVUX0VNTFlfUkFX",
      message: { headers: [], content_base64: "U0VDUkVU" },
    };

    const mapped = mapEmailResponse(raw, {
      filename: "notice.eml",
      sizeBytes: 1024,
    });

    assert.equal(mapped.feature, "email");
    assert.equal(mapped.verdict, "malicious");
    assert.equal(mapped.coverage, "complete");
    assert.equal(mapped.details.kind, "email");
    if (mapped.details.kind === "email") {
      assert.equal(mapped.details.attachments[0]?.sizeBytes, 5);
      assert.equal(
        JSON.stringify(mapped).includes("U0VDUkVU"),
        false,
        "Raw base64 payloads must be stripped from normalized output",
      );
      assert.equal(
        JSON.stringify(mapped).includes("SGVsbG8="),
        false,
        "Attachment base64 bytes must not be echoed to browser",
      );
    }
  });

  it("routes unavailable Email predictions to review and never benign", () => {
    const mapped = mapEmailResponse(
      {
        filename: "empty.eml",
        model_input: { subject: "", body: "" },
        prediction: {
          risk_score: null,
          severe_score: null,
          action: "review",
          mode: "unavailable",
          reason_codes: ["no_text"],
          model_version: "email-v2",
          policy_version: "policy-1",
          verdict: null,
          threshold: null,
        },
        email_addresses: [],
        links: [],
        attachments: [],
      },
      { filename: "empty.eml", sizeBytes: 120 },
    );

    assert.equal(mapped.verdict, "review");
    assert.equal(mapped.riskScore, null);
    assert.notEqual(mapped.coverage, "complete");
  });

  it("keeps Office scan_status separate from verdict and forces non-complete scans to review", () => {
    const encrypted = mapOfficeResponse(
      {
        request_id: "req-1",
        model_version: "office-2.0",
        observed_format: "cfb",
        format_candidates: ["cfb"],
        scan_status: "opaque_encrypted",
        verdict: "benign", // Even if corrupted upstream claimed benign, mapper must enforce review
        reason_codes: ["encrypted_container"],
        malice_prob: null,
        threat_category: null,
        modality_availability: { A: false, B: false, C: false, D: false },
        disagreement: null,
      },
      { filename: "locked.docx", sizeBytes: 4096 },
    );

    assert.equal(encrypted.coverage, "encrypted");
    assert.equal(encrypted.verdict, "review");
    assert.equal(encrypted.riskScore, null);

    const malicious = mapOfficeResponse(
      {
        request_id: "req-2",
        model_version: "office-2.0",
        observed_format: "opc",
        format_candidates: ["opc"],
        scan_status: "complete",
        verdict: "malicious",
        reason_codes: ["macro_autoexec"],
        malice_prob: 0.94,
        threat_category: { macro_dropper: 0.82, phish_lure: 0.12 },
        modality_availability: { A: true, B: true, C: true, D: false },
        disagreement: 0.04,
        primary_attribution: "macro_dropper",
        primary_attribution_score: 0.82,
        low_confidence_attribution: false,
      },
      { filename: "macro.docm", sizeBytes: 8192 },
    );

    assert.equal(malicious.coverage, "complete");
    assert.equal(malicious.verdict, "malicious");
    assert.equal(malicious.details.kind, "office");
    if (malicious.details.kind === "office") {
      assert.equal(malicious.details.primaryAttribution, "macro_dropper");
      assert.equal(malicious.details.threatCategories[0]?.category, "macro_dropper");
    }
  });

  it("never collapses encrypted or unparseable PDF scans into benign", () => {
    const encryptedPdf = mapPdfResponse(
      {
        filename: "secret.pdf",
        prediction: "benign",
        is_malicious: false,
        confidence: 0.91,
        malicious_probability: 0.09,
        benign_probability: 0.91,
        risk_level: "LOW",
        is_uncertain: false,
        pdf_metadata: {
          pdf_version: "1.7",
          num_pages: 2,
          is_encrypted: true,
          parse_success: true,
          parsers_used: ["pypdf"],
          parser_errors: [],
        },
        security_indicators: { extracted_urls: ["https://example.test/doc"] },
      },
      { filename: "secret.pdf", sizeBytes: 2048, deepInspection: true },
    );

    assert.equal(encryptedPdf.coverage, "encrypted");
    assert.equal(encryptedPdf.verdict, "review");
  });

  it("routes uncertain EXE scans to review and flags skipped deep inspection as limited", () => {
    const uncertainExe = mapExeResponse(
      {
        filename: "tool.exe",
        prediction: "benign",
        is_malicious: false,
        confidence: 0.54,
        malware_probability: 0.46,
        benign_probability: 0.54,
        risk_level: "MEDIUM",
        is_uncertain: true,
        model_disagreement: 0.38,
        verdict_details: {
          threshold: 0.28,
          operating_point: "fpr_1pct",
          uncertainty_factors: ["Model disagreement exceeds threshold"],
        },
      },
      { filename: "tool.exe", sizeBytes: 120_000, deepInspection: true },
    );

    assert.equal(uncertainExe.verdict, "review");
    assert.equal(uncertainExe.coverage, "ambiguous");
    assert.equal(uncertainExe.isUncertain, true);

    const shallowBenign = mapExeResponse(
      {
        filename: "clean.dll",
        prediction: "benign",
        is_malicious: false,
        confidence: 0.99,
        malware_probability: 0.01,
        benign_probability: 0.99,
        risk_level: "SAFE",
        is_uncertain: false,
      },
      { filename: "clean.dll", sizeBytes: 40_000, deepInspection: false },
    );

    assert.equal(shallowBenign.verdict, "benign");
    assert.equal(shallowBenign.coverage, "limited");
  });

  it("maps SMS single and batch responses with aggregate verdict precedence", () => {
    const single = mapSmsSingleResponse({
      text: "Your dental appointment is confirmed for tomorrow at 10 AM.",
      prediction: "ham",
      label: "ham",
      verdict: "safe",
      is_spam: false,
      is_malicious: false,
      spam_probability: 0.0018,
      confidence: 0.9982,
      risk_level: "SAFE",
      is_uncertain: false,
      model_id: "e5_sms_v3/best",
      verdict_details: { threshold: 0.5, threshold_overridden: false, uncertainty_factors: [] },
      text_analysis: { language: "en", script: "latin", token_count: 12, window_count: 1, truncated_middle: false },
      entities: { urls: [], shortened_urls: [], emails: [], phone_numbers: [], otp_codes: [], has_zero_width_chars: false, has_lookalike_chars: false },
      security_indicators: { heuristic_signals: [], looks_like_otp: false, has_obfuscation: false },
      performance: { total_latency_ms: 42.5 },
    });

    assert.equal(single.verdict, "benign");
    assert.equal(single.coverage, "complete");
    assert.equal(single.details.kind, "sms");

    const batch = mapSmsBatchResponse({
      summary: {
        total_messages: 2,
        spam_count: 1,
        ham_count: 1,
        uncertain_count: 0,
        threshold_used: 0.5,
        model_id: "e5_sms_v3/best",
        total_latency_ms: 90,
        average_latency_ms: 45,
      },
      results: [
        {
          text: "Hi there",
          label: "ham",
          is_spam: false,
          is_malicious: false,
          spam_probability: 0.01,
          confidence: 0.99,
          risk_level: "SAFE",
          is_uncertain: false,
        },
        {
          text: "Urgent verify https://example.test/bank",
          label: "spam",
          is_spam: true,
          is_malicious: true,
          spam_probability: 0.97,
          confidence: 0.97,
          risk_level: "CRITICAL",
          is_uncertain: false,
          entities: { urls: ["https://example.test/bank"] },
        },
      ],
    });

    assert.equal(batch.verdict, "malicious");
    assert.equal(batch.details.kind, "sms");
    if (batch.details.kind === "sms") {
      assert.equal(batch.details.mode, "batch");
      assert.equal(batch.details.batchSummary?.spamCount, 1);
      assert.equal(batch.details.items.length, 2);
    }
  });

  it("maps URL single responses with WHATWG parsed components, 5-branch probabilities, and lexical features", () => {
    const single = mapUrlSingleResponse({
      id: "url-101",
      url: "http://xn--pple-43d.example.test:8080/login/verify?token=1",
      status: "ok",
      reason_code: "shadow_only",
      input_kind: "full_url",
      prediction: "malicious",
      label: "malicious",
      verdict: "malicious",
      is_malicious: true,
      malicious_probability: 0.962,
      benign_probability: 0.038,
      risk_score: 0.962,
      calibrated_probability: 0.962,
      p_malicious: 0.962,
      confidence: 0.962,
      risk_level: "CRITICAL",
      is_uncertain: false,
      prediction_entropy: 0.161,
      policy_decision: "review",
      proposed_decision: "block",
      route: "fusion",
      bundle_id: "bundle-sha-256",
      policy_version: "policy-sha-256",
      model_id: "URL Model.h5",
      analyzed_at: "2026-11-20T12:00:00Z",
      verdict_details: {
        threshold: 0.5,
        default_threshold: 0.5,
        threshold_overridden: false,
        threshold_source: "default",
        decision_margin: 0.462,
        uncertainty_factors: [],
        policy_mode: "shadow_only",
        policy_status: "no_block_threshold",
        policy_block_threshold: null,
        policy_review_threshold: null,
      },
      parsed_url: {
        status: "ok",
        reason_code: "ok",
        input_form: "absolute",
        input_kind: "full_url",
        scheme: "http",
        host: "xn--pple-43d.example.test",
        model_host: "xn--pple-43d.example.test",
        port: 8080,
        path: "/login/verify",
        query: "token=1",
        suffix: "test",
        model_text: "http://xn--pple-43d.example.test:8080/login/verify?token=1",
        is_ip: false,
        is_idna: true,
      },
      lexical_features: {
        url_len: 58,
        host_len: 25,
        digit_ratio: 0.086,
      },
      branches: {
        route: "fusion",
        fusion_logit: 3.2314,
        branch_logits: {
          byte: 2.91,
          subword: 3.45,
          catboost_d6: 2.1,
          catboost_d8: 2.34,
          tfidf: 1.88,
        },
        branch_probabilities: {
          byte: 0.9483,
          subword: 0.9692,
          catboost_d6: 0.8909,
          catboost_d8: 0.9121,
          tfidf: 0.8676,
        },
      },
      performance: {
        parse_ms: 0.42,
        inference_ms: 14.1,
        total_latency_ms: 14.8,
        device: "cpu",
      },
    });

    assert.equal(single.feature, "url");
    assert.equal(single.verdict, "malicious");
    assert.equal(single.coverage, "complete");
    assert.equal(single.riskTier, "CRITICAL");
    assert.equal(single.riskScore, 0.962);
    assert.equal(single.details.kind, "url");
    if (single.details.kind === "url") {
      assert.equal(single.details.mode, "single");
      assert.equal(single.details.route, "fusion");
      assert.equal(single.details.items[0]?.parsedUrl?.isIdna, true);
      assert.equal(single.details.items[0]?.parsedUrl?.port, 8080);
      assert.equal(
        single.details.items[0]?.branches?.branchProbabilities.subword,
        0.9692,
      );
      assert.equal(single.details.items[0]?.lexicalFeatures?.url_len, 58);
    }
  });

  it("routes unsupported, unavailable, and uncertain URL single responses to review (never benign) and propagates uncertainty factors", () => {
    const unsupported = mapUrlSingleResponse({
      url: "javascript:alert(1)",
      status: "unsupported",
      reason_code: "unsupported_scheme",
      input_kind: "unknown",
      prediction: "unknown",
      label: "unknown",
      verdict: "review",
      is_malicious: false,
      malicious_probability: null,
      benign_probability: null,
      confidence: null,
      risk_level: "UNKNOWN",
      is_uncertain: true,
      policy_decision: "review",
      proposed_decision: "review",
      route: "fusion",
      bundle_id: "b1",
      policy_version: "p1",
      model_id: "URL Model.h5",
      analyzed_at: "2026-11-20T12:00:00Z",
    });

    assert.equal(unsupported.verdict, "review");
    assert.equal(unsupported.coverage, "unsupported");
    assert.equal(unsupported.isUncertain, true);
    assert.equal(unsupported.riskScore, null);
    assert.equal(unsupported.summary.includes("5-branch"), false);
    assert.equal(unsupported.summary.includes("WHATWG"), false);

    const unavailable = mapUrlSingleResponse({
      url: "https://offline.example.test",
      status: "unavailable",
      reason_code: "scorer_unavailable",
      input_kind: "full_url",
      prediction: "unknown",
      label: "unknown",
      verdict: "review",
      is_malicious: false,
      malicious_probability: null,
      benign_probability: null,
      confidence: null,
      risk_level: "UNKNOWN",
      is_uncertain: true,
    });

    assert.equal(unavailable.verdict, "review");
    assert.equal(unavailable.coverage, "unreadable");
    assert.equal(unavailable.isUncertain, true);

    const uncertain = mapUrlSingleResponse({
      url: "https://vanguard-test-ten.vercel.app/",
      status: "ok",
      reason_code: "shadow_only",
      input_kind: "host_only",
      prediction: "benign",
      label: "benign",
      verdict: "safe",
      is_malicious: false,
      malicious_probability: 0.3098,
      benign_probability: 0.6902,
      confidence: 0.6902,
      risk_level: "LOW",
      is_uncertain: true,
      verdict_details: {
        threshold: 0.5,
        default_threshold: 0.5,
        threshold_overridden: false,
        threshold_source: "default",
        decision_margin: -0.1902,
        uncertainty_factors: ["high_prediction_entropy"],
        policy_mode: "shadow_only",
        policy_status: "no_block_threshold",
      },
    });

    assert.equal(uncertain.verdict, "review");
    assert.equal(uncertain.coverage, "ambiguous");
    assert.equal(uncertain.isUncertain, true);
    assert.deepEqual(uncertain.uncertaintyReasons, ["high_prediction_entropy"]);
  });

  it("maps URL batch responses with mutually exclusive benignCount and uncertainCount and review precedence", () => {
    const mixedBatch = mapUrlBatchResponse({
      summary: {
        total_urls: 3,
        scored_count: 2,
        unsupported_count: 1,
        unavailable_count: 0,
        malicious_count: 0,
        benign_count: 1,
        uncertain_count: 1,
        threshold_used: 0.5,
        model_id: "URL Model.h5",
        total_latency_ms: 22.4,
        average_latency_ms: 11.2,
      },
      results: [
        {
          url: "https://example.test/ok",
          status: "ok",
          reason_code: "shadow_only",
          input_kind: "full_url",
          prediction: "benign",
          label: "benign",
          verdict: "safe",
          is_malicious: false,
          malicious_probability: 0.02,
          benign_probability: 0.98,
          confidence: 0.98,
          risk_level: "SAFE",
          is_uncertain: false,
        },
        {
          url: "https://vanguard-test-ten.vercel.app/",
          status: "ok",
          reason_code: "shadow_only",
          input_kind: "host_only",
          prediction: "benign",
          label: "benign",
          verdict: "review",
          is_malicious: false,
          malicious_probability: 0.31,
          benign_probability: 0.69,
          confidence: 0.69,
          risk_level: "LOW",
          is_uncertain: true,
          verdict_details: {
            uncertainty_factors: ["borderline_decision_margin"],
          },
        },
        {
          url: "ftp://files.example.test/archive.zip",
          status: "unsupported",
          reason_code: "unsupported_scheme",
          input_kind: "unknown",
          is_malicious: false,
          is_uncertain: true,
        },
      ],
    });

    assert.equal(mixedBatch.verdict, "review");
    assert.equal(mixedBatch.coverage, "partial");
    assert.equal(mixedBatch.isUncertain, true);
    assert.equal(mixedBatch.details.kind, "url");
    if (mixedBatch.details.kind === "url") {
      assert.equal(mixedBatch.details.items[0]?.verdict, "benign");
      assert.equal(mixedBatch.details.items[1]?.verdict, "review");
      assert.equal(mixedBatch.details.items[2]?.verdict, "review");
      assert.equal(mixedBatch.details.batchSummary?.totalUrls, 3);
      assert.equal(mixedBatch.details.batchSummary?.maliciousCount, 0);
      assert.equal(mixedBatch.details.batchSummary?.benignCount, 1);
      assert.equal(mixedBatch.details.batchSummary?.uncertainCount, 1);
      assert.equal(mixedBatch.details.batchSummary?.unsupportedCount, 1);
    }
  });

  it("never falls back to benign on unrecognized URL statuses, empty batches, or encrypted/forced-review confidence", () => {
    const errorUrl = mapUrlSingleResponse({
      url: "https://example.test/timeout",
      status: "error",
      reason_code: "internal_timeout",
      is_malicious: false,
    });
    assert.equal(errorUrl.verdict, "review");
    assert.equal(errorUrl.coverage, "unreadable");

    const emptyUrlBatch = mapUrlBatchResponse({ results: [] });
    assert.equal(emptyUrlBatch.verdict, "review");
    assert.equal(emptyUrlBatch.coverage, "unreadable");

    const emptySmsBatch = mapSmsBatchResponse({ results: [] });
    assert.equal(emptySmsBatch.verdict, "review");
    assert.equal(emptySmsBatch.coverage, "unreadable");

    const partialOffice = mapOfficeResponse(
      {
        scan_status: "partial",
        verdict: "benign",
        malice_prob: 0.05,
        observed_format: "opc",
      },
      { filename: "partial.docx", sizeBytes: 1024 },
    );
    assert.equal(partialOffice.verdict, "review");
    assert.equal(partialOffice.confidence, null);

    const encryptedPdf = mapPdfResponse(
      {
        prediction: "benign",
        is_malicious: false,
        confidence: 0.91,
        malicious_probability: 0.09,
        risk_level: "LOW",
        is_uncertain: false,
        pdf_metadata: { is_encrypted: true, parse_success: true },
      },
      { filename: "locked.pdf", sizeBytes: 2048, deepInspection: true },
    );
    assert.equal(encryptedPdf.verdict, "review");
    assert.equal(encryptedPdf.confidence, null);
    assert.equal(encryptedPdf.riskTier, "UNAVAILABLE");
  });
});
