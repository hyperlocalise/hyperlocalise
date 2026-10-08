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
import { createIntl } from "@formatjs/intl";
import { describe, expect, it } from "vite-plus/test";

import { automationTemplatesFixture, createAutomationSummary } from "./automations.fixture";
import {
  resolveAutomationCreatorName,
  resolveSortedAutomationTemplates,
  resolveVisibleAutomations,
} from "./automations-page-view-model";

const intl = createIntl({ locale: "en", messages: {} });

describe("resolveAutomationCreatorName", () => {
  it("uses the author display name when present", () => {
    expect(
      resolveAutomationCreatorName(intl, createAutomationSummary({ authorName: "Ada Lovelace" })),
    ).toBe("Ada Lovelace");
  });

  it("falls back to Unknown when the author is missing", () => {
    expect(resolveAutomationCreatorName(intl, createAutomationSummary({ authorName: null }))).toBe(
      "Unknown",
    );
  });
});

describe("resolveVisibleAutomations", () => {
  it("hides archived automations", () => {
    const visible = createAutomationSummary({ id: "visible", status: "active" });
    const archived = createAutomationSummary({ id: "archived", status: "archived" });

    expect(resolveVisibleAutomations([visible, archived]).map((item) => item.id)).toEqual([
      "visible",
    ]);
  });

  it("keeps automations for the selected project", () => {
    const matching = createAutomationSummary({ id: "matching", projectId: "project-1" });
    const other = createAutomationSummary({ id: "other", projectId: "project-2" });
    const unscoped = createAutomationSummary({ id: "unscoped", projectId: null });

    expect(
      resolveVisibleAutomations([matching, other, unscoped], "project-1").map((item) => item.id),
    ).toEqual(["matching"]);
  });
});

describe("resolveSortedAutomationTemplates", () => {
  function usableFlagsByCategory(options?: { usableFirst?: boolean }) {
    const flags = new Map<string, boolean[]>();
    for (const template of resolveSortedAutomationTemplates(automationTemplatesFixture, options)) {
      flags.set(template.category, [...(flags.get(template.category) ?? []), template.activatable]);
    }
    return [...flags.values()];
  }

  it("puts the templates that can be used today first in each category, on request", () => {
    const categories = usableFlagsByCategory({ usableFirst: true });

    expect(categories.some((flags) => flags.includes(true) && flags.includes(false))).toBe(true);
    for (const flags of categories) {
      expect(flags).toEqual(flags.toSorted((left, right) => Number(right) - Number(left)));
    }
  });

  it("orders each category by name alone otherwise", () => {
    const sorted = resolveSortedAutomationTemplates(automationTemplatesFixture);
    const popular = sorted.filter((template) => template.category === "popular");

    expect(popular.map((template) => template.name)).toEqual(
      popular.map((template) => template.name).toSorted((left, right) => left.localeCompare(right)),
    );
  });
});
