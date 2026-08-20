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
  createGlossary,
  createGlossaryFactory,
  CrowdinGlossary,
  NativeGlossary,
  type GlossaryProviderContext,
} from "./glossary-provider";

function context(source: "native" | "external_tms", providerKind: "crowdin" | null) {
  return {
    auth: {},
    glossary: { source, externalProviderKind: providerKind },
  } as GlossaryProviderContext;
}

describe("glossary factory method", () => {
  it("creates the native glossary product", () => {
    const glossary = createGlossary(context("native", null));

    expect(glossary).toBeInstanceOf(NativeGlossary);
    expect(glossary.kind).toBe("native");
  });

  it("creates the Crowdin glossary product", () => {
    const glossary = createGlossary(context("external_tms", "crowdin"));

    expect(glossary).toBeInstanceOf(CrowdinGlossary);
    expect(glossary.kind).toBe("crowdin");
  });

  it("selects a concrete creator before creating the product", () => {
    expect(createGlossaryFactory(context("native", null)).createGlossary()).toBeInstanceOf(
      NativeGlossary,
    );
    expect(
      createGlossaryFactory(context("external_tms", "crowdin")).createGlossary(),
    ).toBeInstanceOf(CrowdinGlossary);
  });
});
