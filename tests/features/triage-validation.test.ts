import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NON_NUMERIC_SCHEME_REGEX,
  TRIAGE_MAX_SMS_LENGTH,
  TRIAGE_MAX_URL_LENGTH,
  validateSmsTriageInput,
  validateUrlTriageInput,
} from "../../lib/features/triage-validation.ts";

describe("immediate triage URL and SMS single-item validation", () => {
  it("accepts HTTP(S) URLs, bare domains, host:port, IPv4/IPv6 literals, and IDN hosts", () => {
    const https = validateUrlTriageInput("  https://example.com/login?next=/app  ");
    assert.equal(https.ok, true);
    if (https.ok) {
      assert.equal(https.slug, "url");
      assert.equal(https.mode, "single");
      assert.equal(https.normalizedText, "https://example.com/login?next=/app");
    }

    const bareHost = validateUrlTriageInput("sub.example.co.uk/path");
    assert.equal(bareHost.ok, true);

    const hostWithPort = validateUrlTriageInput("portal.example.com:8443/auth");
    assert.equal(hostWithPort.ok, true);
    assert.equal(NON_NUMERIC_SCHEME_REGEX.test("portal.example.com:8443/auth"), false);

    const ipv4 = validateUrlTriageInput("192.0.2.15:8080/status");
    assert.equal(ipv4.ok, true);

    const ipv6 = validateUrlTriageInput("http://[2001:db8::1]:8080/check");
    assert.equal(ipv6.ok, true);

    const bareIpv6 = validateUrlTriageInput("[2001:db8::1]/login");
    assert.equal(bareIpv6.ok, true);

    const idn = validateUrlTriageInput("https://مثال.إختبار/path");
    assert.equal(idn.ok, true);
  });

  it("rejects empty URL input, non-HTTP(S) schemes, and URLs over 8,192 characters", () => {
    const empty = validateUrlTriageInput("   ");
    assert.equal(empty.ok, false);

    const jsScheme = validateUrlTriageInput("javascript:alert(1)");
    assert.equal(jsScheme.ok, false);
    if (!jsScheme.ok) {
      assert.ok(jsScheme.fieldError.includes("Only HTTP(S) URLs"));
    }

    const ftpScheme = validateUrlTriageInput("ftp://files.example.com/archive.zip");
    assert.equal(ftpScheme.ok, false);

    const tooLong = validateUrlTriageInput(
      `https://example.com/${"a".repeat(TRIAGE_MAX_URL_LENGTH)}`,
    );
    assert.equal(tooLong.ok, false);
    if (!tooLong.ok) {
      assert.ok(tooLong.fieldError.includes("8,192"));
    }
  });

  it("detects multi-line URL lists and internal whitespace before new URL parsing, offering non-erasing shortcuts", () => {
    const multiLineUrls = "https://one.example.com\nhttps://two.example.com";
    const multiRes = validateUrlTriageInput(multiLineUrls);
    assert.equal(multiRes.ok, false);
    if (!multiRes.ok) {
      assert.equal(multiRes.shortcut?.kind, "open_url_batch");
      assert.equal(multiRes.shortcut?.label, "Open URL Batch");
      assert.equal(multiRes.shortcut?.text, multiLineUrls);
      assert.equal(multiRes.secondaryShortcut, undefined);
    }

    const multiLineProse = "URGENT: Your package is held\nVisit https://example.com/track";
    const multiProseRes = validateUrlTriageInput(multiLineProse);
    assert.equal(multiProseRes.ok, false);
    if (!multiProseRes.ok) {
      assert.equal(multiProseRes.shortcut?.kind, "open_url_batch");
      assert.equal(multiProseRes.secondaryShortcut?.kind, "switch_to_sms");
      assert.equal(multiProseRes.secondaryShortcut?.label, "Switch to SMS mode");
      assert.equal(multiProseRes.secondaryShortcut?.text, multiLineProse);
    }

    // Internal tab or space inside an http:// string must be rejected BEFORE new URL() silently strips tabs
    const urlWithSpace = "https://example.com/login please verify your account";
    const spaceRes = validateUrlTriageInput(urlWithSpace);
    assert.equal(spaceRes.ok, false);
    if (!spaceRes.ok) {
      assert.equal(spaceRes.shortcut?.kind, "switch_to_sms");
      assert.equal(spaceRes.shortcut?.label, "Switch to SMS mode");
      assert.equal(spaceRes.shortcut?.text, urlWithSpace);
    }

    const urlWithTab = "https://example.com/a\tb";
    const tabRes = validateUrlTriageInput(urlWithTab);
    assert.equal(tabRes.ok, false);
    if (!tabRes.ok) {
      assert.equal(tabRes.shortcut?.kind, "switch_to_sms");
    }
  });

  it("validates single SMS messages up to 20,000 characters including multilingual, RTL, and link-only messages", () => {
    const emptySms = validateSmsTriageInput("   \n  ");
    assert.equal(emptySms.ok, false);

    const arabicSms = validateSmsTriageInput(
      "تنبيه أمني: يرجى تأكيد حسابك عبر الرابط https://example.test/verify",
    );
    assert.equal(arabicSms.ok, true);
    if (arabicSms.ok) {
      assert.equal(arabicSms.slug, "sms");
      assert.equal(arabicSms.mode, "single");
    }

    const bareLinkSms = validateSmsTriageInput("https://example.test/claim-prize");
    assert.equal(bareLinkSms.ok, true);

    const oversizedSms = validateSmsTriageInput(
      "x".repeat(TRIAGE_MAX_SMS_LENGTH + 1),
    );
    assert.equal(oversizedSms.ok, false);
    if (!oversizedSms.ok) {
      assert.ok(oversizedSms.fieldError.includes("20,000"));
    }
  });
});
