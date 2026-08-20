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
  hidden: boolean;
  icon: string | null;
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
  templateKey: string | null;
  assigneeUserId: string | null;
  reporter: string | null;
  assignee: string | null;
  key: string | null;
  sourceText: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  values: Record<string, unknown>;
  isWatching: boolean;
};

export type IssueSheetSubscriberFixture = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
};

export const issueSheetSubscribersFixture: IssueSheetSubscriberFixture[] = [
  {
    userId: "user_mina",
    displayName: "Mina Chen",
    avatarUrl: null,
  },
  {
    userId: "user_otto",
    displayName: "Otto Klein",
    avatarUrl: null,
  },
];

export const issueSheetManySubscribersFixture: IssueSheetSubscriberFixture[] = [
  ...issueSheetSubscribersFixture,
  {
    userId: "user_aiko",
    displayName: "Aiko Tanaka",
    avatarUrl: null,
  },
  {
    userId: "user_jamal",
    displayName: "Jamal Rivers",
    avatarUrl: null,
  },
  {
    userId: "user_leo",
    displayName: "Leo Park",
    avatarUrl: null,
  },
];

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
    hidden: false,
    icon: null,
  },
  {
    id: "col_owner_note",
    key: "owner_note",
    label: "Owner note",
    layer: "custom",
    type: "long_text",
    config: {},
    sortOrder: 1,
    hidden: false,
    icon: null,
  },
  {
    id: "col_context",
    key: "context",
    label: "Context",
    layer: "enrichment",
    type: "enrichment",
    config: {},
    sortOrder: 30,
    hidden: false,
    icon: null,
  },
  {
    id: "col_acceptance",
    key: "acceptance",
    label: "Acceptance criteria",
    layer: "custom",
    type: "long_text",
    config: {},
    sortOrder: 35,
    hidden: false,
    icon: "checklist",
  },
  {
    id: "col_sprint",
    key: "sprint",
    label: "Sprint",
    layer: "custom",
    type: "select",
    config: {
      options: [
        { id: "S24", label: "Sprint 24" },
        { id: "S25", label: "Sprint 25" },
      ],
    },
    sortOrder: 40,
    hidden: false,
    icon: "calendar",
  },
  {
    id: "col_component",
    key: "component",
    label: "Component",
    layer: "custom",
    type: "text",
    config: {},
    sortOrder: 50,
    hidden: false,
    icon: "code",
  },
  {
    id: "col_reviewer",
    key: "reviewer",
    label: "Reviewer",
    layer: "custom",
    type: "user",
    config: {},
    sortOrder: 60,
    hidden: false,
    icon: "user",
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
    linkLabel: null,
    linkUrl: null,
    templateKey: "tpl_context_request",
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
      acceptance: "Confirm CTA meaning with product before translation.",
      sprint: "S24",
      component: "Checkout",
      reviewer: "user_mina",
    },
    isWatching: true,
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
    templateKey: "tpl_translation_mistake",
    values: {
      priority: "P2",
      owner_note: "Shorten to fit mobile layout.",
      context: "",
      acceptance: "",
      sprint: "S25",
      component: "Payments",
      reviewer: "user_otto",
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
    // No template — demonstrates the read-only Template row correctly staying hidden.
    templateKey: null,
    reporter: "QA Bot",
    assignee: "Aiko Tanaka",
    assigneeUserId: "user_aiko",
    values: {
      priority: "P1",
      owner_note: "Shortened German variant approved.",
      context: "Suggested shorter headline: Willkommen zurück",
      acceptance: "German headline fits the hero without wrapping on mobile.",
      sprint: "S24",
      component: "Marketing",
      reviewer: "user_mina",
    },
    resolvedAt: iso(-172_800_000),
    updatedAt: iso(-172_800_000),
  }),
  createIssueSheetIssue({
    id: "issue_external_ref",
    title: "Copy review tracked in Jira",
    description: "Product copy is being finalized in the tracker.",
    issueType: "general_question",
    status: "open",
    targetLocale: null,
    sourcePath: null,
    segmentId: null,
    key: null,
    sourceText: null,
    linkKind: "url",
    linkLabel: "View in Jira",
    linkUrl: "https://jira.example.com/browse/LOC-42",
    values: {
      priority: "P2",
      owner_note: "",
      context: "",
      acceptance: "",
      sprint: "",
      component: "",
      reviewer: "",
    },
  }),
];

export const issueSheetResponseFixture = {
  issues: issueSheetIssuesFixture,
  columns: issueSheetColumnsFixture,
  total: issueSheetIssuesFixture.length,
  summary: issueSheetSummaryFixture,
};

export const issueSheetAssignableMembersFixture = [
  {
    userId: "user_mina",
    workosUserId: "workos_mina",
    email: "mina@example.com",
    firstName: "Mina",
    lastName: "Chen",
    displayName: "Mina Chen",
    avatarUrl: null,
    isCurrentUser: true,
  },
  {
    userId: "user_otto",
    workosUserId: "workos_otto",
    email: "otto@example.com",
    firstName: "Otto",
    lastName: "Klein",
    displayName: "Otto Klein",
    avatarUrl: null,
    isCurrentUser: false,
  },
];

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
