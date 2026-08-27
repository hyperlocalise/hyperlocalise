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

import { GlossaryConcordanceService } from "./concordance";

const searchGlossaryConcordanceMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/glossary/glossary-concordance", () => ({
  searchGlossaryConcordance: (...args: unknown[]) => searchGlossaryConcordanceMock(...args),
  shouldIncludeAttachedGlossary: vi.fn(),
}));

describe("GlossaryConcordanceService.collectUsageForUnits", () => {
  beforeEach(() => {
    searchGlossaryConcordanceMock.mockReset();
    searchGlossaryConcordanceMock.mockResolvedValue([]);
  });

  it("forwards actorUserId to glossary concordance search", async () => {
    const service = new GlossaryConcordanceService();

    await service.collectUsageForUnits({
      projectId: "project-1",
      organizationId: "org-1",
      providerKind: "crowdin",
      sourceLocale: "en",
      targetLocales: ["fr"],
      actorUserId: "user-42",
      units: [{ externalStringId: "s1", key: "welcome", sourceText: "Welcome" }],
    });

    expect(searchGlossaryConcordanceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        organizationId: "org-1",
        actorUserId: "user-42",
        sourceText: "Welcome",
      }),
    );
  });
});
