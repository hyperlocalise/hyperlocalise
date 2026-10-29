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

import {
  createLoopsClient,
  isLoopsLanguageLabelUnsupportedError,
  isLoopsLegacyContentError,
  isLoopsNotFoundError,
  LoopsApiError,
  selectLoopsCopyByName,
} from "./client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function paginated<T>(data: T[], nextCursor: string | null = null) {
  return {
    pagination: {
      totalResults: data.length,
      returnedResults: data.length,
      perPage: 20,
      totalPages: 1,
      nextCursor,
      nextPage: null,
    },
    data,
  };
}

describe("createLoopsClient", () => {
  it("lists transactional emails across pages", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("cursor=next")) {
        return jsonResponse(paginated([{ id: "t2", name: "Two", draftEmailMessageId: "m2" }]));
      }
      return jsonResponse(
        paginated([{ id: "t1", name: "One", draftEmailMessageId: "m1" }], "next"),
      );
    });

    const client = createLoopsClient({ apiKey: "key", fetchImpl });
    const items = await client.listTransactionalEmails();

    expect(items.map((item) => item.id)).toEqual(["t1", "t2"]);
    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer key");
  });

  it("reads a flat email message response", async () => {
    const fetchImpl = async () =>
      jsonResponse({
        id: "m1",
        subject: "Hi",
        previewText: "Preview",
        fromName: "Team",
        fromEmail: "team",
        replyToEmail: "reply@example.com",
        languageCode: "en",
        emailFormat: "styled",
        lmx: "<Document><Paragraph>Hi</Paragraph></Document>",
        contentRevisionId: "rev-1",
        updatedAt: "2026-01-01T00:00:00Z",
      });

    const client = createLoopsClient({ apiKey: "key", fetchImpl });
    const message = await client.getEmailMessage("m1");

    expect(message).toMatchObject({
      id: "m1",
      subject: "Hi",
      lmx: "<Document><Paragraph>Hi</Paragraph></Document>",
      contentRevisionId: "rev-1",
    });
  });

  it("maps a 409 to the legacy content error", async () => {
    const fetchImpl = async () => jsonResponse({ error: "legacy MJML content" }, 409);

    const client = createLoopsClient({ apiKey: "key", fetchImpl });

    try {
      await client.getEmailMessage("m1");
      expect.unreachable();
    } catch (error) {
      expect(isLoopsLegacyContentError(error)).toBe(true);
    }
  });

  it("maps API failures to LoopsApiError with the status", async () => {
    const fetchImpl = async () => jsonResponse({ error: "nope" }, 401);

    const client = createLoopsClient({ apiKey: "key", fetchImpl });

    try {
      await client.listCampaigns();
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(LoopsApiError);
      expect((error as LoopsApiError).status).toBe(401);
      expect((error as LoopsApiError).message).toContain("nope");
    }
  });

  it("collects SendEmailAction nodes from a workflow graph", async () => {
    const fetchImpl = async () =>
      jsonResponse({
        id: "w1",
        url: "https://app.loops.so/workflows/w1",
        status: "Draft",
        name: "Onboarding",
        mailingListId: null,
        rootNodeId: "n1",
        workflowRevisionId: null,
        nodes: {
          n1: { typeName: "EventTrigger", nextNodeIds: ["n2"] },
          n2: {
            typeName: "SendEmailAction",
            nextNodeIds: [],
            emailMessageId: "m9",
            subject: "Welcome",
          },
        },
      });

    const client = createLoopsClient({ apiKey: "key", fetchImpl });

    expect(await client.listWorkflowEmailNodes("w1")).toEqual([
      { nodeId: "n2", emailMessageId: "m9" },
    ]);
  });

  it("creates a transactional copy and updates its draft message", async () => {
    const seen: string[] = [];
    const fetchImpl = async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      seen.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/transactional-emails")) {
        return jsonResponse({
          id: "t-copy",
          name: "Welcome [fr]",
          draftEmailMessageId: "m-copy",
          draftEmailMessageContentRevisionId: "rev-0",
        });
      }
      return jsonResponse({ id: "m-copy", contentRevisionId: "rev-1" });
    };

    const client = createLoopsClient({ apiKey: "key", fetchImpl });
    const created = await client.createTransactionalEmail("Welcome [fr]");
    const updated = await client.updateEmailMessage({
      emailMessageId: created.draftEmailMessageId ?? "",
      expectedRevisionId: created.draftEmailMessageContentRevisionId ?? "",
      languageCode: "fr",
      lmx: "<Document><Paragraph>Bonjour</Paragraph></Document>",
    });

    expect(created.id).toBe("t-copy");
    expect(updated.contentRevisionId).toBe("rev-1");
    expect(
      seen.some((entry) => entry.startsWith("POST") && entry.includes("/email-messages/")),
    ).toBe(true);
  });
});

describe("isLoopsLanguageLabelUnsupportedError", () => {
  it("matches the translations-not-enabled team error", () => {
    expect(
      isLoopsLanguageLabelUnsupportedError(
        new LoopsApiError({
          message: "400 - Translations are not enabled for this team.",
          status: 400,
        }),
      ),
    ).toBe(true);
  });

  it("matches languageCode validation errors", () => {
    expect(
      isLoopsLanguageLabelUnsupportedError(
        new LoopsApiError({ message: "Invalid languageCode: xx", status: 400 }),
      ),
    ).toBe(true);
  });

  it("rejects unrelated API errors", () => {
    expect(
      isLoopsLanguageLabelUnsupportedError(
        new LoopsApiError({ message: "Loops request failed with status 500.", status: 500 }),
      ),
    ).toBe(false);
    expect(isLoopsLanguageLabelUnsupportedError(new Error("nope"))).toBe(false);
  });
});

describe("isLoopsNotFoundError", () => {
  it("matches 404s from deleted Loops copies", () => {
    expect(
      isLoopsNotFoundError(new LoopsApiError({ message: "404 - Campaign not found", status: 404 })),
    ).toBe(true);
  });

  it("rejects other statuses and error shapes", () => {
    expect(
      isLoopsNotFoundError(
        new LoopsApiError({ message: "Loops request failed with status 500.", status: 500 }),
      ),
    ).toBe(false);
    expect(isLoopsNotFoundError(new Error("404 - Campaign not found"))).toBe(false);
  });
});

describe("selectLoopsCopyByName", () => {
  const copy = (id: string, name: string, updatedAt: string) => ({ id, name, updatedAt });

  it("returns null when nothing matches", () => {
    expect(selectLoopsCopyByName([copy("a", "Other [fr]", "2026-10-29")], "Welcome [fr]")).toEqual({
      match: null,
      duplicateCount: 0,
    });
  });

  it("matches exactly and reports no duplicates for a single copy", () => {
    expect(
      selectLoopsCopyByName(
        [copy("a", "Other [fr]", "2026-10-29"), copy("b", "Welcome [fr]", "2026-10-29")],
        "Welcome [fr]",
      ),
    ).toEqual({ match: copy("b", "Welcome [fr]", "2026-10-29"), duplicateCount: 0 });
  });

  it("picks the newest copy and counts the extras", () => {
    const { match, duplicateCount } = selectLoopsCopyByName(
      [
        copy("old", "Welcome [fr]", "2026-10-27T00:00:00.000Z"),
        copy("new", "Welcome [fr]", "2026-10-28T00:00:00.000Z"),
      ],
      "Welcome [fr]",
    );
    expect(match?.id).toBe("new");
    expect(duplicateCount).toBe(1);
  });
});
