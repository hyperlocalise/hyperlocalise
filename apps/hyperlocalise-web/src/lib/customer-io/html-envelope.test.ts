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
  buildCustomerIoEmailSourcePath,
  hashCustomerIoEmailEnvelope,
  parseCustomerIoEmailEnvelope,
  seedEntriesForCustomerIoEmailFields,
  serializeCustomerIoEmailEnvelope,
} from "./html-envelope";

describe("customer-io email envelope", () => {
  it("round-trips subject, preheader, and raw body html", () => {
    const html = serializeCustomerIoEmailEnvelope({
      subject: "Hello <there>",
      preheader_text: "Preview & more",
      body: "<p>Hi {{name}}, welcome!</p>",
    });

    expect(html).toContain('data-hl-customer-io-field="subject"');
    expect(html).toContain("Hello &lt;there&gt;");
    expect(html).toContain("<p>Hi {{name}}, welcome!</p>");
    expect(parseCustomerIoEmailEnvelope(html)).toEqual({
      subject: "Hello <there>",
      preheader_text: "Preview & more",
      body: "<p>Hi {{name}}, welcome!</p>",
    });
  });

  it("omits an empty preheader on parse", () => {
    const html = serializeCustomerIoEmailEnvelope({ subject: "Hi", body: "<p>Body</p>" });

    expect(parseCustomerIoEmailEnvelope(html)).toEqual({
      subject: "Hi",
      preheader_text: undefined,
      body: "<p>Body</p>",
    });
  });

  it("keeps nested divs inside the body block", () => {
    const html = serializeCustomerIoEmailEnvelope({
      subject: "Hi",
      body: "<div><div>Nested</div></div>",
    });

    expect(parseCustomerIoEmailEnvelope(html).body).toBe("<div><div>Nested</div></div>");
  });

  it("hashes the serialized html", () => {
    const html = serializeCustomerIoEmailEnvelope({ subject: "Hi", body: "<p>Body</p>" });

    expect(hashCustomerIoEmailEnvelope(html)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("seeds single-text email fields on exact entry matches", () => {
    const sourceHtml = serializeCustomerIoEmailEnvelope({
      subject: "Hello",
      preheader_text: "Preview",
      body: "<p>Body text</p>",
    });
    const sourceMap = { subject: "Hello", preheader_text: "Preview", body: "<p>Body text</p>" };

    const seeded = seedEntriesForCustomerIoEmailFields({
      sourceHtml,
      sourceMap,
      remoteMap: { subject: "Bonjour", preheader_text: "Aperçu", body: "<p>Corps</p>" },
    });

    // Subject and preheader seed; the multi-node body never seeds.
    expect(Object.values(seeded)).toEqual(expect.arrayContaining(["Bonjour", "Aperçu"]));
    expect(Object.keys(seeded)).toHaveLength(2);
  });

  it("skips seeding when the source text is ambiguous or missing remotely", () => {
    const sourceHtml = serializeCustomerIoEmailEnvelope({
      subject: "Hello",
      body: "<p>Hello</p>",
    });

    // "Hello" appears twice (subject block + body text): no unique match.
    expect(
      seedEntriesForCustomerIoEmailFields({
        sourceHtml,
        sourceMap: { subject: "Hello", body: "<p>Hello</p>" },
        remoteMap: { subject: "Bonjour", body: "<p>Bonjour</p>" },
      }),
    ).toEqual({});
  });
});

describe("customer-io email source paths", () => {
  it("builds html paths per resource kind", () => {
    expect(
      buildCustomerIoEmailSourcePath({ kind: "broadcasts", resourceId: "2", actionId: "96" }),
    ).toBe("customer-io/broadcasts/2/actions/96.html");
    expect(
      buildCustomerIoEmailSourcePath({ kind: "campaigns", resourceId: "7", actionId: "42" }),
    ).toBe("customer-io/campaigns/7/actions/42.html");
    expect(
      buildCustomerIoEmailSourcePath({ kind: "newsletters", resourceId: "10", actionId: "101" }),
    ).toBe("customer-io/newsletters/10/contents/101.html");
    expect(
      buildCustomerIoEmailSourcePath({ kind: "transactional", resourceId: "5", actionId: "201" }),
    ).toBe("customer-io/transactional/5/contents/201.html");
  });
});
