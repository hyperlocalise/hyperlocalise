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
    id: "issue_001",
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
    id: "issue_002",
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
    id: "issue_003",
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
    id: "issue_004",
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
