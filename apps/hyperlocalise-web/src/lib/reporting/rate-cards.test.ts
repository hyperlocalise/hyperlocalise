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

import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database/client";
import { isErr, isOk } from "@/lib/primitives/result/results";

import { resolveReportingRate } from "./capture";
import { isLiveRateLine, listRateCards, rateCardExists, saveRateCard } from "./rate-cards";
import { createReportingTestFixture } from "./reporting.fixture";

const fixture = createReportingTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

const line = (
  targetLocale: string,
  rate: string,
  basis: "word" | "character" | "hour" = "word",
) => ({
  sourceLocale: "en-US",
  targetLocale,
  step: "translation" as const,
  basis,
  rate,
  percentages: {},
});

describe("rate cards", () => {
  it("creates a card once, and saves only an existing one", async () => {
    const { organization, user } = await fixture.createWorkspace();
    const base = { organizationId: organization.id, actorId: user.id, name: "Standard 2026" };

    const created = await saveRateCard({
      ...base,
      defaultBasis: "character",
      lines: [line("ja-JP", "0.02", "character"), line("fr-FR", "0.10")],
      create: true,
    });
    expect(isOk(created) && created.value.lines.map((entry) => entry.targetLocale)).toEqual([
      "fr-FR",
      "ja-JP",
    ]);
    const again = await saveRateCard({ ...base, defaultBasis: "word", lines: [], create: true });
    expect(isErr(again) && again.error).toEqual({ code: "rate_card_exists" });
    const missing = await saveRateCard({
      ...base,
      name: "Agency B",
      defaultBasis: "word",
      lines: [],
      create: false,
    });
    expect(isErr(missing) && missing.error).toEqual({ code: "rate_card_not_found" });
    const duplicate = await saveRateCard({
      ...base,
      defaultBasis: "word",
      lines: [line("fr-FR", "0.10"), line("fr-FR", "0.11")],
      create: false,
    });
    expect(isErr(duplicate) && duplicate.error).toMatchObject({ code: "duplicate_rate_line" });

    await expect(listRateCards(organization.id)).resolves.toEqual([
      {
        name: "Standard 2026",
        defaultBasis: "character",
        lines: [
          expect.objectContaining({ targetLocale: "fr-FR", basis: "word", rate: "0.10000000" }),
          expect.objectContaining({
            targetLocale: "ja-JP",
            basis: "character",
            rate: "0.02000000",
          }),
        ],
      },
    ]);
  });

  it("keeps earlier versions of lines, adds rows only for changes, and retires removed lines", async () => {
    const { organization, user, project } = await fixture.createWorkspace();
    const base = {
      organizationId: organization.id,
      actorId: user.id,
      name: "Standard",
      defaultBasis: "word" as const,
    };
    const first = await saveRateCard({
      ...base,
      lines: [line("fr-FR", "0.10"), line("de-DE", "0.12"), line("es-ES", "0.09")],
      create: true,
    });
    if (!isOk(first)) throw new Error("expected the card to save");
    const ids = new Map(first.value.lines.map((entry) => [entry.targetLocale, entry.id]));

    // fr-FR unchanged (written differently), de-DE changed, es-ES taken off.
    const second = await saveRateCard({
      ...base,
      lines: [line("fr-FR", "0.1"), line("de-DE", "0.13")],
      create: false,
    });
    if (!isOk(second)) throw new Error("expected the card to save");
    const rows = await db
      .select()
      .from(schema.reportingRates)
      .where(eq(schema.reportingRates.organizationId, organization.id));
    expect(rows).toHaveLength(5);
    expect(rows.filter((row) => row.retired).map((row) => row.targetLocale)).toEqual(["es-ES"]);
    const fr = second.value.lines.find((entry) => entry.targetLocale === "fr-FR");
    expect(fr?.id).toBe(ids.get("fr-FR"));
    expect(second.value.lines.map((entry) => entry.targetLocale)).toEqual(["de-DE", "fr-FR"]);

    await expect(isLiveRateLine(organization.id, ids.get("de-DE")!)).resolves.toBe(false);
    await expect(
      isLiveRateLine(
        organization.id,
        second.value.lines.find((e) => e.targetLocale === "de-DE")!.id,
      ),
    ).resolves.toBe(true);
    await expect(isLiveRateLine(organization.id, ids.get("es-ES")!)).resolves.toBe(false);

    // Work recorded from now on for the retired language has no rate.
    await db.insert(schema.reportingBudgets).values({
      organizationId: organization.id,
      projectId: project.id,
      budget: "100",
      rateCardName: "Standard",
    });
    await expect(
      resolveReportingRate({
        organizationId: organization.id,
        projectId: project.id,
        sourceLocale: "en-US",
        targetLocale: "es-ES",
        step: "translation",
      }),
    ).resolves.toBeNull();

    const audit = await db
      .select({ action: schema.reportingAudit.action, before: schema.reportingAudit.before })
      .from(schema.reportingAudit)
      .where(
        and(
          eq(schema.reportingAudit.organizationId, organization.id),
          eq(schema.reportingAudit.actorId, user.id),
        ),
      )
      .orderBy(schema.reportingAudit.createdAt);
    expect(audit.map((entry) => entry.action)).toEqual(["rate_card_created", "rate_card_saved"]);
    expect(audit[0].before).toBeNull();
  });

  it("lists cards made before cards had their own record as per word", async () => {
    const { organization } = await fixture.createWorkspace();
    await db.insert(schema.reportingRates).values({
      organizationId: organization.id,
      name: "Legacy",
      ...line("fr-FR", "0.08"),
    });
    await expect(rateCardExists(organization.id, "Legacy")).resolves.toBe(true);
    await expect(rateCardExists(organization.id, "Nope")).resolves.toBe(false);
    await expect(listRateCards(organization.id)).resolves.toEqual([
      expect.objectContaining({ name: "Legacy", defaultBasis: "word", lines: [expect.anything()] }),
    ]);
  });
});
