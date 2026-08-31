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
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database/client";
import { createGlossaryTestFixture } from "@/api/routes/glossary/glossary.fixture";
import type { GlossaryImportDocument } from "./glossary-interchange";
import { applyNativeGlossaryImport } from "./native-glossary-import";

const fixture = createGlossaryTestFixture();

afterEach(async () => {
  await fixture.cleanup();
});

describe("native glossary import concurrency", () => {
  it("loads stable-ID state after locking the glossary", async () => {
    const { glossary } = await fixture.createStoredGlossaryFixture();
    const document: GlossaryImportDocument = {
      concepts: [
        {
          id: "stable-concept",
          primaryTerm: "Checkout",
          terms: [{ id: "stable-term", locale: "en", term: "Checkout" }],
        },
      ],
      diagnostics: [],
    };

    await Promise.all([
      applyNativeGlossaryImport({ glossaryId: glossary.id, mode: "merge", document }),
      applyNativeGlossaryImport({ glossaryId: glossary.id, mode: "merge", document }),
    ]);

    const concepts = await db
      .select()
      .from(schema.glossaryConcepts)
      .where(eq(schema.glossaryConcepts.glossaryId, glossary.id));
    const terms = await db
      .select()
      .from(schema.glossaryTerms)
      .where(eq(schema.glossaryTerms.glossaryId, glossary.id));
    expect(concepts).toHaveLength(1);
    expect(terms).toHaveLength(1);
  });
});
