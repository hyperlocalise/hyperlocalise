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

import type { ApiAuthContext } from "@/api/auth/workos";
import type { Glossary as GlossaryRecord } from "@/lib/database/types";

const mocks = vi.hoisted(() => ({
  deleteLiveGlossary: vi.fn(),
  listLiveGlossaryProjects: vi.fn(),
  resolveCrowdinContext: vi.fn(),
  deleteWhere: vi.fn(),
  deleteReturning: vi.fn(),
}));

vi.mock("@/lib/providers/adapters/crowdin/crowdin-provider", () => ({
  crowdinTmsProvider: {
    deleteLiveGlossary: (...args: unknown[]) => mocks.deleteLiveGlossary(...args),
    listLiveGlossaryProjects: (...args: unknown[]) => mocks.listLiveGlossaryProjects(...args),
  },
}));

vi.mock("@/lib/database", () => ({
  db: {
    delete: () => ({
      where: (...args: unknown[]) => {
        mocks.deleteWhere(...args);
        return {
          returning: (...returningArgs: unknown[]) => mocks.deleteReturning(...returningArgs),
        };
      },
    }),
  },
  schema: {
    glossaries: {
      id: "id",
      organizationId: "organization_id",
      externalProviderKind: "external_provider_kind",
      externalGlossaryId: "external_glossary_id",
    },
  },
}));

vi.mock("./glossary-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./glossary-provider")>();
  return {
    ...actual,
    resolveCrowdinContext: (...args: unknown[]) => mocks.resolveCrowdinContext(...args),
  };
});

import { CrowdinGlossary } from "./crowdin-glossary";

function authContext(): ApiAuthContext {
  return {
    organization: { localOrganizationId: "org-1" },
    user: { localUserId: "user-1" },
  } as ApiAuthContext;
}

function liveGlossary(overrides: Partial<GlossaryRecord> = {}): GlossaryRecord {
  return {
    id: "crowdin:glossary:42",
    organizationId: "org-1",
    createdByUserId: null,
    name: "Live Crowdin glossary",
    description: "",
    sourceLocale: "en",
    targetLocale: null,
    status: "active",
    source: "external_tms",
    externalProviderKind: "crowdin",
    externalProviderCredentialId: null,
    externalProjectId: "902807",
    externalResourceType: "glossary",
    externalGlossaryId: "42",
    localeCoverage: [],
    termCount: 0,
    syncState: null,
    termCapabilities: {},
    externalUrl: null,
    lastSyncedAt: null,
    lastSyncErrorAt: null,
    lastSyncErrorMessage: null,
    providerMetadata: {},
    createdAt: new Date("2026-08-20T00:00:00Z"),
    updatedAt: new Date("2026-08-20T00:00:00Z"),
    ...overrides,
  };
}

describe("CrowdinGlossary.delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCrowdinContext.mockResolvedValue({
      organizationId: "org-1",
      externalProjectId: "902807",
      sourceLocale: "en",
      credential: { id: "cred-1" },
      secretMaterial: "secret",
    });
    mocks.deleteLiveGlossary.mockResolvedValue(undefined);
    mocks.listLiveGlossaryProjects.mockResolvedValue([]);
    mocks.deleteReturning.mockResolvedValue([]);
  });

  it("counts projects from the live Crowdin API", async () => {
    mocks.listLiveGlossaryProjects.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const glossary = new CrowdinGlossary({
      auth: authContext(),
      glossary: liveGlossary(),
    });

    await expect(glossary.queryProjectCount()).resolves.toBe(2);
    expect(mocks.listLiveGlossaryProjects).toHaveBeenCalledWith(
      expect.objectContaining({ externalProjectId: "902807" }),
      42,
    );
  });

  it("returns true for live Crowdin ids even when no local mapping row exists", async () => {
    const glossary = new CrowdinGlossary({
      auth: authContext(),
      glossary: liveGlossary(),
    });

    await expect(glossary.delete()).resolves.toBe(true);

    expect(mocks.deleteLiveGlossary).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        externalProjectId: "902807",
      }),
      42,
    );
    expect(mocks.deleteWhere).toHaveBeenCalled();
    expect(mocks.deleteReturning).toHaveBeenCalled();
  });

  it("returns true when a mirrored local mapping row is removed", async () => {
    mocks.deleteReturning.mockResolvedValue([{ id: "local-glossary-uuid" }]);

    const glossary = new CrowdinGlossary({
      auth: authContext(),
      glossary: liveGlossary({
        id: "crowdin:glossary:99",
        externalGlossaryId: "99",
      }),
    });

    await expect(glossary.delete()).resolves.toBe(true);
    expect(mocks.deleteLiveGlossary).toHaveBeenCalledWith(expect.anything(), 99);
  });

  it("returns false for synced UUID glossaries when no local row matches", async () => {
    const glossary = new CrowdinGlossary({
      auth: authContext(),
      glossary: liveGlossary({
        id: "11111111-1111-4111-8111-111111111111",
        externalGlossaryId: "55",
      }),
    });

    await expect(glossary.delete()).resolves.toBe(false);
    expect(mocks.deleteLiveGlossary).toHaveBeenCalledWith(expect.anything(), 55);
  });
});
