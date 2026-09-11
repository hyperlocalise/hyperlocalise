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
import { createHash, createHmac } from "node:crypto";

import { describe, expect, it } from "vite-plus/test";

import { env } from "@/lib/env";

import { listGlossaryTermsPage } from "./glossary-term-page";

const GLOSSARY_ID = "11111111-1111-4111-8111-111111111111";
const CONCEPT_ID = "22222222-2222-4222-8222-222222222222";

const baseFilters = {
  includeArchived: false,
  sort: "updated_at" as const,
  sortDir: "desc" as const,
};

function cursorSecret() {
  return (
    env.WORKOS_COOKIE_PASSWORD ?? env.PROVIDER_CREDENTIALS_MASTER_KEY ?? "glossary-page-dev-secret"
  );
}

function filterHash(filters: Record<string, unknown>) {
  return createHash("sha256")
    .update(JSON.stringify({ glossaryId: GLOSSARY_ID, conceptId: CONCEPT_ID, ...filters }))
    .digest("hex")
    .slice(0, 16);
}

function sign(encoded: string) {
  return createHmac("sha256", `${cursorSecret()}:glossary-term-page:v1`)
    .update(encoded)
    .digest("base64url");
}

function craftCursor(input: {
  filters?: Record<string, unknown>;
  issuedAt?: string;
  glossaryId?: string;
  conceptId?: string;
  tamperSignature?: boolean;
}) {
  const filters = { ...baseFilters, ...input.filters };
  const payload = {
    v: 1,
    glossaryId: input.glossaryId ?? GLOSSARY_ID,
    conceptId: input.conceptId ?? CONCEPT_ID,
    id: "33333333-3333-4333-8333-333333333333",
    sortValue: "2026-09-01T12:00:00.000000Z",
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    filterHash: filterHash(filters),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = input.tamperSignature
    ? "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    : sign(encoded);
  return `${encoded}.${signature}`;
}

describe("listGlossaryTermsPage cursor validation", () => {
  it("rejects a malformed cursor", async () => {
    const result = await listGlossaryTermsPage(GLOSSARY_ID, CONCEPT_ID, {
      ...baseFilters,
      limit: 20,
      cursor: "not-a-cursor",
    });

    expect(result).toMatchObject({
      code: "invalid_glossary_term_cursor",
      reason: "malformed",
    });
  });

  it("rejects a tampered cursor signature", async () => {
    const result = await listGlossaryTermsPage(GLOSSARY_ID, CONCEPT_ID, {
      ...baseFilters,
      limit: 20,
      cursor: craftCursor({ tamperSignature: true }),
    });

    expect(result).toMatchObject({
      code: "invalid_glossary_term_cursor",
      reason: "tampered",
    });
  });

  it("rejects an expired cursor", async () => {
    const result = await listGlossaryTermsPage(GLOSSARY_ID, CONCEPT_ID, {
      ...baseFilters,
      limit: 20,
      cursor: craftCursor({ issuedAt: "2026-01-01T00:00:00.000Z" }),
    });

    expect(result).toMatchObject({
      code: "invalid_glossary_term_cursor",
      reason: "expired",
    });
  });

  it("rejects a cursor bound to different filters", async () => {
    const result = await listGlossaryTermsPage(GLOSSARY_ID, CONCEPT_ID, {
      ...baseFilters,
      limit: 20,
      locale: "fr-FR",
      cursor: craftCursor({ filters: baseFilters }),
    });

    expect(result).toMatchObject({
      code: "invalid_glossary_term_cursor",
      reason: "filter_mismatch",
    });
  });
});
