/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it, vi } from "vite-plus/test";

import { getIntlShape } from "@/lib/app-i18n/intl";
import { GoSvcClient } from "@/lib/go-svc/go-svc-client";

import { fetchCatSegmentValidation } from "./project-file-content-editor-validation";
import { projectFileCatValidationMessages } from "./project-file-content-editor-validation.messages";

const testIntl = getIntlShape("en");

function clientWith(
  fetcher: ReturnType<typeof vi.fn>,
  getAccessToken: () => string | null | undefined = () => "access-token",
) {
  return new GoSvcClient({
    baseUrl: "https://api.hyperlocalise.com",
    getAccessToken,
    fetch: fetcher as unknown as typeof fetch,
  });
}

describe("fetchCatSegmentValidation", () => {
  it("posts the segment and all QA modes to go-svc", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          checks: [
            {
              id: "format-parity",
              label: "Placeholders & ICU",
              status: "pass",
              message: "Target keeps the required placeholders and ICU structure.",
              category: "placeholder",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await fetchCatSegmentValidation(
      {
        sourceText: "Hello {name}",
        targetText: "Bonjour {name}",
        sourcePath: "/messages/en.json",
        targetLocale: "fr-FR",
        maxLength: 40,
        intl: testIntl,
      },
      clientWith(fetcher),
    );

    expect(result).toEqual({
      ok: true,
      value: [
        {
          id: "format-parity",
          label: "Placeholders & ICU",
          status: "pass",
          message: "Target keeps the required placeholders and ICU structure.",
          category: "placeholder",
        },
      ],
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.hyperlocalise.com/v1/validate/segment",
      expect.objectContaining({
        method: "POST",
        credentials: "omit",
        headers: expect.any(Headers),
        body: JSON.stringify({
          sourceText: "Hello {name}",
          targetText: "Bonjour {name}",
          sourcePath: "/messages/en.json",
          maxLength: 40,
          targetLocale: "fr-FR",
          modes: [
            "not_localized",
            "whitespace_only",
            "same_as_source",
            "escaped_char_mismatch",
            "spelling",
          ],
        }),
      }),
    );
    const request = fetcher.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(request).toBeDefined();
    expect(new Headers(request?.headers).get("authorization")).toBe("Bearer access-token");
  });

  it("rejects malformed service responses", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ checks: [{ status: "unknown" }] }), { status: 200 }),
      );

    const result = await fetchCatSegmentValidation(
      {
        sourceText: "Hello",
        targetText: "Bonjour",
        sourcePath: "/messages/en.json",
        targetLocale: "fr-FR",
        intl: testIntl,
      },
      clientWith(fetcher),
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid_response" }),
    });
  });

  it("keeps transport failures localized while logging the implementation error", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const result = await fetchCatSegmentValidation(
        {
          sourceText: "Hello",
          targetText: "Bonjour",
          sourcePath: "/messages/en.json",
          targetLocale: "fr-FR",
          intl: testIntl,
        },
        clientWith(fetcher),
      );

      expect(result).toEqual({
        ok: false,
        error: {
          code: "service_error",
          message: testIntl.formatMessage(projectFileCatValidationMessages.requestFailed),
        },
      });
      expect(warn).toHaveBeenCalledWith(
        "[cat-validation] Go service request failed",
        expect.objectContaining({ code: "network_error", message: "Unable to reach go-svc" }),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("keeps missing-token failures localized", async () => {
    const fetcher = vi.fn();
    const result = await fetchCatSegmentValidation(
      {
        sourceText: "Hello",
        targetText: "Bonjour",
        sourcePath: "/messages/en.json",
        targetLocale: "fr-FR",
        intl: testIntl,
      },
      clientWith(fetcher, () => null),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "service_error",
        message: testIntl.formatMessage(projectFileCatValidationMessages.requestFailed),
      },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("accepts spelling checks and optional skippedModes on the response", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          checks: [
            {
              id: "format-parity",
              label: "Placeholders & ICU",
              status: "pass",
              message: "Target keeps the required placeholders and ICU structure.",
              category: "placeholder",
            },
            {
              id: "spelling",
              label: "Spelling",
              status: "warn",
              message: "Possible misspelling: recieve.",
              category: "spelling",
              relatedTokens: ["recieve"],
            },
          ],
          skippedModes: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await fetchCatSegmentValidation(
      {
        sourceText: "Please receive the update",
        targetText: "Please recieve the update",
        sourcePath: "/messages/en.json",
        targetLocale: "en-US",
        intl: testIntl,
      },
      clientWith(fetcher),
    );

    expect(result).toEqual({
      ok: true,
      value: [
        {
          id: "format-parity",
          label: "Placeholders & ICU",
          status: "pass",
          message: "Target keeps the required placeholders and ICU structure.",
          category: "placeholder",
        },
        {
          id: "spelling",
          label: "Spelling",
          status: "warn",
          message: "Possible misspelling: recieve.",
          category: "spelling",
          relatedTokens: ["recieve"],
        },
      ],
    });
  });

  it("parses mocked responses that omit spelling fields", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          checks: [
            {
              id: "format-parity",
              label: "Format",
              status: "pass",
              message: "No placeholders or ICU blocks detected.",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await fetchCatSegmentValidation(
      {
        sourceText: "Hello",
        targetText: "Bonjour",
        sourcePath: "/messages/en.json",
        targetLocale: "fr-FR",
        intl: testIntl,
      },
      clientWith(fetcher),
    );

    expect(result).toEqual({
      ok: true,
      value: [
        {
          id: "format-parity",
          label: "Format",
          status: "pass",
          message: "No placeholders or ICU blocks detected.",
        },
      ],
    });
  });

  it("accepts skippedModes without treating a skipped spelling mode as a pass", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          checks: [
            {
              id: "format-parity",
              label: "Format",
              status: "pass",
              message: "No placeholders or ICU blocks detected.",
              category: "placeholder",
            },
          ],
          skippedModes: ["spelling"],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await fetchCatSegmentValidation(
      {
        sourceText: "Hello",
        targetText: "こんにちは",
        sourcePath: "/messages/en.json",
        targetLocale: "ja-JP",
        intl: testIntl,
      },
      clientWith(fetcher),
    );

    expect(result).toEqual({
      ok: true,
      value: [
        {
          id: "format-parity",
          label: "Format",
          status: "pass",
          message: "No placeholders or ICU blocks detected.",
          category: "placeholder",
        },
      ],
    });
    expect(result.ok && result.value.some((check) => check.category === "spelling")).toBe(false);
  });

  it("does not surface a spelling pass when spelling was skipped", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          checks: [
            {
              id: "format-parity",
              label: "Format",
              status: "pass",
              message: "No placeholders or ICU blocks detected.",
              category: "placeholder",
            },
            {
              id: "spelling",
              label: "Spelling",
              status: "pass",
              message: "No spelling issues found.",
              category: "spelling",
            },
          ],
          skippedModes: ["spelling"],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await fetchCatSegmentValidation(
      {
        sourceText: "Hello",
        targetText: "こんにちは",
        sourcePath: "/messages/en.json",
        targetLocale: "ja-JP",
        intl: testIntl,
      },
      clientWith(fetcher),
    );

    expect(result).toEqual({
      ok: true,
      value: [
        {
          id: "format-parity",
          label: "Format",
          status: "pass",
          message: "No placeholders or ICU blocks detected.",
          category: "placeholder",
        },
      ],
    });
  });

  it("omits spelling for a non-BCP-47 locale so other checks still run", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ checks: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await fetchCatSegmentValidation(
      {
        sourceText: "Hello",
        targetText: "Bonjour",
        sourcePath: "/messages/en.json",
        targetLocale: "invalid_locale_format",
        intl: testIntl,
      },
      clientWith(fetcher),
    );

    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      sourceText: "Hello",
      targetText: "Bonjour",
      sourcePath: "/messages/en.json",
      targetLocale: "invalid_locale_format",
      modes: ["not_localized", "whitespace_only", "same_as_source", "escaped_char_mismatch"],
    });
  });

  it("omits spelling and targetLocale when the segment has no locale", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ checks: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await fetchCatSegmentValidation(
      {
        sourceText: "Hello",
        targetText: "Bonjour",
        sourcePath: "/messages/en.json",
        targetLocale: "   ",
        intl: testIntl,
      },
      clientWith(fetcher),
    );

    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      sourceText: "Hello",
      targetText: "Bonjour",
      sourcePath: "/messages/en.json",
      modes: ["not_localized", "whitespace_only", "same_as_source", "escaped_char_mismatch"],
    });
  });

  it("omits maxLength when the segment has no positive limit", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ checks: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await fetchCatSegmentValidation(
      {
        sourceText: "Hello",
        targetText: "Bonjour",
        sourcePath: "/messages/en.json",
        targetLocale: "fr-FR",
        intl: testIntl,
      },
      clientWith(fetcher),
    );

    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      sourceText: "Hello",
      targetText: "Bonjour",
      sourcePath: "/messages/en.json",
      targetLocale: "fr-FR",
      modes: [
        "not_localized",
        "whitespace_only",
        "same_as_source",
        "escaped_char_mismatch",
        "spelling",
      ],
    });
  });

  it("returns an aborted result when the request is cancelled", async () => {
    const abortController = new AbortController();
    const fetcher = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
      abortController.abort();
      init.signal?.throwIfAborted();
      return new Response();
    });

    const result = await fetchCatSegmentValidation(
      {
        sourceText: "Hello",
        targetText: "Bonjour",
        sourcePath: "/messages/en.json",
        targetLocale: "fr-FR",
        signal: abortController.signal,
        intl: testIntl,
      },
      clientWith(fetcher),
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "aborted" },
    });
  });

  it("posts acceptedWords when the project dictionary overlay has tokens", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ checks: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await fetchCatSegmentValidation(
      {
        sourceText: "Hello",
        targetText: "Please recieve Hyperlocalise",
        sourcePath: "/messages/en.json",
        targetLocale: "en-US",
        acceptedWords: ["Hyperlocalise", "AuthKit"],
        intl: testIntl,
      },
      clientWith(fetcher),
    );

    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({
      acceptedWords: ["Hyperlocalise", "AuthKit"],
      modes: expect.arrayContaining(["spelling"]),
    });
  });
});
