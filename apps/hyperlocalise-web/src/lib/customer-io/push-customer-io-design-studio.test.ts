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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";
import { db } from "@/lib/database/client";
import { extractHtmlIngestEntries } from "@/lib/projects/files/html-ingest-entries";

const mocks = vi.hoisted(() => ({
  getLatestRepositorySourceFileVersion: vi.fn(),
  getStoredFileContent: vi.fn(),
  loadAsPrefilledEntries: vi.fn(),
}));

vi.mock("@/lib/file-storage/records", () => ({
  getLatestRepositorySourceFileVersion: mocks.getLatestRepositorySourceFileVersion,
  getStoredFileContent: mocks.getStoredFileContent,
}));

vi.mock("@/lib/projects/translations/project-translation-service", () => ({
  ProjectTranslationService: class {
    loadAsPrefilledEntries = mocks.loadAsPrefilledEntries;
  },
}));

vi.mock("./credentials", () => ({
  loadCustomerIoAutomationClient: vi.fn(async () => ({
    ok: true,
    value: { apiKey: "key", region: "us" },
  })),
}));

import type { CustomerIoDesignStudioTranslationContent } from "./design-studio-client";
import { serializeCustomerIoEmailEnvelope } from "./html-envelope";
import { runPushCustomerIoCampaigns } from "./push-customer-io-campaigns";

const EMAIL_UUID = "31488f77-b1d5-4256-ad6e-c049deff19c5";
const DS_SUBJECT = "Untitled Automation 1: 10 Reasons to Upgrade";
const DS_BODY = "<x-base><x-section><x-paragraph>Hello</x-paragraph></x-section></x-base>";

type RecordedRequestBody = {
  language?: string;
  content?: CustomerIoDesignStudioTranslationContent;
} | null;

type RecordedCall = { url: string; method: string; body: RecordedRequestBody };

function jsonResponse(body: object | null, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function automation(overrides?: { overwriteWhenRemoteNewer?: boolean }): WorkspaceAutomationRecord {
  return {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: "user-1",
    status: "active",
    name: "Customer.io",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    model: "openai/gpt-6-luna",
    configVersion: 1,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    toolConfig: {
      customerIo: {
        enabled: true,
        broadcastIds: [],
        campaignIds: ["1"],
        newsletterIds: [],
        transactionalMessageIds: [],
        broadcastActions: {},
        campaignActions: {},
        newsletterActions: {},
        transactionalMessageActions: {},
        existingTranslationPolicy: "seed_empty",
        overwriteWhenRemoteNewer: overrides?.overwriteWhenRemoteNewer ?? true,
      },
    },
  };
}

function mockProjectRow() {
  vi.spyOn(db, "select").mockImplementation(() => {
    const builder = Promise.resolve([{ sourceLocale: "en", targetLocales: ["zh-CN"] }]) as Promise<
      unknown[]
    > & {
      from: ReturnType<typeof vi.fn>;
      where: ReturnType<typeof vi.fn>;
      limit: ReturnType<typeof vi.fn>;
    };
    builder.from = vi.fn(() => builder);
    builder.where = vi.fn(() => builder);
    builder.limit = vi.fn(async () => [{ sourceLocale: "en", targetLocales: ["zh-CN"] }]);
    return builder as unknown as ReturnType<typeof db.select>;
  });
}

function setup(options: {
  availableLanguages: string[];
  translationHtml: string | null;
  translationUpdated: number;
  storedText: string;
  prefilled: Record<string, string>;
  sourceCreatedAt: Date;
}): { calls: RecordedCall[] } {
  mockProjectRow();
  mocks.getLatestRepositorySourceFileVersion.mockResolvedValue({
    storedFileId: "file-1",
    createdAt: options.sourceCreatedAt,
    sourceHash: "hash",
  });
  mocks.getStoredFileContent.mockResolvedValue({
    file: {},
    content: Buffer.from(options.storedText, "utf8"),
  });
  mocks.loadAsPrefilledEntries.mockResolvedValue({
    prefilled: options.prefilled,
    translatedKeyCount: Object.keys(options.prefilled).length,
  });

  const calls: RecordedCall[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
    const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    const method = init?.method ?? "GET";
    let body: RecordedRequestBody = null;
    if (typeof init?.body === "string" && init.body) {
      body = JSON.parse(init.body) as RecordedRequestBody;
    }
    if (method !== "GET") {
      calls.push({ url: href, method, body });
    }
    if (href.includes("/broadcasts?")) {
      return jsonResponse({ broadcasts: [] });
    }
    if (href.includes("/newsletters?")) {
      return jsonResponse({ newsletters: [] });
    }
    if (href.includes("/transactional?")) {
      return jsonResponse({ messages: [] });
    }
    if (href.endsWith("/campaigns?limit=100")) {
      return jsonResponse({ campaigns: [{ id: 1, name: "Untitled Automation 1" }] });
    }
    if (href.endsWith("/campaigns/1/actions")) {
      return jsonResponse({
        actions: [
          {
            id: "6",
            type: "email",
            language: "",
            name: "10 Reasons to Upgrade",
            subject: DS_SUBJECT,
            body: "<p>compiled</p>",
          },
        ],
      });
    }
    if (href.includes("/design_studio/emails?")) {
      return jsonResponse({
        emails: [
          {
            id: EMAIL_UUID,
            name: "Untitled Automation 1: 10 Reasons to Upgrade",
            is_linked: true,
            has_translations: true,
          },
        ],
        meta: { pagination: { total: 1, limit: 1000, page: 1 } },
      });
    }
    const languageMatch = /\/design_studio\/emails\/[^/]+\/languages(\/[^/?]+)?/.exec(href);
    if (languageMatch) {
      if (method === "POST") {
        return jsonResponse({}, 201);
      }
      if (method === "PUT") {
        return jsonResponse(null, 204);
      }
      if (options.translationHtml === null) {
        return jsonResponse({}, 404);
      }
      return jsonResponse({
        email_translation: {
          language: "zh-cn",
          available_languages: options.availableLanguages,
          content: {
            subject: DS_SUBJECT,
            preheader_text: "",
            html: options.translationHtml,
          },
          updated: options.translationUpdated,
        },
      });
    }
    if (href.endsWith(`/design_studio/emails/${EMAIL_UUID}`)) {
      return jsonResponse({
        email: {
          id: EMAIL_UUID,
          name: "Untitled Automation 1: 10 Reasons to Upgrade",
          available_languages: options.availableLanguages,
          content: { subject: DS_SUBJECT, preheader_text: "", html: DS_BODY },
          updated: 1793114784,
        },
      });
    }
    throw new Error(`unexpected Customer.io request: ${method} ${href}`);
  });
  vi.stubGlobal("fetch", fetchImpl);
  return { calls };
}

function storedEnvelope(): string {
  return serializeCustomerIoEmailEnvelope({
    subject: DS_SUBJECT,
    body: DS_BODY,
    designStudioEmailId: EMAIL_UUID,
  });
}

function paragraphPrefill(storedText: string, translated: string): Record<string, string> {
  const entries = extractHtmlIngestEntries(storedText);
  const key = Object.keys(entries).find((entry) => entries[entry] === "Hello");
  if (!key) {
    throw new Error("paragraph entry missing from stored envelope");
  }
  return { [key]: translated };
}

describe("runPushCustomerIoCampaigns with Design Studio emails", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mocks.getLatestRepositorySourceFileVersion.mockReset();
    mocks.getStoredFileContent.mockReset();
    mocks.loadAsPrefilledEntries.mockReset();
  });

  it("puts the translation with the lowercase remote language", async () => {
    const stored = storedEnvelope();
    const { calls } = setup({
      availableLanguages: ["zh-cn"],
      translationHtml: DS_BODY,
      translationUpdated: 1793115196,
      storedText: stored,
      prefilled: paragraphPrefill(stored, "Bonjour"),
      sourceCreatedAt: new Date("2026-10-20T00:00:00Z"),
    });

    const result = await runPushCustomerIoCampaigns({
      organizationId: "org-1",
      automation: automation(),
    });

    expect(result.pushedLocales).toBe(1);
    expect(result.failedLocales).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      `https://api.customer.io/v1/design_studio/emails/${EMAIL_UUID}/languages/zh-cn`,
    );
    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.body).toEqual({
      content: {
        subject: DS_SUBJECT,
        preheader_text: "",
        html: expect.stringContaining("Bonjour"),
      },
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("saved as draft in Design Studio"),
        expect.stringContaining("publish the email in Customer.io"),
      ]),
    );
  });

  it("creates a missing language before putting", async () => {
    const stored = storedEnvelope();
    const { calls } = setup({
      availableLanguages: [],
      translationHtml: null,
      translationUpdated: 0,
      storedText: stored,
      prefilled: paragraphPrefill(stored, "Bonjour"),
      sourceCreatedAt: new Date("2026-10-20T00:00:00Z"),
    });

    const result = await runPushCustomerIoCampaigns({
      organizationId: "org-1",
      automation: automation(),
    });

    expect(result.pushedLocales).toBe(1);
    expect(calls.map((call) => call.method)).toEqual(["POST", "PUT"]);
    expect(calls[0]?.url).toBe(
      `https://api.customer.io/v1/design_studio/emails/${EMAIL_UUID}/languages`,
    );
    const createdLanguage = calls[0]?.body?.language;
    expect(createdLanguage).toEqual(expect.any(String));
    expect(calls[0]?.body).toEqual({ language: createdLanguage });
    expect(calls[1]?.url).toBe(
      `https://api.customer.io/v1/design_studio/emails/${EMAIL_UUID}/languages/${createdLanguage}`,
    );
  });

  it("skips an up-to-date translation", async () => {
    const stored = storedEnvelope();
    const { calls } = setup({
      availableLanguages: ["zh-cn"],
      translationHtml: DS_BODY.replace("Hello", "Bonjour"),
      translationUpdated: 1793115196,
      storedText: stored,
      prefilled: paragraphPrefill(stored, "Bonjour"),
      sourceCreatedAt: new Date("2026-10-20T00:00:00Z"),
    });

    const result = await runPushCustomerIoCampaigns({
      organizationId: "org-1",
      automation: automation(),
    });

    expect(result.pushedLocales).toBe(0);
    expect(result.skippedLocales).toBe(1);
    expect(calls).toHaveLength(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("already up to date")]),
    );
  });

  it("skips a newer remote when overwrite is off", async () => {
    const stored = storedEnvelope();
    const { calls } = setup({
      availableLanguages: ["zh-cn"],
      translationHtml: DS_BODY,
      translationUpdated: Math.floor(Date.now() / 1000) + 86400,
      storedText: stored,
      prefilled: paragraphPrefill(stored, "Bonjour"),
      sourceCreatedAt: new Date(Date.now() - 86400_000),
    });

    const result = await runPushCustomerIoCampaigns({
      organizationId: "org-1",
      automation: automation({ overwriteWhenRemoteNewer: false }),
    });

    expect(result.pushedLocales).toBe(0);
    expect(result.skippedLocales).toBe(1);
    expect(calls).toHaveLength(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("remote is newer and overwrite is off")]),
    );
  });

  it("warns to re-run ingest for a legacy compiled file", async () => {
    const stored = serializeCustomerIoEmailEnvelope({
      subject: DS_SUBJECT,
      body: "<p>Upgraded!</p>",
    });
    const { calls } = setup({
      availableLanguages: ["zh-cn"],
      translationHtml: DS_BODY,
      translationUpdated: 1793115196,
      storedText: stored,
      prefilled: {},
      sourceCreatedAt: new Date("2026-10-20T00:00:00Z"),
    });
    mocks.loadAsPrefilledEntries.mockResolvedValue({ prefilled: {}, translatedKeyCount: 0 });

    const result = await runPushCustomerIoCampaigns({
      organizationId: "org-1",
      automation: automation(),
    });

    expect(result.pushedLocales).toBe(0);
    expect(result.skippedLocales).toBe(1);
    expect(calls).toHaveLength(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("managed by Design Studio; re-run ingest")]),
    );
  });
});
