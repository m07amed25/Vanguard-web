import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSlidingWindowRateLimiter,
  healthRateLimiter,
  scanRateLimiter,
} from "../../lib/features/server/rate-limit.ts";
import {
  enforceHealthRateLimit,
  enforceScanRateLimit,
  resolveVisitorKey,
  sanitizeDisplayFilename,
} from "../../lib/features/server/route-helpers.ts";

describe("sliding-window rate limiter", () => {
  it("allows up to 20 requests within a 60-second window and blocks the 21st", () => {
    const now = 1_000_000;
    const limiter = createSlidingWindowRateLimiter({
      maxRequests: 20,
      windowMs: 60_000,
      now: () => now,
    });

    for (let i = 1; i <= 20; i += 1) {
      const result = limiter.consume("203.0.113.10");
      assert.equal(result.allowed, true);
      assert.equal(result.remaining, 20 - i);
      assert.equal(result.retryAfterSeconds, 0);
    }

    const blocked = limiter.consume("203.0.113.10");
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.equal(blocked.retryAfterSeconds, 60);
  });

  it("recovers capacity once the oldest timestamp exits the 60-second window", () => {
    let now = 2_000_000;
    const limiter = createSlidingWindowRateLimiter({
      maxRequests: 2,
      windowMs: 60_000,
      now: () => now,
    });

    assert.equal(limiter.consume("198.51.100.4").allowed, true);
    now += 15_000;
    assert.equal(limiter.consume("198.51.100.4").allowed, true);

    const blocked = limiter.consume("198.51.100.4");
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfterSeconds, 45);

    now += 45_001;
    const allowedAgain = limiter.consume("198.51.100.4");
    assert.equal(allowedAgain.allowed, true);
    assert.equal(allowedAgain.remaining, 0);
  });

  it("isolates visitors by key and bounds stored key count", () => {
    const now = 3_000_000;
    const limiter = createSlidingWindowRateLimiter({
      maxRequests: 1,
      windowMs: 60_000,
      maxKeys: 3,
      now: () => now,
    });

    assert.equal(limiter.consume("visitor-1").allowed, true);
    assert.equal(limiter.consume("visitor-2").allowed, true);
    assert.equal(limiter.consume("visitor-3").allowed, true);
    assert.equal(limiter.consume("visitor-4").allowed, true);
    assert.ok(limiter.size() <= 3);
    assert.equal(limiter.consume("visitor-4").allowed, false);
  });

  it("hardens resolveVisitorKey against leftmost X-Forwarded-For spoofing and caps key length", () => {
    const spoofedXff = new Request("http://localhost:3000/api/features/health", {
      headers: {
        "x-forwarded-for": "1.2.3.4, 198.51.100.77",
      },
    });
    assert.equal(resolveVisitorKey(spoofedXff), "198.51.100.77");

    const vercelHeader = new Request("http://localhost:3000/api/features/health", {
      headers: {
        "x-vercel-forwarded-for": "203.0.113.50",
        "x-forwarded-for": "1.1.1.1, 2.2.2.2",
      },
    });
    assert.equal(resolveVisitorKey(vercelHeader), "203.0.113.50");

    const cfHeader = new Request("http://localhost:3000/api/features/health", {
      headers: {
        "cf-connecting-ip": "203.0.113.99",
        "x-forwarded-for": "1.1.1.1, 2.2.2.2",
      },
    });
    assert.equal(resolveVisitorKey(cfHeader), "203.0.113.99");

    const overlong = new Request("http://localhost:3000/api/features/health", {
      headers: {
        "x-real-ip": "a".repeat(250),
      },
    });
    assert.equal(resolveVisitorKey(overlong).length, 128);
  });

  it("isolates healthRateLimiter (12/min) from scanRateLimiter (20/min)", async () => {
    assert.notEqual(healthRateLimiter, scanRateLimiter);
    const visitorIp = "198.51.100.210";
    const makeReq = () =>
      new Request("http://localhost:3000/api/features/health", {
        headers: { "cf-connecting-ip": visitorIp },
      });

    for (let i = 0; i < 12; i += 1) {
      assert.equal(enforceHealthRateLimit(makeReq()), null);
    }

    const blockedHealth = enforceHealthRateLimit(makeReq());
    assert.notEqual(blockedHealth, null);
    if (blockedHealth) {
      assert.equal(blockedHealth.status, 429);
      const body = (await blockedHealth.json()) as { message: string; code: string };
      assert.equal(body.code, "rate_limited");
      assert.ok(body.message.includes("12 per minute"));
    }

    // Exhausting health status checks must NOT subtract from the visitor's 20-scan quota
    assert.equal(enforceScanRateLimit(makeReq()), null);
  });

  it("preserves file extensions when sanitizeDisplayFilename truncates filenames longer than 180 chars", () => {
    const longName = `${"a".repeat(210)}.pdf`;
    const sanitized = sanitizeDisplayFilename(longName, "document.pdf");
    assert.ok(sanitized.length <= 180);
    assert.ok(sanitized.endsWith(".pdf"));
  });
});
