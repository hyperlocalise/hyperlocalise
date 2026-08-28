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

import { fetchCatSegmentValidation } from "./project-file-cat-validation";

const testIntl = getIntlShape("en");

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
      fetcher,
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
      "/api/go-svc/v1/validate/segment",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({
          sourceText: "Hello {name}",
          targetText: "Bonjour {name}",
          sourcePath: "/messages/en.json",
          maxLength: 40,
          targetLocale: "fr-FR",
          modes: ["not_localized", "whitespace_only", "same_as_source", "spelling"],
        }),
      }),
    );
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
      fetcher,
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid_response" }),
    });
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
      fetcher,
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
      fetcher,
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
      fetcher,
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
      fetcher,
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
      fetcher,
    );

    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      sourceText: "Hello",
      targetText: "Bonjour",
      sourcePath: "/messages/en.json",
      modes: ["not_localized", "whitespace_only", "same_as_source"],
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
      fetcher,
    );

    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      sourceText: "Hello",
      targetText: "Bonjour",
      sourcePath: "/messages/en.json",
      targetLocale: "fr-FR",
      modes: ["not_localized", "whitespace_only", "same_as_source", "spelling"],
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
      fetcher,
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "aborted" },
    });
  });
});
