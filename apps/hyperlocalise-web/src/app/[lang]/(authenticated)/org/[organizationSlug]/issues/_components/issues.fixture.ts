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
import type { OrganizationIssue } from "./issues-page-view";

const fixedNow = "2026-06-07T12:00:00.000Z";

function iso(offsetMs: number) {
  return new Date(Date.parse(fixedNow) + offsetMs).toISOString();
}

export const issuesOrganizationSlug = "acme";

export const issuesSummaryFixture = {
  total: 4,
  open: 2,
  inProgress: 1,
  resolved: 1,
  wontFix: 0,
};

export function createOrganizationIssue(
  overrides: Partial<OrganizationIssue> = {},
): OrganizationIssue {
  return {
    id: "2f4d8d7b-7c42-4fd8-bc9f-0a9f4c3f5d21",
    identifier: "WEB-1",
    projectId: "project_website",
    projectName: "Website localization",
    title: "Source string needs context",
    description: "The CTA is ambiguous for German translators.",
    issueType: "context_request",
    status: "open",
    targetLocale: "de-DE",
    sourcePath: "messages/home.json",
    linkKind: "cat_segment",
    linkLabel: "Open in CAT",
    linkUrl: null,
    reporter: "Mina Chen",
    assignee: "Otto Klein",
    createdAt: iso(-86_400_000),
    updatedAt: iso(-1_800_000),
    ...overrides,
  };
}

export const organizationIssuesFixture: OrganizationIssue[] = [
  createOrganizationIssue(),
  createOrganizationIssue({
    id: "3a5e9e8c-8d53-4ae9-cd0a-1b0a5d4a6e32",
    identifier: "WEB-2",
    title: "Translation mistake in checkout",
    description: "Payment button label is too long in French.",
    issueType: "translation_mistake",
    status: "in_progress",
    targetLocale: "fr-FR",
    sourcePath: "messages/checkout.json",
    assignee: "Mina Chen",
    updatedAt: iso(-3_600_000),
  }),
  createOrganizationIssue({
    id: "5c7a1a0e-0f75-4cf1-ef2c-3d2c7f6c8a54",
    identifier: "MOB-1",
    projectId: "project_mobile",
    projectName: "Mobile app",
    title: "Glossary violation in onboarding",
    description: "Product name should stay untranslated.",
    issueType: "glossary_violation",
    status: "open",
    targetLocale: "es-ES",
    sourcePath: "mobile/onboarding.json",
    reporter: "Aiko Tanaka",
    assignee: null,
    updatedAt: iso(-7_200_000),
  }),
  createOrganizationIssue({
    id: "4b6f0f9d-9e64-4bf0-de1b-2c1b6e5b7f43",
    identifier: "WEB-3",
    title: "QA failure on hero headline",
    description: "Length check failed for German headline.",
    issueType: "qa_failure",
    status: "resolved",
    targetLocale: "de-DE",
    sourcePath: "messages/home.json",
    reporter: "QA Bot",
    assignee: "Otto Klein",
    updatedAt: iso(-172_800_000),
  }),
];
