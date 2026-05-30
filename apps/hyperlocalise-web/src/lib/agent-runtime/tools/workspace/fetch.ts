import { tool } from "ai";
import { z } from "zod";

import { assertPublicHttpUrlResolvable, isPublicHttpUrl } from "@/lib/security/ssrf-guard";

import { truncate, redact } from "./redact";

const FETCH_TIMEOUT_MS = 30_000;
const MAX_BODY_LENGTH = 10_000;

export function isAllowedWebUrl(value: string): boolean {
  return isPublicHttpUrl(value);
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
        await assertPublicHttpUrlResolvable(url);

        const response = await fetch(url, {
          method,
          redirect: "error",
          signal: controller.signal,
        });

        if (response.status >= 300 && response.status < 400) {
          return {
            success: false as const,
            error: redact("HTTP redirects are not allowed"),
          };
        }

        const bodyResult =
          method === "HEAD"
            ? { text: "", truncated: false }
            : truncate(await response.text(), MAX_BODY_LENGTH);

        return {
          success: true as const,
          status: response.status,
          body: redact(bodyResult.text),
          truncated: bodyResult.truncated,
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
