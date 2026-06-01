import type { WorkspaceAutomationFormState } from "./workspace-automation-view-model";

export type WorkspaceAutomationTemplateCategory =
  | "popular"
  | "code-review"
  | "security"
  | "incidents"
  | "data";

export type WorkspaceAutomationTemplate = {
  id: string;
  category: WorkspaceAutomationTemplateCategory;
  name: string;
  description: string;
  instructions: string;
  activatable: boolean;
  defaultForm: Partial<WorkspaceAutomationFormState>;
};

export const WORKSPACE_AUTOMATION_TEMPLATE_CATEGORIES: Array<{
  id: WorkspaceAutomationTemplateCategory;
  label: string;
}> = [
  { id: "popular", label: "Popular" },
  { id: "code-review", label: "Code Review" },
  { id: "security", label: "Security" },
  { id: "incidents", label: "Incidents & Triage" },
  { id: "data", label: "Data & Research" },
];

export const WORKSPACE_AUTOMATION_TEMPLATES: WorkspaceAutomationTemplate[] = [
  {
    id: "find-critical-bugs",
    category: "popular",
    name: "Find critical bugs",
    description:
      "Inspect recent commits for high-severity behavioral regressions and open a pull request when a fix is ready.",
    instructions: [
      "You are a deep bug-finding automation.",
      "",
      "Goal: inspect recent commits for critical bugs before they reach production.",
      "",
      "Investigation strategy:",
      "- Focus on behavioral changes, data corruption, auth regressions, and race conditions.",
      "- Ignore style-only diffs and low-risk refactors.",
    ].join("\n"),
    activatable: true,
    defaultForm: {
      name: "Find critical bugs",
      triggerMode: "scheduled",
      scheduledCadence: "daily",
      scheduledHourUtc: 22,
      scheduledTimezone: "UTC",
      githubEnabled: true,
      validationEnabled: true,
      slackEnabled: true,
    },
  },
  {
    id: "summarize-changes-daily",
    category: "popular",
    name: "Summarize changes daily",
    description: "Post a concise summary of repository changes to Slack every day.",
    instructions:
      "Summarize the most important repository changes from the last day, grouped by risk and user impact. Keep the update concise and actionable.",
    activatable: true,
    defaultForm: {
      name: "Summarize changes daily",
      triggerMode: "scheduled",
      scheduledCadence: "daily",
      scheduledHourUtc: 22,
      scheduledTimezone: "UTC",
      githubEnabled: true,
      validationEnabled: true,
      slackEnabled: true,
    },
  },
  {
    id: "add-test-coverage",
    category: "code-review",
    name: "Add test coverage",
    description: "Review recent changes and propose tests for under-covered critical paths.",
    instructions:
      "Review recent changes and identify critical paths missing automated tests. Open a pull request only when tests are clearly justified.",
    activatable: true,
    defaultForm: {
      name: "Add test coverage",
      triggerMode: "scheduled",
      scheduledCadence: "weekly",
      scheduledDayOfWeek: 1,
      scheduledHourUtc: 22,
      scheduledTimezone: "UTC",
      githubEnabled: true,
      validationEnabled: true,
    },
  },
  {
    id: "assign-pr-reviewers",
    category: "code-review",
    name: "Assign PR reviewers",
    description: "Assign reviewers based on touched areas and auto-approve low-risk pull requests.",
    instructions:
      "Review open pull requests, assign reviewers based on code ownership, and auto-approve only low-risk changes.",
    activatable: false,
    defaultForm: {
      name: "Assign PR reviewers",
      triggerMode: "github",
      pushBranches: ["main"],
      instructions:
        "Review open pull requests, assign reviewers based on code ownership, and auto-approve only low-risk changes.",
    },
  },
  {
    id: "find-vulnerabilities",
    category: "security",
    name: "Find vulnerabilities",
    description:
      "Review pull requests for exploitable security issues and flag only validated findings before merge.",
    instructions:
      "Review pull requests for exploitable security issues. Flag only validated findings with clear reproduction steps.",
    activatable: true,
    defaultForm: {
      name: "Find vulnerabilities",
      triggerMode: "github",
      pushBranches: ["main"],
      githubEnabled: true,
      validationEnabled: true,
      slackEnabled: true,
    },
  },
  {
    id: "scan-codebase-vulnerabilities",
    category: "security",
    name: "Scan codebase for vulnerabilities",
    description:
      "Run a scheduled security scan across the default branch and report validated findings.",
    instructions:
      "Scan the repository for high-confidence security issues. Report only validated findings with remediation guidance.",
    activatable: true,
    defaultForm: {
      name: "Scan codebase for vulnerabilities",
      triggerMode: "scheduled",
      scheduledCadence: "daily",
      scheduledHourUtc: 22,
      scheduledTimezone: "UTC",
      githubEnabled: true,
      validationEnabled: true,
      slackEnabled: true,
    },
  },
  {
    id: "fix-slack-bugs",
    category: "incidents",
    name: "Fix bugs reported in Slack",
    description:
      "Monitor a Slack channel for bug reports, investigate the codebase, and fix with a pull request.",
    instructions:
      "Monitor the configured Slack channel for bug reports, investigate the repository, and open a pull request when a fix is clear.",
    activatable: false,
    defaultForm: {
      name: "Fix bugs reported in Slack",
      triggerMode: "manual",
      slackEnabled: true,
    },
  },
  {
    id: "generate-docs",
    category: "data",
    name: "Generate docs",
    description:
      "Create and update developer documentation for recently changed or under-documented code.",
    instructions:
      "Create or update developer documentation for recently changed or under-documented code. Prefer concise, accurate docs over broad rewrites.",
    activatable: true,
    defaultForm: {
      name: "Generate docs",
      triggerMode: "scheduled",
      scheduledCadence: "weekly",
      scheduledDayOfWeek: 1,
      scheduledHourUtc: 22,
      scheduledTimezone: "UTC",
      githubEnabled: true,
      pullTranslationsEnabled: true,
    },
  },
];

export function getWorkspaceAutomationTemplate(templateId: string) {
  return WORKSPACE_AUTOMATION_TEMPLATES.find((template) => template.id === templateId) ?? null;
}

export function listWorkspaceAutomationTemplates(category?: WorkspaceAutomationTemplateCategory) {
  if (!category) {
    return WORKSPACE_AUTOMATION_TEMPLATES;
  }

  return WORKSPACE_AUTOMATION_TEMPLATES.filter((template) => template.category === category);
}
