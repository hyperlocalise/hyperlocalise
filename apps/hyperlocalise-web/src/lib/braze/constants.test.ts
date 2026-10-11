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
  BRAZE_PIPES_SLUG,
  brazeRestEndpointLabel,
  brazeRestEndpointOptionLabel,
  isBrazeRestEndpoint,
  resolveBrazeRestBaseUrl,
} from "./constants";

describe("braze constants", () => {
  it("uses the WorkOS Pipes slug braze", () => {
    expect(BRAZE_PIPES_SLUG).toBe("braze");
  });

  it("accepts allowlisted cluster keys and rejects unknown hosts", () => {
    expect(isBrazeRestEndpoint("iad-03")).toBe(true);
    expect(isBrazeRestEndpoint("us-10")).toBe(true);
    expect(isBrazeRestEndpoint("https://rest.iad-03.braze.com")).toBe(false);
    expect(isBrazeRestEndpoint("iad-99")).toBe(false);
  });

  it("maps cluster keys onto official REST base URLs", () => {
    expect(resolveBrazeRestBaseUrl("iad-03")).toBe("https://rest.iad-03.braze.com");
    expect(resolveBrazeRestBaseUrl("fra-01")).toBe("https://rest.fra-01.braze.eu");
    expect(resolveBrazeRestBaseUrl("us-10")).toBe("https://rest.us-10.braze.com");
  });

  it("labels clusters for the picker", () => {
    expect(brazeRestEndpointLabel("iad-03")).toBe("US-03");
    expect(brazeRestEndpointOptionLabel("iad-03")).toBe("US-03 · rest.iad-03.braze.com");
  });
});
