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

import { listGlossaryHistoryPage } from "./glossary-history-page";

const GLOSSARY_ID = "11111111-1111-4111-8111-111111111111";

function cursorSecret() {
  return (
    env.WORKOS_COOKIE_PASSWORD ?? env.PROVIDER_CREDENTIALS_MASTER_KEY ?? "glossary-page-dev-secret"
  );
}

function filterHash(filters: {
  conceptId?: string;
  termId?: string;
  search?: string;
  eventType?: string;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        glossaryId: GLOSSARY_ID,
        conceptId: filters.conceptId ?? null,
        termId: filters.termId ?? null,
        search: filters.search ?? null,
        eventType: filters.eventType ?? null,
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

function sign(encoded: string) {
  return createHmac("sha256", `${cursorSecret()}:glossary-history-page:v1`)
    .update(encoded)
    .digest("base64url");
}

function craftCursor(input: {
  filters?: {
    conceptId?: string;
    termId?: string;
    search?: string;
    eventType?: string;
  };
  issuedAt?: string;
  glossaryId?: string;
  tamperSignature?: boolean;
  omitDot?: boolean;
}) {
  const filters = input.filters ?? {};
  const payload = {
    v: 1,
    glossaryId: input.glossaryId ?? GLOSSARY_ID,
    occurredAt: "2026-09-01T12:00:00.000Z",
    id: "33333333-3333-4333-8333-333333333333",
    filterHash: filterHash(filters),
    issuedAt: input.issuedAt ?? new Date().toISOString(),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  if (input.omitDot) return encoded;
  const signature = input.tamperSignature
    ? "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    : sign(encoded);
  return `${encoded}.${signature}`;
}

describe("listGlossaryHistoryPage cursor validation", () => {
  it("rejects a malformed cursor", async () => {
    const result = await listGlossaryHistoryPage(GLOSSARY_ID, {
      limit: 20,
      cursor: craftCursor({ omitDot: true }),
    });

    expect(result).toMatchObject({
      code: "invalid_glossary_history_cursor",
      reason: "malformed",
    });
  });

  it("rejects a tampered cursor signature", async () => {
    const result = await listGlossaryHistoryPage(GLOSSARY_ID, {
      limit: 20,
      cursor: craftCursor({ tamperSignature: true }),
    });

    expect(result).toMatchObject({
      code: "invalid_glossary_history_cursor",
      reason: "tampered",
    });
  });

  it("rejects an expired cursor", async () => {
    const result = await listGlossaryHistoryPage(GLOSSARY_ID, {
      limit: 20,
      cursor: craftCursor({ issuedAt: "2026-01-01T00:00:00.000Z" }),
    });

    expect(result).toMatchObject({
      code: "invalid_glossary_history_cursor",
      reason: "expired",
    });
  });

  it("rejects a cursor bound to different filters", async () => {
    const result = await listGlossaryHistoryPage(GLOSSARY_ID, {
      limit: 20,
      eventType: "updated",
      cursor: craftCursor({ filters: {} }),
    });

    expect(result).toMatchObject({
      code: "invalid_glossary_history_cursor",
      reason: "filter_mismatch",
    });
  });
});
