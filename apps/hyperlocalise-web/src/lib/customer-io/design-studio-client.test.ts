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

import { CustomerIoApiError } from "./client";
import {
  createCustomerIoDesignStudioTranslation,
  customerIoDesignStudioEmailNameCandidates,
  getCustomerIoDesignStudioEmail,
  getCustomerIoDesignStudioTranslation,
  listCustomerIoDesignStudioEmails,
  matchCustomerIoDesignStudioLanguage,
  resolveCustomerIoDesignStudioEmail,
  updateCustomerIoDesignStudioTranslation,
  type CustomerIoDesignStudioTranslationContent,
} from "./design-studio-client";
import {
  REAL_DESIGN_STUDIO_EMAIL_DETAIL,
  REAL_DESIGN_STUDIO_EMAILS_LIST,
  REAL_DESIGN_STUDIO_TRANSLATION_ZH_CN,
} from "./design-studio-client.real-api.fixture";

function jsonResponse(body: object | null, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("listCustomerIoDesignStudioEmails", () => {
  it("reads the live list shape", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(REAL_DESIGN_STUDIO_EMAILS_LIST));

    const emails = await listCustomerIoDesignStudioEmails({
      apiKey: "key",
      region: "us",
      isLinked: true,
      fetchImpl,
    });

    expect(emails).toEqual([
      {
        id: "8e952ff8-7c7f-46c0-a335-332f35bfcd3c",
        name: "Test",
        isLinked: true,
        hasTranslations: false,
        updatedAt: expect.any(String),
      },
      {
        id: "31488f77-b1d5-4256-ad6e-c049deff19c5",
        name: "Untitled Automation 1: 10 Reasons to Upgrade",
        isLinked: true,
        hasTranslations: true,
        updatedAt: expect.any(String),
      },
      {
        id: "74693d36-043c-4814-9f30-e3edb4f8b401",
        name: "Untitled Automation 1: Welcome to MyApp",
        isLinked: true,
        hasTranslations: true,
        updatedAt: expect.any(String),
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.customer.io/v1/design_studio/emails?limit=1000&page=1&is_linked=true",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer key" }),
      }),
    );
  });

  it("pages until the total is reached", async () => {
    const page = (ids: string[], total: number) => ({
      emails: ids.map((id) => ({ id, name: id })),
      meta: { pagination: { total, limit: 1000, page: 1 } },
    });
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      const pageParam = new URL(href).searchParams.get("page");
      return jsonResponse(pageParam === "2" ? page(["b"], 2) : page(["a"], 2));
    });

    const emails = await listCustomerIoDesignStudioEmails({ apiKey: "k", region: "us", fetchImpl });

    expect(emails.map((email) => email.id)).toEqual(["a", "b"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("maps failures to CustomerIoApiError", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({}, 401));

    const error = await listCustomerIoDesignStudioEmails({
      apiKey: "bad",
      region: "us",
      fetchImpl,
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(CustomerIoApiError);
    expect((error as CustomerIoApiError).code).toBe("customer_io_unauthorized");
  });
});

describe("getCustomerIoDesignStudioEmail", () => {
  it("reads the live email shape", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(REAL_DESIGN_STUDIO_EMAIL_DETAIL),
    );

    const email = await getCustomerIoDesignStudioEmail({
      apiKey: "key",
      region: "us",
      emailId: "31488f77-b1d5-4256-ad6e-c049deff19c5",
      fetchImpl,
    });

    expect(email).toMatchObject({
      id: "31488f77-b1d5-4256-ad6e-c049deff19c5",
      name: "Untitled Automation 1: 10 Reasons to Upgrade",
      availableLanguages: ["zh-cn"],
      content: {
        subject: "Untitled Automation 1: 10 Reasons to Upgrade",
        preheaderText: "",
        html: expect.stringContaining("<x-heading-1>"),
      },
      updatedAt: expect.any(String),
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.customer.io/v1/design_studio/emails/31488f77-b1d5-4256-ad6e-c049deff19c5",
      expect.anything(),
    );
  });

  it("returns null on 404", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({}, 404));

    await expect(
      getCustomerIoDesignStudioEmail({ apiKey: "k", region: "us", emailId: "missing", fetchImpl }),
    ).resolves.toBeNull();
  });
});

describe("getCustomerIoDesignStudioTranslation", () => {
  it("unwraps email_translation from the live shape", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(REAL_DESIGN_STUDIO_TRANSLATION_ZH_CN),
    );

    const translation = await getCustomerIoDesignStudioTranslation({
      apiKey: "key",
      region: "us",
      emailId: "31488f77-b1d5-4256-ad6e-c049deff19c5",
      language: "zh-cn",
      fetchImpl,
    });

    expect(translation).toMatchObject({
      language: "zh-cn",
      availableLanguages: ["zh-cn"],
      content: {
        subject: "Untitled Automation 1: 10 Reasons to Upgrade",
        html: expect.stringContaining("<x-heading-1>"),
      },
      updatedAt: expect.any(String),
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.customer.io/v1/design_studio/emails/31488f77-b1d5-4256-ad6e-c049deff19c5/languages/zh-cn",
      expect.anything(),
    );
  });

  it("returns null on 404", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({}, 404));

    await expect(
      getCustomerIoDesignStudioTranslation({
        apiKey: "k",
        region: "us",
        emailId: "id",
        language: "zh-cn",
        fetchImpl,
      }),
    ).resolves.toBeNull();
  });
});

describe("createCustomerIoDesignStudioTranslation", () => {
  it("posts the language so content inherits the default", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({}, 201));

    await createCustomerIoDesignStudioTranslation({
      apiKey: "key",
      region: "us",
      emailId: "email-id",
      language: "zh-CN",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.customer.io/v1/design_studio/emails/email-id/languages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ language: "zh-CN" }),
      }),
    );
  });
});

describe("updateCustomerIoDesignStudioTranslation", () => {
  it("puts content only, leaving envelope and transformers untouched", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));

    await updateCustomerIoDesignStudioTranslation({
      apiKey: "key",
      region: "us",
      emailId: "email-id",
      language: "zh-cn",
      content: { subject: "Sujet", preheader_text: "", html: "<x-base><p>Bonjour</p></x-base>" },
      fetchImpl,
    });

    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.customer.io/v1/design_studio/emails/email-id/languages/zh-cn",
      expect.objectContaining({ method: "PUT" }),
    );
    if (typeof init?.body !== "string") {
      throw new Error("expected the PUT request to carry a JSON string body");
    }
    const body = JSON.parse(init.body) as {
      content?: CustomerIoDesignStudioTranslationContent;
    };
    expect(Object.keys(body)).toEqual(["content"]);
    expect(body.content).toEqual({
      subject: "Sujet",
      preheader_text: "",
      html: "<x-base><p>Bonjour</p></x-base>",
    });
  });
});

describe("matchCustomerIoDesignStudioLanguage", () => {
  it("matches case-insensitively and returns the remote casing", () => {
    expect(matchCustomerIoDesignStudioLanguage(["zh-cn"], "zh-CN")).toBe("zh-cn");
    expect(matchCustomerIoDesignStudioLanguage(["EN", "zh-cn"], "en")).toBe("EN");
  });

  it("returns null when the language is missing or blank", () => {
    expect(matchCustomerIoDesignStudioLanguage(["zh-cn"], "fr")).toBeNull();
    expect(matchCustomerIoDesignStudioLanguage([], "zh-CN")).toBeNull();
    expect(matchCustomerIoDesignStudioLanguage(["zh-cn"], "  ")).toBeNull();
  });
});

describe("customerIoDesignStudioEmailNameCandidates", () => {
  it("prefixes campaign and broadcast emails with the resource name", () => {
    expect(
      customerIoDesignStudioEmailNameCandidates(
        { kind: "campaign", id: "1", name: "Untitled Automation 1" },
        { id: "2", name: "Welcome to MyApp" },
      ),
    ).toEqual(["Untitled Automation 1: Welcome to MyApp", "Welcome to MyApp"]);
  });

  it("uses the message name for newsletters and transactional messages", () => {
    expect(
      customerIoDesignStudioEmailNameCandidates(
        { kind: "newsletter", id: "1", name: "Weekly Update" },
        { id: "2", name: "Weekly Update" },
      ),
    ).toEqual(["Weekly Update"]);
  });
});

describe("resolveCustomerIoDesignStudioEmail", () => {
  const emails = [
    { id: "uuid-1", name: "Untitled Automation 1: Welcome to MyApp", subject: "Welcome!" },
    { id: "uuid-2", name: "Untitled Automation 1: 10 Reasons to Upgrade", subject: "Upgrade" },
  ];
  const resource = { kind: "campaign" as const, id: "1", name: "Untitled Automation 1" };

  it("matches the prefixed campaign email name", () => {
    expect(
      resolveCustomerIoDesignStudioEmail({
        resource,
        action: { id: "2", name: "Welcome to MyApp" },
        emails,
      }),
    ).toMatchObject({ id: "uuid-1" });
  });

  it("falls back to the bare action name", () => {
    expect(
      resolveCustomerIoDesignStudioEmail({
        resource: { kind: "campaign" as const, id: "9", name: "Other" },
        action: { id: "2", name: "Welcome to MyApp" },
        emails: [{ id: "uuid-3", name: "Welcome to MyApp" }],
      }),
    ).toMatchObject({ id: "uuid-3" });
  });

  it("confirms by subject when several emails share a name", () => {
    const dupes = [
      { id: "a", name: "Same", subject: "First" },
      { id: "b", name: "Same", subject: "Second" },
    ];
    expect(
      resolveCustomerIoDesignStudioEmail({
        resource,
        action: { id: "1", name: "Same", subject: "Second" },
        emails: dupes,
      }),
    ).toMatchObject({ id: "b" });
  });

  it("returns null when ambiguous without a subject or with no match", () => {
    const dupes = [
      { id: "a", name: "Same", subject: "First" },
      { id: "b", name: "Same", subject: "Second" },
    ];
    expect(
      resolveCustomerIoDesignStudioEmail({
        resource,
        action: { id: "1", name: "Same" },
        emails: dupes,
      }),
    ).toBeNull();
    expect(
      resolveCustomerIoDesignStudioEmail({
        resource,
        action: { id: "1", name: "Missing" },
        emails,
      }),
    ).toBeNull();
  });
});
