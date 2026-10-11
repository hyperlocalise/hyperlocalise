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
});
