import { tool } from "ai";
import { Parser } from "htmlparser2";
import TurndownService from "turndown";
import { z } from "zod";

import { isPublicHttpUrl } from "@/lib/security/ssrf-guard";

import { redact, truncate } from "./redact";

export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
export const DEFAULT_TIMEOUT_SECONDS = 30;
export const MAX_TIMEOUT_SECONDS = 120;
export const MAX_BODY_LENGTH = 100_000;

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
const FALLBACK_USER_AGENT = "hyperlocalise-fetch/1.0";

type Format = "text" | "markdown" | "html";

export function isAllowedWebUrl(value: string): boolean {
  return isPublicHttpUrl(value);
}

const fetchInputSchema = z.object({
  url: z
    .string()
    .url()
    .refine(isAllowedWebUrl, "URL must use http(s) and a public host")
    .describe("The HTTP or HTTPS URL to fetch content from"),
  method: z.enum(["GET", "HEAD"]).optional().describe("HTTP method. Default: GET."),
  format: z
    .enum(["text", "markdown", "html"])
    .optional()
    .describe("The format to return content in for GET requests. Defaults to markdown."),
  timeout: z
    .number()
    .int()
    .positive()
    .max(MAX_TIMEOUT_SECONDS)
    .optional()
    .describe(`Optional timeout in seconds (maximum: ${MAX_TIMEOUT_SECONDS})`),
});

function acceptHeader(format: Format): string {
  switch (format) {
    case "markdown":
      return "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1";
    case "text":
      return "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1";
    case "html":
      return "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1";
  }
}

function requestHeaders(format: Format, userAgent: string): HeadersInit {
  return {
    "User-Agent": userAgent,
    Accept: acceptHeader(format),
    "Accept-Language": "en-US,en;q=0.9",
  };
}

function mimeFrom(contentType: string): string {
  return contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function isImageAttachment(mime: string): boolean {
  return mime.startsWith("image/") && mime !== "image/svg+xml" && mime !== "image/vnd.fastbidsheet";
}

function isTextualMime(mime: string): boolean {
  return (
    !mime ||
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime.endsWith("+json") ||
    mime === "application/xml" ||
    mime.endsWith("+xml") ||
    mime === "application/javascript" ||
    mime === "application/x-javascript"
  );
}

function isCloudflareChallenge(response: Response): boolean {
  return response.status === 403 && response.headers.get("cf-mitigated") === "challenge";
}

function convertContent(content: string, contentType: string, format: Format): string {
  if (!contentType.includes("text/html")) {
    return content;
  }

  if (format === "markdown") {
    return convertHTMLToMarkdown(content);
  }

  if (format === "text") {
    return extractTextFromHTML(content);
  }

  return content;
}

async function readBoundedResponseBody(response: Response): Promise<ArrayBuffer> {
  const body = await response.arrayBuffer();
  if (body.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error(`Response too large (exceeds ${MAX_RESPONSE_BYTES} byte limit)`);
  }
  return body;
}

class CloudflareChallengeError extends Error {
  constructor() {
    super("Cloudflare challenge");
    this.name = "CloudflareChallengeError";
  }
}

async function fetchUrl(
  url: string,
  format: Format,
  timeoutSeconds: number,
  userAgent: string,
): Promise<{ status: number; body: ArrayBuffer; contentType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1_000);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: requestHeaders(format, userAgent),
    });

    if (!response.ok) {
      if (isCloudflareChallenge(response)) {
        throw new CloudflareChallengeError();
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const mime = mimeFrom(contentType);

    if (isImageAttachment(mime)) {
      throw new Error(`Unsupported fetched image content type: ${mime}`);
    }

    if (!isTextualMime(mime)) {
      throw new Error(`Unsupported fetched file content type: ${mime}`);
    }

    return {
      status: response.status,
      body: await readBoundedResponseBody(response),
      contentType,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function extractTextFromHTML(html: string): string {
  let text = "";
  let skipDepth = 0;

  const parser = new Parser({
    onopentag(name) {
      if (
        skipDepth > 0 ||
        ["script", "style", "noscript", "iframe", "object", "embed"].includes(name)
      ) {
        skipDepth++;
      }
    },
    ontext(input) {
      if (skipDepth === 0) {
        text += input;
      }
    },
    onclosetag() {
      if (skipDepth > 0) {
        skipDepth--;
      }
    },
  });

  parser.write(html);
  parser.end();
  return text.trim();
}

export function convertHTMLToMarkdown(html: string): string {
  const turndown = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  });
  turndown.remove(["script", "style", "meta", "link"]);
  return turndown.turndown(html);
}

export function createFetchTool() {
  return tool({
    description: `Fetch content from a public HTTP(S) URL and return it as text, markdown, or HTML. Markdown is the default for HTML pages.

Use a more targeted tool when one is available. This tool is read-only.

WHEN TO USE:
- Reading public documentation, articles, or reference pages
- Fetching openly accessible API responses

WHEN NOT TO USE:
- Repository files (use read/grep/glob)
- Internal or private network hosts

USAGE:
- GET or HEAD only; redirects are not followed
- Response body limited to ${MAX_RESPONSE_BYTES} bytes; output truncated to ${MAX_BODY_LENGTH} characters`,
    inputSchema: fetchInputSchema,
    execute: async ({
      url,
      method = "GET",
      format = "markdown",
      timeout = DEFAULT_TIMEOUT_SECONDS,
    }) => {
      if (method === "HEAD") {
        const controller = new AbortController();
        const headTimeout = setTimeout(() => controller.abort(), timeout * 1_000);

        try {
          const response = await fetch(url, {
            method: "HEAD",
            redirect: "error",
            signal: controller.signal,
          });

          if (response.status >= 300 && response.status < 400) {
            return {
              success: false as const,
              error: redact("HTTP redirects are not allowed"),
            };
          }

          return {
            success: true as const,
            status: response.status,
            url,
            body: "",
            truncated: false,
          };
        } catch (error) {
          return {
            success: false as const,
            error: redact(error instanceof Error ? error.message : String(error)),
          };
        } finally {
          clearTimeout(headTimeout);
        }
      }

      try {
        const fetchResult = await fetchUrl(url, format, timeout, BROWSER_USER_AGENT).catch(
          async (error) => {
            if (error instanceof CloudflareChallengeError) {
              return fetchUrl(url, format, timeout, FALLBACK_USER_AGENT);
            }
            throw error;
          },
        );

        const content = new TextDecoder().decode(fetchResult.body);
        const converted = convertContent(content, fetchResult.contentType, format);
        const bodyResult = truncate(redact(converted), MAX_BODY_LENGTH);

        return {
          success: true as const,
          status: fetchResult.status,
          url,
          contentType: fetchResult.contentType,
          format,
          body: bodyResult.text,
          truncated: bodyResult.truncated,
        };
      } catch (error) {
        return {
          success: false as const,
          url,
          error: redact(error instanceof Error ? error.message : String(error)),
        };
      }
    },
  });
}
