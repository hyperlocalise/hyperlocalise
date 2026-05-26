import { tool } from "ai";
import { z } from "zod";

import { truncate, redact } from "./redact";

const FETCH_TIMEOUT_MS = 30_000;
const MAX_BODY_LENGTH = 10_000;

function normalizeHostname(hostname: string): string {
  const lowerHostname = hostname.toLowerCase();
  if (lowerHostname.startsWith("[") && lowerHostname.endsWith("]")) {
    return lowerHostname.slice(1, -1);
  }
  return lowerHostname;
}

function isPrivateIpv4Address(hostname: string): boolean {
  const octets = hostname.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((value) => Number.isNaN(value))) {
    return false;
  }
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return normalized === "localhost" || isPrivateIpv4Address(normalized);
}

export function isAllowedWebUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  return !isPrivateHost(parsed.hostname);
}

const fetchInputSchema = z.object({
  url: z.string().url().refine(isAllowedWebUrl, "URL must use http(s) and a public host"),
  method: z.enum(["GET", "HEAD"]).optional().describe("HTTP method. Default: GET."),
});

export function createFetchTool() {
  return tool({
    description: `Fetch a public HTTP(S) URL (documentation, public APIs).

WHEN TO USE:
- Reading public documentation or reference pages
- Fetching openly accessible API responses

WHEN NOT TO USE:
- Repository files (use read/grep/glob)
- Internal or private network hosts

USAGE:
- GET or HEAD only
- Response body truncated to ${MAX_BODY_LENGTH} characters`,
    inputSchema: fetchInputSchema,
    execute: async ({ url, method = "GET" }) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method,
          redirect: "follow",
          signal: controller.signal,
        });

        const body = method === "HEAD" ? "" : truncate(await response.text(), MAX_BODY_LENGTH).text;

        return {
          success: true as const,
          status: response.status,
          body: redact(body),
          truncated: body.length >= MAX_BODY_LENGTH,
        };
      } catch (error) {
        return {
          success: false as const,
          error: redact(error instanceof Error ? error.message : String(error)),
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}

export { MAX_BODY_LENGTH };
