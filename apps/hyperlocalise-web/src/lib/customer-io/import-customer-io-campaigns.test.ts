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
import { describe, expect, it } from "vite-plus/test";

import {
  buildCustomerIoDesignStudioEnvelope,
  customerIoDesignStudioSourceMap,
  isCustomerIoLocaleImportComplete,
  isCustomerIoLocaleSeedComplete,
} from "./import-customer-io-campaigns";
import { parseCustomerIoEmailEnvelope } from "./html-envelope";
import { REAL_DESIGN_STUDIO_EMAIL_DETAIL } from "./design-studio-client.real-api.fixture";

describe("isCustomerIoLocaleImportComplete", () => {
  it("is complete when entries were imported and every source key has remote text", () => {
    expect(
      isCustomerIoLocaleImportComplete({
        sourceMap: { title: "Hello", body: "World" },
        remoteMap: { title: "Bonjour", body: "Monde" },
        importedCount: 2,
      }),
    ).toBe(true);
  });

  it("is incomplete when nothing was imported", () => {
    expect(
      isCustomerIoLocaleImportComplete({
        sourceMap: { title: "Hello" },
        remoteMap: { title: "Bonjour" },
        importedCount: 0,
      }),
    ).toBe(false);
  });

  it("is incomplete when a source key has no remote text", () => {
    expect(
      isCustomerIoLocaleImportComplete({
        sourceMap: { title: "Hello", body: "World" },
        remoteMap: { title: "Bonjour" },
        importedCount: 1,
      }),
    ).toBe(false);
  });
});

describe("isCustomerIoLocaleSeedComplete", () => {
  it("never completes for email so the HTML body goes through Jobs", () => {
    expect(
      isCustomerIoLocaleSeedComplete({
        actionType: "email",
        sourceMap: { subject: "Hello", body: "<p>World</p>" },
        remoteMap: { subject: "Bonjour", body: "<p>Monde</p>" },
        importedCount: 1,
      }),
    ).toBe(false);
  });

  it("never completes for in_app so the HTML body goes through Jobs", () => {
    expect(
      isCustomerIoLocaleSeedComplete({
        actionType: "in_app",
        sourceMap: { body: "<div>World</div>" },
        remoteMap: { body: "<div>Monde</div>" },
        importedCount: 1,
      }),
    ).toBe(false);
  });

  it("defers to import completeness for non-email actions", () => {
    expect(
      isCustomerIoLocaleSeedComplete({
        actionType: "push",
        sourceMap: { title: "Hello", body: "World" },
        remoteMap: { title: "Bonjour", body: "Monde" },
        importedCount: 2,
      }),
    ).toBe(true);
    expect(
      isCustomerIoLocaleSeedComplete({
        actionType: "whatsapp",
        sourceMap: { body: "Hello" },
        remoteMap: { body: "Bonjour" },
        importedCount: 1,
      }),
    ).toBe(true);
    expect(
      isCustomerIoLocaleSeedComplete({
        actionType: "push",
        sourceMap: { title: "Hello", body: "World" },
        remoteMap: { title: "Bonjour", body: "Monde" },
        importedCount: 0,
      }),
    ).toBe(false);
  });
});

describe("customerIoDesignStudioSourceMap", () => {
  it("uses the component markup as the body", () => {
    const map = customerIoDesignStudioSourceMap({
      id: "31488f77-b1d5-4256-ad6e-c049deff19c5",
      name: "Untitled Automation 1: 10 Reasons to Upgrade",
      availableLanguages: ["zh-cn"],
      content: {
        subject: "Untitled Automation 1: 10 Reasons to Upgrade",
        preheaderText: "",
        html: "<x-base><x-paragraph>Hello</x-paragraph></x-base>",
      },
      updatedAt: null,
    });

    expect(map).toEqual({
      subject: "Untitled Automation 1: 10 Reasons to Upgrade",
      body: "<x-base><x-paragraph>Hello</x-paragraph></x-base>",
    });
  });
});

describe("buildCustomerIoDesignStudioEnvelope", () => {
  it("stores live markup with the linked email id", () => {
    const detail = REAL_DESIGN_STUDIO_EMAIL_DETAIL.email;
    const html = buildCustomerIoDesignStudioEnvelope({
      id: detail.id,
      name: detail.name,
      availableLanguages: detail.available_languages,
      content: {
        subject: detail.content.subject,
        preheaderText: detail.content.preheader_text,
        html: detail.content.html,
      },
      updatedAt: null,
    });

    expect(html).toContain("<x-heading-1>");
    expect(html).toContain(
      'data-hl-customer-io-design-studio="31488f77-b1d5-4256-ad6e-c049deff19c5"',
    );
    expect(parseCustomerIoEmailEnvelope(html).designStudioEmailId).toBe(
      "31488f77-b1d5-4256-ad6e-c049deff19c5",
    );
  });
});
