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
import { createIntl } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import {
  automationTemplatesFixture,
  createAutomationSummary,
  createVisualWorkflowSummary,
} from "./automations.fixture";
import {
  filterAutomationListItems,
  resolveAgentAutomationSummary,
  resolveAutomationListCounts,
  resolveAutomationListItems,
  resolveAutomationTools,
  resolveUsableAutomationTemplates,
  resolveVisualWorkflowSummary,
  resolveSortedAutomationTemplates,
  resolveTemplateCategoryTabs,
  resolveVisibleAutomations,
} from "./automations-page-view-model";

const intl = createIntl({ locale: "en", messages: {} });

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

describe("resolveAutomationListItems", () => {
  const agent = createAutomationSummary({
    id: "agent",
    name: "Validate on push",
    updatedAt: "2026-06-01T00:00:00.000Z",
  });
  const workflow = createVisualWorkflowSummary({
    id: "workflow",
    name: "Release check",
    updatedAt: "2026-06-05T00:00:00.000Z",
  });

  it("lists agents and workflows together, most recently changed first", () => {
    const items = resolveAutomationListItems([agent], [workflow]);

    expect(items.map((item) => [item.type, item.id])).toEqual([
      ["workflow", "workflow"],
      ["agent", "agent"],
    ]);
  });

  it("leaves out archived workflows and content syncs", () => {
    const items = resolveAutomationListItems(
      [agent, createAutomationSummary({ id: "sync", kind: "content_sync" })],
      [workflow, createVisualWorkflowSummary({ id: "archived", status: "archived" })],
    );

    expect(items.map((item) => item.id).toSorted()).toEqual(["agent", "workflow"]);
  });

  it("lists agents alone on a project's page", () => {
    const items = resolveAutomationListItems([agent], [workflow], "project-1");

    expect(items.map((item) => item.id)).toEqual(["agent"]);
  });

  it("counts and filters by status, type and name", () => {
    const paused = createAutomationSummary({ id: "paused", name: "Paused sync", status: "paused" });
    const items = resolveAutomationListItems([agent, paused], [workflow]);

    expect(resolveAutomationListCounts(items)).toEqual({ all: 3, active: 1, paused: 1, draft: 1 });
    const filter = (filters: Partial<Parameters<typeof filterAutomationListItems>[1]>) =>
      filterAutomationListItems(items, { status: "all", type: "all", query: "", ...filters }).map(
        (item) => item.id,
      );
    expect(filter({ status: "draft" })).toEqual(["workflow"]);
    expect(filter({ type: "agent" }).toSorted()).toEqual(["agent", "paused"]);
    expect(filter({ query: "  RELEASE " })).toEqual(["workflow"]);
  });
});

describe("automation summaries", () => {
  it("reads an agent as its trigger and then its tools", () => {
    expect(resolveAgentAutomationSummary(intl, createAutomationSummary())).toBe(
      "GitHub push → GitHub, Slack",
    );
  });

  it("reads a workflow as its trigger and then how many steps follow", () => {
    expect(resolveVisualWorkflowSummary(intl, createVisualWorkflowSummary())).toBe(
      "Manual → 2 steps",
    );
  });
});

describe("resolveUsableAutomationTemplates", () => {
  it("leaves out the templates that are not ready yet", () => {
    const usable = resolveUsableAutomationTemplates(automationTemplatesFixture);

    expect(usable.length).toBeGreaterThan(0);
    expect(usable.every((template) => template.activatable)).toBe(true);
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

describe("resolveAutomationTools", () => {
  it("returns GitHub and Slack with stable ids for the list badges", () => {
    expect(resolveAutomationTools(intl, createAutomationSummary())).toEqual([
      { id: "github", label: "GitHub" },
      { id: "slack", label: "Slack" },
    ]);
  });

  it("shows Contentful when that workflow is enabled", () => {
    const base = createAutomationSummary();

    expect(
      resolveAutomationTools(
        intl,
        createAutomationSummary({
          toolConfig: {
            ...base.toolConfig,
            github: { ...base.toolConfig.github!, enabled: false },
            slack: { enabled: false },
            contentful: { ...base.toolConfig.contentful!, enabled: true },
          },
        }),
      ),
    ).toEqual([{ id: "contentful", label: "Contentful" }]);
  });

  it("collapses Braze templates and campaigns into one badge", () => {
    const base = createAutomationSummary();

    expect(
      resolveAutomationTools(
        intl,
        createAutomationSummary({
          toolConfig: {
            ...base.toolConfig,
            github: { ...base.toolConfig.github!, enabled: false },
            slack: { enabled: false },
            braze: {
              enabled: true,
              sourceLocale: "en",
              templateIds: [],
              contentBlockIds: [],
              existingTranslationPolicy: "seed_empty",
              overwriteWhenRemoteNewer: true,
            },
            brazeCampaigns: {
              enabled: true,
              sourceLocale: "en",
              campaignIds: [],
              canvasIds: [],
              existingTranslationPolicy: "seed_empty",
              overwriteWhenRemoteNewer: true,
            },
          },
        }),
      ),
    ).toEqual([{ id: "braze", label: "Braze" }]);
  });

  it("shows Iterable with its brand badge", () => {
    const base = createAutomationSummary();

    expect(
      resolveAutomationTools(
        intl,
        createAutomationSummary({
          toolConfig: {
            ...base.toolConfig,
            github: { ...base.toolConfig.github!, enabled: false },
            slack: { enabled: false },
            iterable: {
              enabled: true,
              sourceLocale: "en",
              templateIds: [],
              snippetIds: [],
              existingTranslationPolicy: "seed_empty",
            },
          },
        }),
      ),
    ).toEqual([{ id: "iterable", label: "Iterable" }]);
  });

  it("shows Customer.io with its brand badge", () => {
    const base = createAutomationSummary();

    expect(
      resolveAutomationTools(
        intl,
        createAutomationSummary({
          toolConfig: {
            ...base.toolConfig,
            github: { ...base.toolConfig.github!, enabled: false },
            slack: { enabled: false },
            customerIo: {
              enabled: true,
              broadcastIds: [],
              campaignIds: [],
              newsletterIds: [],
              transactionalMessageIds: [],
              broadcastActions: {},
              campaignActions: {},
              newsletterActions: {},
              transactionalMessageActions: {},
              existingTranslationPolicy: "seed_empty",
              overwriteWhenRemoteNewer: true,
            },
          },
        }),
      ),
    ).toEqual([{ id: "customerIo", label: "Customer.io" }]);
  });
});

describe("resolveTemplateCategoryTabs", () => {
  it("shows extra categories for dual-listed templates", () => {
    const emailTemplates = automationTemplatesFixture.find(
      (template) => template.id === "translate-braze-email-templates",
    );
    const campaigns = automationTemplatesFixture.find(
      (template) => template.id === "translate-braze-campaigns",
    );
    expect(emailTemplates).toBeDefined();
    expect(campaigns).toBeDefined();

    expect(resolveTemplateCategoryTabs([emailTemplates!]).map((tab) => tab.id)).toEqual([
      "popular",
      "marketing",
    ]);
    expect(resolveTemplateCategoryTabs([campaigns!]).map((tab) => tab.id)).toEqual([
      "popular",
      "marketing",
    ]);
  });
});
