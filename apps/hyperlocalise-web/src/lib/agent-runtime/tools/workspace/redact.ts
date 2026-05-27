export const DEFAULT_MAX_FILE_BYTES = 500_000;
export const DEFAULT_MAX_OUTPUT_BYTES = 100_000;
export const MAX_GREP_MATCHES = 100;
export const MAX_GREP_MATCHES_PER_FILE = 10;
export const MAX_GREP_LINE_CHARS = 200;
export const DEFAULT_READ_LINE_LIMIT = 2_000;
export const DEFAULT_GLOB_LIMIT = 100;

const SENSITIVE_ENV_PREFIXES = [
  "HYPERLOCALISE_API_TOKEN=",
  "HYPERLOCALISE_PROJECT_KEY=",
  "CROWDIN_API_TOKEN=",
  "CROWDIN_PROJECT_KEY=",
  "LOKALISE_API_TOKEN=",
  "PHRASE_API_TOKEN=",
  "SMARTLING_API_TOKEN=",
  "SMARTLING_API_SECRET=",
  "OPENAI_API_KEY=",
  "ANTHROPIC_API_KEY=",
  "AZURE_OPENAI_API_KEY=",
  "GEMINI_API_KEY=",
  "MISTRAL_API_KEY=",
  "GROQ_API_KEY=",
  "AWS_ACCESS_KEY_ID=",
  "AWS_SECRET_ACCESS_KEY=",
];

const TOKEN_PATTERN =
  /(\b[a-z0-9_]*(?:token|key|secret|password|api_key|apikey|auth)[a-z0-9_]*\s*[:=]\s*)([a-zA-Z0-9_\-./+]{20,})/gi;

const BEARER_PATTERN = /(Bearer\s+)([a-zA-Z0-9_\-./+]{20,})/gi;

export function redact(input: string): string {
  if (!input) return "";

  let out = input;

  for (const prefix of SENSITIVE_ENV_PREFIXES) {
    out = out
      .split("\n")
      .map((line) => (line.startsWith(prefix) ? prefix + "***REDACTED***" : line))
      .join("\n");
  }

  out = out.replace(TOKEN_PATTERN, "$1***REDACTED***");
  out = out.replace(BEARER_PATTERN, "$1***REDACTED***");

  return out;
}

export function truncate(input: string, maxBytes: number): { text: string; truncated: boolean } {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  if (bytes.length <= maxBytes) {
    return { text: input, truncated: false };
  }
  const truncatedBytes = bytes.slice(0, maxBytes);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(truncatedBytes);
  return { text, truncated: true };
}
