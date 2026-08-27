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

import { resolveNativeGlossaryTargetLocale } from "./resolve-native-glossary-target-locale";

describe("resolveNativeGlossaryTargetLocale", () => {
  it("returns glossary targetLocale when set", async () => {
    await expect(
      resolveNativeGlossaryTargetLocale({
        glossary: { id: "glossary_1", targetLocale: "fr-FR" },
      }),
    ).resolves.toEqual({ locale: "fr-FR" });
  });

  it("returns project target locale when projectId is provided", async () => {
    const database = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ targetLocales: ["de-DE", "it-IT"] }],
          }),
        }),
      }),
    };

    await expect(
      resolveNativeGlossaryTargetLocale({
        glossary: { id: "glossary_1", targetLocale: null },
        projectId: "project_1",
        database: database as never,
      }),
    ).resolves.toEqual({ locale: "de-DE" });
  });

  it("returns missing when no target locale can be resolved", async () => {
    const database = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: async () => [],
          }),
        }),
      }),
    };

    await expect(
      resolveNativeGlossaryTargetLocale({
        glossary: { id: "glossary_1", targetLocale: null },
        database: database as never,
      }),
    ).resolves.toEqual({ error: "missing", locales: [] });
  });

  it("returns ambiguous when multiple attached target locales exist", async () => {
    const database = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: async () => [{ targetLocales: ["es-ES"] }, { targetLocales: ["de-DE"] }],
          }),
        }),
      }),
    };

    const result = await resolveNativeGlossaryTargetLocale({
      glossary: { id: "glossary_1", targetLocale: null },
      database: database as never,
    });

    expect(result).toEqual({
      error: "ambiguous",
      locales: expect.arrayContaining(["es-ES", "de-DE"]),
    });
  });

  it("uses explicit target locale when it matches an attached locale", async () => {
    const database = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: async () => [{ targetLocales: ["es-ES"] }, { targetLocales: ["de-DE"] }],
          }),
        }),
      }),
    };

    await expect(
      resolveNativeGlossaryTargetLocale({
        glossary: { id: "glossary_1", targetLocale: null },
        explicitTargetLocale: "de-DE",
        database: database as never,
      }),
    ).resolves.toEqual({ locale: "de-DE" });
  });
});
