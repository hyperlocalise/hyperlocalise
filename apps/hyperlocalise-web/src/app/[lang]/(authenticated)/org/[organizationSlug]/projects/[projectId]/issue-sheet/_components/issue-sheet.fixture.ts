import type { ProjectRecord } from "@/api/routes/project/project.schema";

const fixedNow = "2026-06-07T12:00:00.000Z";

function iso(offsetMs: number) {
  return new Date(Date.parse(fixedNow) + offsetMs).toISOString();
}

export const issueSheetOrganizationSlug = "acme";
export const issueSheetProjectId = "project_website";

export const issueSheetSummaryFixture = {
  total: 3,
  open: 1,
  inProgress: 1,
  resolved: 1,
  wontFix: 0,
};

export type IssueSheetColumnFixture = {
  id: string;
  key: string;
  label: string;
  layer: string;
  type: string;
  config: { options?: { id: string; label: string; color?: string }[] };
  sortOrder: number;
};

export type IssueSheetIssueFixture = {
  id: string;
  title: string;
  description: string;
  issueType: string;
  status: string;
  targetLocale: string | null;
  sourcePath: string | null;
  segmentId: string | null;
  linkKind: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  assigneeUserId: string | null;
  reporter: string | null;
  assignee: string | null;
  key: string | null;
  sourceText: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  values: Record<string, unknown>;
};

export const issueSheetColumnsFixture: IssueSheetColumnFixture[] = [
  {
    id: "col_priority",
    key: "priority",
    label: "Priority",
    layer: "system",
    type: "select",
    config: {
      options: [
        { id: "P0", label: "P0" },
        { id: "P1", label: "P1" },
        { id: "P2", label: "P2" },
      ],
    },
    sortOrder: 0,
  },
  {
    id: "col_owner_note",
    key: "owner_note",
    label: "Owner note",
    layer: "custom",
    type: "long_text",
    config: {},
    sortOrder: 1,
  },
  {
    id: "col_context",
    key: "context",
    label: "Context",
    layer: "custom",
    type: "enrichment",
    config: {},
    sortOrder: 2,
  },
];

export function createIssueSheetIssue(
  overrides: Partial<IssueSheetIssueFixture> = {},
): IssueSheetIssueFixture {
  return {
    id: "issue_001",
    title: "Source string needs context",
    description: "The CTA is ambiguous.",
    issueType: "context_request",
    status: "open",
    targetLocale: "de-DE",
    sourcePath: "messages/home.json",
    segmentId: "cta.save",
    linkKind: "cat_segment",
    linkLabel: "Open in CAT",
    linkUrl: null,
    assigneeUserId: "user_otto",
    reporter: "Mina Chen",
    assignee: "Otto Klein",
    key: "home.cta.save",
    sourceText: "Save changes",
    createdAt: iso(-86_400_000),
    updatedAt: iso(-1_800_000),
    resolvedAt: null,
    values: {
      priority: "P1",
      owner_note: "Waiting on product copy review.",
      context: "",
    },
    ...overrides,
  };
}

export const issueSheetIssuesFixture: IssueSheetIssueFixture[] = [
  createIssueSheetIssue(),
  createIssueSheetIssue({
    id: "issue_002",
    title: "Translation mistake in checkout",
    description: "Payment button label is too long in French.",
    issueType: "translation_mistake",
    status: "in_progress",
    targetLocale: "fr-FR",
    sourcePath: "messages/checkout.json",
    segmentId: "checkout.pay",
    key: "checkout.pay",
    sourceText: "Pay now",
    values: {
      priority: "P2",
      owner_note: "Shorten to fit mobile layout.",
      context: "",
    },
    updatedAt: iso(-3_600_000),
  }),
  createIssueSheetIssue({
    id: "issue_003",
    title: "QA failure on hero headline",
    description: "Length check failed for German headline.",
    issueType: "qa_failure",
    status: "resolved",
    targetLocale: "de-DE",
    sourcePath: "messages/home.json",
    segmentId: "hero.title",
    key: "hero.title",
    sourceText: "Welcome back",
    reporter: "QA Bot",
    assignee: "Aiko Tanaka",
    values: {
      priority: "P1",
      owner_note: "Shortened German variant approved.",
      context: "Suggested shorter headline: Willkommen zurück",
    },
    resolvedAt: iso(-172_800_000),
    updatedAt: iso(-172_800_000),
  }),
];

export const issueSheetResponseFixture = {
  issues: issueSheetIssuesFixture,
  columns: issueSheetColumnsFixture,
  summary: issueSheetSummaryFixture,
};

export const issueSheetProjectFixture: ProjectRecord = {
  id: issueSheetProjectId,
  organizationId: "org_acme",
  teamId: null,
  createdByUserId: "user_mina",
  name: "Website localization",
  description: "Marketing site and product copy",
  translationContext: "Friendly, concise marketing tone",
  source: "external_tms",
  externalProviderKind: "crowdin",
  externalProjectId: "42",
  sourceLocale: "en-US",
  targetLocales: ["fr-FR", "de-DE", "es-ES"],
  externalProjectUrl: "https://crowdin.com/project/website",
  isActive: true,
  lastSyncedAt: iso(-7_200_000),
  lastSyncErrorAt: null,
  lastSyncErrorMessage: null,
  createdAt: iso(-2_592_000_000),
  updatedAt: iso(-7_200_000),
  openJobCount: 2,
};
