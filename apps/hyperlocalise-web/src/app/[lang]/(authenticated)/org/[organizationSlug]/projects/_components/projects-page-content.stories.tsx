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
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { http, HttpResponse } from "msw";
import { expect, within } from "storybook/test";
import { ProjectsPageContent } from "./projects-page-content";
import { recordRecentProjectVisit } from "./recent-projects";

const ORGANIZATION_SLUG = "projects-design-preview";
const HOURS = 3_600_000;
const projects = [
  { id: "marketing", name: "Marketing Site", description: "Web copy & landing pages", source: "native", sourceLocale: "en", targetLocales: ["fr", "de", "vi", "zh", "ja", "es"], openJobCount: 2, updatedAt: new Date(Date.now() - 4 * HOURS).toISOString() },
  { id: "docs", name: "Product Docs", description: "Developer documentation", source: "native", sourceLocale: "en", targetLocales: ["fr", "de", "vi", "zh"], openJobCount: 1, updatedAt: new Date(Date.now() - 72 * HOURS).toISOString() },
  { id: "mobile", name: "Mobile App", description: "iOS & Android strings", source: "external_tms", externalProviderKind: "crowdin", sourceLocale: "en", targetLocales: ["fr", "de", "vi", "zh", "ja", "es", "ko", "pt", "it", "nl", "ar", "th"], openJobCount: 3, updatedAt: new Date(Date.now() - 2 * HOURS).toISOString() },
  { id: "help", name: "Help Center", description: "Knowledge base articles", source: "external_tms", externalProviderKind: "crowdin", sourceLocale: "en", targetLocales: ["fr", "de", "vi", "zh", "ja", "es", "ko", "pt"], openJobCount: 0, updatedAt: new Date(Date.now() - 24 * HOURS).toISOString() },
];
const meta = {
  title: "App/Projects/Page",
  component: ProjectsPageContent,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: `/en/org/${ORGANIZATION_SLUG}/projects` } }, msw: { handlers: [
    http.get("*/api/orgs/:organizationSlug/projects", () => HttpResponse.json({projects: projects.filter(project => project.source === "native")})),
    http.get("*/api/orgs/:organizationSlug/tms-provider/connection", () => HttpResponse.json({connection: {providerKind: "crowdin", displayName: "Crowdin", validationStatus: "valid", validationMessage: null}})),
    http.get("*/api/orgs/:organizationSlug/tms-provider/projects", () => HttpResponse.json({projects: projects.filter(project => project.source === "external_tms")})),
  ] } },
  args: {organizationSlug: ORGANIZATION_SLUG},
  loaders: [() => {
    recordRecentProjectVisit(ORGANIZATION_SLUG, "help", {visitedAt: 1});
    recordRecentProjectVisit(ORGANIZATION_SLUG, "marketing", {visitedAt: 2});
    recordRecentProjectVisit(ORGANIZATION_SLUG, "mobile", {visitedAt: 3});
    return {};
  }],
} satisfies Meta<typeof ProjectsPageContent>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Mixed: Story = {};
export const SearchAndFilter: Story = {
  play: async ({canvas, userEvent}) => {
    const table = within(await canvas.findByRole("table", {name: "Projects"}));
    await expect(await table.findByRole("link", {name: "Mobile App"})).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("tab", {name: "Hyperlocalise"}));
    await expect(table.queryByRole("link", {name: "Mobile App"})).not.toBeInTheDocument();
    await expect(table.getByRole("link", {name: "Marketing Site"})).toBeInTheDocument();
    await userEvent.type(canvas.getByRole("textbox", {name: "Search"}), "Product");
    await expect(table.getByRole("link", {name: "Product Docs"})).toBeInTheDocument();
    await expect(table.queryByRole("link", {name: "Marketing Site"})).not.toBeInTheDocument();
    await userEvent.clear(canvas.getByRole("textbox", {name: "Search"}));
    await userEvent.click(canvas.getByRole("tab", {name: "All"}));
  },
};
