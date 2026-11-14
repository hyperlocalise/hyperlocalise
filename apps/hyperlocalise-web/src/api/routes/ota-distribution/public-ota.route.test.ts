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
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createApp } from "@/api/app";
import { createMemoryOtaObjectStore } from "@/lib/ota/memory-store";
import { setHostedOtaObjectStoreForTests } from "@/lib/ota/release";

const HASH = "a".repeat(32);

afterEach(() => {
  setHostedOtaObjectStoreForTests(null);
});

describe("public OTA routes", () => {
  it("serves stored objects and 404s unknown hashes without leaking existence", async () => {
    const store = createMemoryOtaObjectStore();
    await store.put({
      key: `${HASH}/manifest.json`,
      body: Buffer.from('{"schema_version":1}\n', "utf8"),
      contentType: "application/json; charset=utf-8",
      cacheControl: "public, max-age=3600",
    });
    await store.put({
      key: `${HASH}/content/fr-FR/messages.json`,
      body: Buffer.from('{"greeting":"Bonjour"}', "utf8"),
      contentType: "application/json; charset=utf-8",
      cacheControl: "public, max-age=3600",
    });
    setHostedOtaObjectStoreForTests(store);

    const app = createApp();
    const manifest = await app.request(`http://localhost/api/ota/${HASH}/manifest.json`);
    expect(manifest.status).toBe(200);
    expect(await manifest.json()).toEqual({ schema_version: 1 });

    const head = await app.request(`http://localhost/api/ota/${HASH}/manifest.json`, {
      method: "HEAD",
    });
    expect(head.status).toBe(200);

    const content = await app.request(
      `http://localhost/api/ota/${HASH}/content/fr-FR/messages.json`,
    );
    expect(content.status).toBe(200);
    expect(await content.json()).toEqual({ greeting: "Bonjour" });

    const missing = await app.request(`http://localhost/api/ota/${"b".repeat(32)}/manifest.json`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("");

    const traversal = await app.request(
      `http://localhost/api/ota/${HASH}/content/%2e%2e/messages.json`,
    );
    expect(traversal.status).toBe(404);
  });
});
