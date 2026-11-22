export const TRIAGE_MAX_URL_LENGTH = 8_192;
export const TRIAGE_MAX_SMS_LENGTH = 20_000;

export const NON_NUMERIC_SCHEME_REGEX =
  /^[a-zA-Z][a-zA-Z0-9+.-]*:(?!\d+(?:[/?#]|$))/;

export interface TriageValidationShortcut {
  readonly kind: "switch_to_sms" | "open_url_batch";
  readonly label: string;
  readonly text: string;
}

export type TriageValidationResult =
  | {
      readonly ok: true;
      readonly slug: "url" | "sms";
      readonly mode: "single";
      readonly normalizedText: string;
    }
  | {
      readonly ok: false;
      readonly fieldError: string;
      readonly shortcut?: TriageValidationShortcut;
      readonly secondaryShortcut?: TriageValidationShortcut;
    };

export function looksLikeBareHost(trimmed: string): boolean {
  if (!trimmed || /\s/.test(trimmed)) return false;

  const isLocalhost = /^localhost(?::\d{1,5})?(?:[/?#].*)?$/i.test(trimmed);
  const isBracketedIpv6 = /^\[[0-9a-fA-F:]+\](?::\d{1,5})?(?:[/?#].*)?$/.test(
    trimmed,
  );
  const isDottedHost =
    /^[^\s/?#]+\.[^\s/?#]{1,}(?::\d{1,5})?(?:[/?#].*)?$/u.test(trimmed);

  if (!isLocalhost && !isBracketedIpv6 && !isDottedHost) {
    return false;
  }

  try {
    const parsed = new URL(`https://${trimmed}`);
    if (!parsed.hostname) return false;
    if (isLocalhost || isBracketedIpv6) return true;
    return parsed.hostname.includes(".");
  } catch {
    return false;
  }
}

function isValidHttpOrBareUrlLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return (
        (parsed.protocol === "http:" || parsed.protocol === "https:") &&
        Boolean(parsed.hostname)
      );
    } catch {
      return false;
    }
  }
  if (NON_NUMERIC_SCHEME_REGEX.test(trimmed)) {
    return false;
  }
  return looksLikeBareHost(trimmed);
}

export function hasMultiWordProse(trimmed: string): boolean {
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (/[ \t]+/.test(line) || !isValidHttpOrBareUrlLine(line)) {
      return true;
    }
  }
  return false;
}

export function validateUrlTriageInput(rawText: string): TriageValidationResult {
  const trimmed = rawText.trim();

  if (trimmed.length === 0) {
    return {
      ok: false,
      fieldError: "Enter an HTTP(S) URL or bare domain to inspect.",
    };
  }

  if (/\r|\n/.test(trimmed)) {
    const shortcut: TriageValidationShortcut = {
      kind: "open_url_batch",
      label: "Open URL Batch",
      text: rawText,
    };
    const secondaryShortcut: TriageValidationShortcut | undefined =
      hasMultiWordProse(trimmed)
        ? {
            kind: "switch_to_sms",
            label: "Switch to SMS mode",
            text: rawText,
          }
        : undefined;

    return {
      ok: false,
      fieldError:
        "Single URL triage accepts one link at a time. Open URL Batch for multi-line lists or switch to SMS mode for message text.",
      shortcut,
      ...(secondaryShortcut ? { secondaryShortcut } : {}),
    };
  }

  if (/\s/.test(trimmed)) {
    return {
      ok: false,
      fieldError:
        "Spaces are not valid inside a single URL. Did you mean to scan a text message?",
      shortcut: {
        kind: "switch_to_sms",
        label: "Switch to SMS mode",
        text: rawText,
      },
    };
  }

  if (NON_NUMERIC_SCHEME_REGEX.test(trimmed)) {
    const colonIdx = trimmed.indexOf(":");
    const scheme = colonIdx !== -1 ? trimmed.slice(0, colonIdx).toLowerCase() : "";
    if (scheme !== "http" && scheme !== "https") {
      return {
        ok: false,
        fieldError:
          "Only HTTP(S) URLs and bare hostnames are supported (non-HTTP schemes cannot be scanned safely here).",
      };
    }
  }

  if (trimmed.length > TRIAGE_MAX_URL_LENGTH) {
    return {
      ok: false,
      fieldError: "URLs must be 8,192 characters or fewer.",
    };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (
        (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
        !parsed.hostname
      ) {
        return {
          ok: false,
          fieldError:
            "Enter a valid HTTP(S) URL or domain name (for example, example.com).",
        };
      }
      return {
        ok: true,
        slug: "url",
        mode: "single",
        normalizedText: trimmed,
      };
    } catch {
      return {
        ok: false,
        fieldError:
          "Enter a valid HTTP(S) URL or domain name (for example, example.com).",
      };
    }
  }

  if (!looksLikeBareHost(trimmed)) {
    return {
      ok: false,
      fieldError:
        "Enter a valid HTTP(S) URL or domain name (for example, example.com).",
    };
  }

  return {
    ok: true,
    slug: "url",
    mode: "single",
    normalizedText: trimmed,
  };
}

export function validateSmsTriageInput(rawText: string): TriageValidationResult {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      fieldError: "Paste or type an SMS message to inspect.",
    };
  }

  if (rawText.length > TRIAGE_MAX_SMS_LENGTH) {
    return {
      ok: false,
      fieldError: "SMS messages must be 20,000 characters or fewer.",
    };
  }

  return {
    ok: true,
    slug: "sms",
    mode: "single",
    normalizedText: rawText,
  };
}
