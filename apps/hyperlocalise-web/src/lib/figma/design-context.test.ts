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
import "dotenv/config";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { ApiAuthContext } from "@/api/auth/workos";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import {
  getFigmaKeyTranslations,
  keyNameFromLayerName,
  matchFigmaTextsToKeys,
  resolveFigmaKeyMatches,
  searchFigmaProjectKeys,
  type FigmaDesignKey,
} from "@/lib/figma/design-context";

const mocks = vi.hoisted(() => ({ getAccessibleFigmaProject: vi.fn() }));

vi.mock("@/lib/figma/localize-file", () => ({
  getAccessibleFigmaProject: mocks.getAccessibleFigmaProject,
}));

const fixture = createProjectTestFixture();

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

function key(id: string, name: string, sourceText: string): FigmaDesignKey {
  return { id, key: name, sourcePath: "locales/en.json", sourceText, maxLength: null };
}

describe("keyNameFromLayerName", () => {
  it("accepts key-shaped layer names", () => {
    expect(keyNameFromLayerName("checkout.title")).toBe("checkout.title");
    expect(keyNameFromLayerName(" auth/sign_in ")).toBe("auth/sign_in");
  });

  it("ignores default and plain layer names", () => {
    expect(keyNameFromLayerName("Title")).toBeNull();
    expect(keyNameFromLayerName("Pay now")).toBeNull();
    expect(keyNameFromLayerName(undefined)).toBeNull();
  });
});

describe("resolveFigmaKeyMatches", () => {
  const checkout = key("k1", "checkout.title", "Checkout");
  const cartCheckout = key("k2", "cart.checkout", "Checkout");
  const pay = key("k3", "checkout.pay", "Pay now");

  const byText = new Map([
    ["checkout", [checkout, cartCheckout]],
    ["pay now", [pay]],
  ]);
  const byName = new Map([
    ["checkout.title", [checkout]],
    ["cart.checkout", [cartCheckout]],
    ["checkout.pay", [pay]],
  ]);

  it("prefers a layer named after a key", () => {
    const [match] = resolveFigmaKeyMatches(
      [{ nodeId: "1", text: "Something else", layerName: "cart.checkout" }],
      byName,
      byText,
    );
    expect(match).toMatchObject({ matchedBy: "key_name", key: { id: "k2" } });
  });

  it("links a unique source-text match, ignoring case and spacing", () => {
    const [match] = resolveFigmaKeyMatches([{ nodeId: "1", text: "  PAY   now " }], byName, byText);
    expect(match).toMatchObject({ matchedBy: "source_text", key: { id: "k3" } });
  });

  it("leaves ambiguous text unlinked with candidates", () => {
    const [match] = resolveFigmaKeyMatches([{ nodeId: "1", text: "Checkout" }], byName, byText);
    expect(match?.key).toBeNull();
    expect(match?.candidates.map((candidate) => candidate.id)).toEqual(["k1", "k2"]);
  });

  it("reports no match", () => {
    const [match] = resolveFigmaKeyMatches([{ nodeId: "1", text: "Unknown" }], byName, byText);
    expect(match).toEqual({ nodeId: "1", matchedBy: null, key: null, candidates: [] });
  });
});

describe("design context queries", () => {
  async function seed() {
    const { organization, project } = await fixture.createStoredProjectFixture();
    mocks.getAccessibleFigmaProject.mockResolvedValue({
      id: project.id,
      sourceLocale: "en-US",
    });
    const auth = { organization: { localOrganizationId: organization.id } } as ApiAuthContext;
    const [productFile, pluginFile] = await db
      .insert(schema.repositorySourceFiles)
      .values([
        { organizationId: organization.id, projectId: project.id, sourcePath: "locales/en.json" },
        {
          organizationId: organization.id,
          projectId: project.id,
          sourcePath: "figma/files/FILE/page-1.json",
        },
      ])
      .returning({ id: schema.repositorySourceFiles.id });
    const base = { organizationId: organization.id, projectId: project.id };
    const keys = await db
      .insert(schema.projectTranslationKeys)
      .values([
        {
          ...base,
          repositorySourceFileId: productFile!.id,
          key: "checkout.title",
          sourceText: "Checkout",
          normalizedSourceText: "checkout",
          maxLength: 12,
        },
        {
          ...base,
          repositorySourceFileId: productFile!.id,
          key: "checkout.pay",
          sourceText: "Pay now",
          normalizedSourceText: "pay now",
        },
        {
          ...base,
          repositorySourceFileId: pluginFile!.id,
          key: "figma.k.01ABC",
          sourceText: "Pay now",
          normalizedSourceText: "pay now",
        },
        {
          ...base,
          repositorySourceFileId: productFile!.id,
          key: "legacy.pay",
          sourceText: "Pay now",
          normalizedSourceText: "pay now",
          isHidden: true,
        },
      ])
      .returning({ id: schema.projectTranslationKeys.id, key: schema.projectTranslationKeys.key });
    const idOf = (name: string) => keys.find((row) => row.key === name)!.id;
    return { auth, organization, project, idOf };
  }

  it("matches product keys by text and layer name, skipping plugin and hidden keys", async () => {
    const { auth, project, idOf } = await seed();

    const matches = await matchFigmaTextsToKeys({
      auth,
      projectId: project.id,
      texts: [
        { nodeId: "1", text: "pay  NOW" },
        { nodeId: "2", text: "Renamed in design", layerName: "checkout.title" },
        { nodeId: "3", text: "Nothing" },
      ],
    });

    expect(matches[0]).toMatchObject({
      matchedBy: "source_text",
      key: { id: idOf("checkout.pay"), sourcePath: "locales/en.json" },
    });
    expect(matches[0]?.candidates).toHaveLength(1);
    expect(matches[1]).toMatchObject({
      matchedBy: "key_name",
      key: { id: idOf("checkout.title"), maxLength: 12 },
    });
    expect(matches[2]).toMatchObject({ key: null, candidates: [] });
  });

  it("searches keys by name or source text", async () => {
    const { auth, project } = await seed();
    const keys = await searchFigmaProjectKeys({ auth, projectId: project.id, query: "pay" });
    expect(keys.map((key) => key.key)).toEqual(["checkout.pay"]);
  });

  it("returns the locale's translation or source text per key", async () => {
    const { auth, organization, project, idOf } = await seed();
    await db.insert(schema.projectTranslations).values({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: idOf("checkout.title"),
      targetLocale: "fr-FR",
      text: "Passer la commande",
      status: "approved",
    });

    const french = await getFigmaKeyTranslations({
      auth,
      projectId: project.id,
      locale: "fr-FR",
      keyIds: [idOf("checkout.title"), idOf("checkout.pay")],
    });
    expect(french).toEqual(
      expect.arrayContaining([
        {
          keyId: idOf("checkout.title"),
          text: "Passer la commande",
          status: "approved",
          maxLength: 12,
          sourceText: "Checkout",
        },
        {
          keyId: idOf("checkout.pay"),
          text: null,
          status: null,
          maxLength: null,
          sourceText: "Pay now",
        },
      ]),
    );

    const source = await getFigmaKeyTranslations({
      auth,
      projectId: project.id,
      locale: "en-US",
      keyIds: [idOf("checkout.title")],
    });
    expect(source).toEqual([expect.objectContaining({ text: "Checkout", status: "source" })]);
  });
});
