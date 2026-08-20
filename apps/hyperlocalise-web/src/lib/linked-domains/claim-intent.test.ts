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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { cookieStore, cookiesMock } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    cookieStore: store,
    cookiesMock: vi.fn(async () => ({
      get: (name: string) => {
        const value = store.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: (name: string, value: string) => {
        store.set(name, value);
      },
      delete: (name: string) => {
        store.delete(name);
      },
    })),
  };
});

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

import {
  claimDomainIntentCookieName,
  claimDomainPathForOrg,
  clearClaimDomainIntent,
  getClaimDomainIntent,
  setClaimDomainIntent,
} from "./claim-intent";

describe("claimDomainPathForOrg", () => {
  it("builds the org link-domain path for a valid domain slug", () => {
    expect(claimDomainPathForOrg("acme", "example-com")).toBe("/org/acme/link-domain/example-com");
  });
});

describe("claim domain intent cookie", () => {
  beforeEach(() => {
    cookieStore.clear();
    cookiesMock.mockClear();
  });

  it("returns null when the cookie is missing or malformed", async () => {
    expect(await getClaimDomainIntent()).toBeNull();

    cookieStore.set(claimDomainIntentCookieName, "not-json");
    expect(await getClaimDomainIntent()).toBeNull();

    cookieStore.set(claimDomainIntentCookieName, JSON.stringify({ domainSlug: "" }));
    expect(await getClaimDomainIntent()).toBeNull();

    cookieStore.set(claimDomainIntentCookieName, JSON.stringify({ domainSlug: "not a slug" }));
    expect(await getClaimDomainIntent()).toBeNull();
  });

  it("stores and clears a valid domain claim intent", async () => {
    await setClaimDomainIntent("not a slug");
    expect(cookieStore.has(claimDomainIntentCookieName)).toBe(false);

    await setClaimDomainIntent("example-com");
    expect(await getClaimDomainIntent()).toEqual({ domainSlug: "example-com" });

    await clearClaimDomainIntent();
    expect(await getClaimDomainIntent()).toBeNull();
  });
});
