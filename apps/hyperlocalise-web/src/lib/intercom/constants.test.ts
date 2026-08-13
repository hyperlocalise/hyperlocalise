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
  INTERCOM_REST_ENDPOINTS,
  intercomRestEndpointLabel,
  isIntercomRestEndpoint,
  resolveIntercomRestBaseUrl,
} from "./constants";

describe("intercom constants", () => {
  it("exposes the three documented regional endpoints", () => {
    expect(INTERCOM_REST_ENDPOINTS).toEqual(["us", "eu", "au"]);
    expect(resolveIntercomRestBaseUrl("us")).toBe("https://api.intercom.io");
    expect(resolveIntercomRestBaseUrl("eu")).toBe("https://api.eu.intercom.io");
    expect(resolveIntercomRestBaseUrl("au")).toBe("https://api.au.intercom.io");
  });

  it("validates and labels allowlisted endpoint keys", () => {
    expect(isIntercomRestEndpoint("us")).toBe(true);
    expect(isIntercomRestEndpoint("eu")).toBe(true);
    expect(isIntercomRestEndpoint("au")).toBe(true);
    expect(isIntercomRestEndpoint("https://api.intercom.io")).toBe(false);
    expect(intercomRestEndpointLabel("us")).toBe("US");
    expect(intercomRestEndpointLabel("eu")).toBe("Europe");
    expect(intercomRestEndpointLabel("au")).toBe("Australia");
  });
});
