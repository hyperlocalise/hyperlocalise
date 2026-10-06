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

import { resolveContentfulTriggerContentTypes } from "./workspace-automation-contentful-trigger";

const CONNECTION_ID = "contentful_conn_001";

function resolve(saved: string[], sent: string[] | null, options: { enabled?: boolean } = {}) {
  return resolveContentfulTriggerContentTypes({
    savedContentTypeIds: saved,
    connectionId: CONNECTION_ID,
    connections:
      sent === null
        ? []
        : [{ id: CONNECTION_ID, contentTypeIds: sent, enabled: options.enabled ?? true }],
  });
}

describe("resolveContentfulTriggerContentTypes", () => {
  it("shows the saved list while connections are still loading", () => {
    expect(resolve(["article"], null)).toEqual({
      state: "ready",
      contentTypeIds: ["article"],
      any: false,
      staleContentTypeIds: [],
    });
  });

  it("shows the saved list when no connection is chosen yet", () => {
    expect(
      resolveContentfulTriggerContentTypes({
        savedContentTypeIds: [],
        connectionId: "",
        connections: [{ id: CONNECTION_ID, contentTypeIds: ["article"], enabled: true }],
      }),
    ).toEqual({ state: "ready", contentTypeIds: [], any: true, staleContentTypeIds: [] });
  });

  it("reports a connection that is gone while others exist", () => {
    expect(
      resolveContentfulTriggerContentTypes({
        savedContentTypeIds: ["article"],
        connectionId: "contentful_conn_deleted",
        connections: [{ id: CONNECTION_ID, contentTypeIds: ["article"], enabled: true }],
      }),
    ).toEqual({ state: "connection_unavailable" });
  });

  it("reports a disabled connection", () => {
    expect(resolve(["article"], ["article"], { enabled: false })).toEqual({
      state: "connection_unavailable",
    });
  });

  it("follows the connection when the automation accepts every type", () => {
    expect(resolve([], ["article", "landingPage"])).toEqual({
      state: "ready",
      contentTypeIds: ["article", "landingPage"],
      any: false,
      staleContentTypeIds: [],
    });
    expect(resolve([], [])).toEqual({
      state: "ready",
      contentTypeIds: [],
      any: true,
      staleContentTypeIds: [],
    });
  });

  it("treats a saved subset of the connection's types as a deliberate filter", () => {
    expect(resolve(["article"], ["article", "landingPage", "faq"])).toEqual({
      state: "ready",
      contentTypeIds: ["article"],
      any: false,
      staleContentTypeIds: [],
    });
    expect(resolve(["article"], [])).toEqual({
      state: "ready",
      contentTypeIds: ["article"],
      any: false,
      staleContentTypeIds: [],
    });
  });

  it("marks saved types the connection no longer sends as stale", () => {
    expect(resolve(["article", "landingPage"], ["article", "faq"])).toEqual({
      state: "ready",
      contentTypeIds: ["article"],
      any: false,
      staleContentTypeIds: ["landingPage"],
    });
  });

  it("reports no starting type when the lists do not overlap", () => {
    expect(resolve(["landingPage"], ["faq"])).toEqual({
      state: "ready",
      contentTypeIds: [],
      any: false,
      staleContentTypeIds: ["landingPage"],
    });
  });
});
