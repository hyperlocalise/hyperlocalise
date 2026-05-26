/**
 * Normalizes a GitHub App PEM private key from environment variables.
 * Hosting platforms often store PEMs as a single line with escaped newlines,
 * wrapped in quotes, or base64-encoded.
 */
export function normalizeGitHubAppPrivateKey(raw: string): string {
  let key = raw.trim();

  if (key.charCodeAt(0) === 0xfeff) {
    key = key.slice(1).trim();
  }

  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }

  while (key.includes("\\\\n")) {
    key = key.replaceAll("\\\\n", "\n");
  }

  while (key.includes("\\n")) {
    key = key.replaceAll("\\n", "\n");
  }

  key = key.replaceAll("\r\n", "\n").replaceAll("\r", "\n");

  if (!key.includes("-----BEGIN")) {
    try {
      const decoded = Buffer.from(key, "base64").toString("utf8");
      if (decoded.includes("-----BEGIN")) {
        key = decoded;
      }
    } catch {
      // Keep the original value when base64 decoding fails.
    }
  }

  return key.trim();
}

const PEM_PRIVATE_KEY_HEADER = /^-----BEGIN (?:RSA )?PRIVATE KEY-----$/m;
const PEM_PRIVATE_KEY_FOOTER = /^-----END (?:RSA )?PRIVATE KEY-----$/m;

/** Structural PEM check only (safe for workflow import graphs; no node:crypto). */
export function assertGitHubAppPrivateKeyParsable(privateKey: string): void {
  const trimmed = privateKey.trim();

  if (!PEM_PRIVATE_KEY_HEADER.test(trimmed) || !PEM_PRIVATE_KEY_FOOTER.test(trimmed)) {
    throw new Error("invalid GitHub App private key PEM format");
  }
}

function githubApiErrorText(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error).toLowerCase();
  }

  const parts = [error.message];
  if ("response" in error && error.response && typeof error.response === "object") {
    const response = error.response as { data?: unknown };
    if (response.data && typeof response.data === "object" && response.data !== null) {
      const data = response.data as { message?: string };
      if (typeof data.message === "string") {
        parts.push(data.message);
      }
    }
  }

  return parts.join(" ").toLowerCase();
}

/** Local PEM/OpenSSL failures and GitHub JWT auth rejections for app credentials. */
export function isGitHubAppPrivateKeyDecoderError(error: unknown): boolean {
  const message = githubApiErrorText(error);
  return (
    message.includes("decoder routines") ||
    message.includes("no start line") ||
    message.includes("bad decrypt") ||
    message.includes("error:1e08010c") ||
    message.includes("invalid github app private key pem format") ||
    message.includes("json web token could not be decoded")
  );
}
