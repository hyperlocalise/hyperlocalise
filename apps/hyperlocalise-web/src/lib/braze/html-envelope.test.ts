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
  buildBrazeContentBlockSourcePath,
  buildBrazeEmailSourcePath,
  parseBrazeContentBlockEnvelope,
  parseBrazeEmailEnvelope,
  restoreBrazeContentBlockEnvelope,
  restoreBrazeEmailEnvelope,
  serializeBrazeContentBlockEnvelope,
  serializeBrazeEmailEnvelope,
} from "./html-envelope";

describe("braze html envelope", () => {
  it("round-trips nested email markup and Liquid", () => {
    const fields = {
      subject: "Welcome {{${first_name}}}",
      preheader: "A short intro",
      body: '<div class="wrap"><div>Hello</div><p>World</p></div>{% if user %}<p>Hi</p>{% endif %}',
      plaintext_body: "Hello {{${first_name}}}",
    };
    const serialized = serializeBrazeEmailEnvelope(fields);
    const parsed = parseBrazeEmailEnvelope(serialized.html);
    expect(parsed.body).toBe(
      '<div class="wrap"><div>Hello</div><p>World</p></div><!--HL_BRAZE_LIQUID_0--><p>Hi</p><!--HL_BRAZE_LIQUID_1-->',
    );
    expect(restoreBrazeEmailEnvelope(parsed, serialized.tokensByField)).toEqual(fields);
  });

  it("round-trips empty optional email fields", () => {
    const fields = { subject: "Hi", body: "<p>Only body</p>" };
    const serialized = serializeBrazeEmailEnvelope(fields);
    const parsed = parseBrazeEmailEnvelope(serialized.html);
    expect(parsed.preheader).toBeUndefined();
    expect(parsed.plaintext_body).toBeUndefined();
    expect(restoreBrazeEmailEnvelope(parsed, serialized.tokensByField)).toEqual({
      subject: "Hi",
      body: "<p>Only body</p>",
    });
  });

  it("round-trips nested Content Block markup", () => {
    const fields = {
      content: '<div class="card"><div>Promo</div></div>{{custom_attribute.${plan}}}',
    };
    const serialized = serializeBrazeContentBlockEnvelope(fields);
    const parsed = parseBrazeContentBlockEnvelope(serialized.html);
    expect(parsed.content).toContain('<div class="card"><div>Promo</div></div>');
    expect(restoreBrazeContentBlockEnvelope(parsed, serialized.tokensByField)).toEqual(fields);
  });

  it("keeps body markup after a nested </body> tag", () => {
    const html = [
      "<!doctype html><html><body>",
      '<div data-hl-braze-field="subject">Hi</div>',
      '<div data-hl-braze-field="preheader"></div>',
      '<div data-hl-braze-field="body"><table><tr><td></body></td></tr></table><p>After</p></div>',
      '<div data-hl-braze-field="plaintext_body">plain</div>',
      "</body></html>",
    ].join("");
    expect(parseBrazeEmailEnvelope(html)).toEqual({
      subject: "Hi",
      preheader: undefined,
      body: "<table><tr><td></body></td></tr></table><p>After</p>",
      plaintext_body: "plain",
    });
  });

  it("keeps collision-safe source paths for same-name items", () => {
    expect(buildBrazeEmailSourcePath({ templateId: "tmpl_a", templateName: "Welcome" })).not.toBe(
      buildBrazeEmailSourcePath({ templateId: "tmpl_b", templateName: "Welcome" }),
    );
    expect(buildBrazeContentBlockSourcePath({ contentBlockId: "cb_a", name: "Hero" })).not.toBe(
      buildBrazeContentBlockSourcePath({ contentBlockId: "cb_b", name: "Hero" }),
    );
    expect(buildBrazeEmailSourcePath({ templateId: "tmpl_a", templateName: "Welcome" })).toMatch(
      /^braze\/templates\/welcome-[a-f0-9]{8}\.html$/,
    );
  });
});
