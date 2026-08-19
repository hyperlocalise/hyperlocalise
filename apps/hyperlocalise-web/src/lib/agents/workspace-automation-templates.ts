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
import type { WorkspaceAutomationFormState } from "./workspace-automation-view-model";

export type WorkspaceAutomationTemplateCategory =
  | "popular"
  | "source-content"
  | "marketing"
  | "translation-delivery"
  | "quality"
  | "release";

export type WorkspaceAutomationTemplate = {
  id: string;
  category: WorkspaceAutomationTemplateCategory;
  name: string;
  description: string;
  instructions: string;
  activatable: boolean;
  defaultForm: Partial<WorkspaceAutomationFormState>;
};

export type WorkspaceAutomationTemplateInstructionSection = {
  heading: string;
  items: string[];
};

export function formatWorkspaceAutomationTemplateInstructions(input: {
  role: string;
  capabilities: string[];
  goal: string;
  extraSections?: WorkspaceAutomationTemplateInstructionSection[];
}): string {
  const sections = [
    `You are ${input.role}.`,
    "",
    "What you can do:",
    "",
    ...input.capabilities.map((item) => `- ${item}`),
    "",
    "Goal:",
    "",
    `- ${input.goal}`,
  ];

  for (const extra of input.extraSections ?? []) {
    sections.push("", `${extra.heading}:`, "", ...extra.items.map((item) => `- ${item}`));
  }

  return sections.join("\n");
}

export const WORKSPACE_AUTOMATION_TEMPLATE_CATEGORIES: Array<{
  id: WorkspaceAutomationTemplateCategory;
  label: string;
}> = [
  { id: "popular", label: "Popular" },
  { id: "source-content", label: "Source Content" },
  { id: "marketing", label: "Marketing" },
  { id: "translation-delivery", label: "Translation Delivery" },
  { id: "quality", label: "Quality" },
  { id: "release", label: "Release Readiness" },
];

export const WORKSPACE_AUTOMATION_TEMPLATES_BASE: WorkspaceAutomationTemplate[] = [
  {
    id: "translate-on-source-upload",
    category: "popular",
    name: "Translate on source upload",
    description:
      "When a source file is uploaded, create a native translation job and translate it with the Hyperlocalise agent.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a native TMS intake agent",
      capabilities: [
        "Read the uploaded source file and version from the source-upload trigger",
        "Create a native TMS translation job for the project target locales",
        "Assign the job to Translate with agent so localisation starts immediately",
        "Preserve keys, placeholders, ICU syntax, glossary terms, and file structure",
      ],
      goal: "Start translation as soon as a source file is uploaded, then summarize the job and locales that began.",
    }),
    activatable: true,
    defaultForm: {
      name: "Translate on source upload",
      triggerMode: "source_upload",
      createNativeTmsJobEnabled: true,
      createNativeTmsJobUseProjectTargetLocales: true,
      assignTranslateWithAgentEnabled: true,
    },
  },
  {
    id: "translate-contentful-article",
    category: "popular",
    name: "Translate Contentful article",
    description:
      "Translate updated Contentful help center articles, run QA, and write localized draft fields back for review.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a Contentful localisation editor",
      capabilities: [
        "Read the updated entry and metadata from Contentful",
        "Detect translatable title, body, SEO, tags, CTA fields, and localized image assets",
        "Localize embedded or linked images when the entry contains image content",
        "Preserve placeholders, links, product terms, glossary terms, tone, and rich text structure",
        "Run QA checks before writeback",
        "Write localized fields back as Contentful drafts. Do not publish",
      ],
      goal: "Translate help center article updates into the configured target locales and leave drafts ready for review.",
    }),
    activatable: true,
    defaultForm: {
      name: "Translate Contentful article",
      triggerMode: "contentful",
      contentfulEnabled: true,
      contentfulFieldMode: "auto",
      contentfulRunQa: true,
      contentfulWriteDrafts: true,
    },
  },
  {
    id: "validate-localisation-on-push",
    category: "popular",
    name: "Validate localisation on push",
    description:
      "Check localisation changes on every push and notify the team when blockers are found.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a localisation quality reviewer",
      capabilities: [
        "Inspect changed source strings and translations on protected-branch pushes",
        "If i18n.yml exists, run Hyperlocalise validation (hl check) against the translation files it maps",
        "Flag missing context, unstable copy, and accidental key churn",
        "Flag missing translations, broken ICU syntax, mismatched placeholders, and unsafe HTML",
        "Treat locale coverage regressions as blocking findings",
        "Ignore style-only code changes that do not affect localisation files or user-facing strings",
        "Notify the team when blockers are found",
      ],
      goal: "Stop localisation defects from reaching production.",
    }),
    activatable: false,
    defaultForm: {
      name: "Validate localisation on push",
      triggerMode: "github",
      pushBranches: ["main"],
      githubEnabled: true,
      githubMode: "sync",
      validationEnabled: true,
      slackEnabled: true,
    },
  },
  {
    id: "summarize-changes-daily",
    category: "popular",
    name: "Summarize changes daily",
    description:
      "Read a GitHub repository each day and post a concise Slack digest of localisation-related changes.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a daily localisation briefing agent",
      capabilities: [
        "Read recent commits, diffs, and surrounding files from the last 24 hours",
        "If i18n.yml exists, run Hyperlocalise validation (hl check) against the translation files it maps",
        "Keep the digest scoped to localisation, i18n, and translation work",
        "Cite commit SHAs and file paths for specific claims",
        "Call out coverage gaps, ICU or placeholder risk, and incomplete translation syncs",
        "Ignore unrelated feature, infrastructure, and formatting work unless it changes user-facing copy or locale files",
      ],
      goal: "Post a concise digest of localisation-related changes so the team can stay aligned without reading every commit.",
      extraSections: [
        {
          heading: "Digest focus",
          items: [
            "New or updated source strings and message catalogs",
            "Translation file, locale resource, and coverage changes",
            "ICU, placeholder, glossary, and i18n config updates",
            "Localisation-related PRs, syncs, and release risks",
          ],
        },
      ],
    }),
    activatable: true,
    defaultForm: {
      name: "Summarize changes daily",
      triggerMode: "scheduled",
      scheduledCadence: "daily",
      scheduledHourUtc: 9,
      scheduledTimezone: "UTC",
      githubEnabled: true,
      githubMode: "agent",
      repositoryTargetKind: "github",
      pushSourceEnabled: false,
      pullTranslationsEnabled: false,
      validationEnabled: false,
      slackEnabled: true,
    },
  },
  {
    id: "review-code-daily",
    category: "popular",
    name: "Review code daily",
    description:
      "Read recent repository changes each day, review them for localisation and translation risk, and post findings to Slack.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a localisation-focused code reviewer for this repository",
      capabilities: [
        "Read recent commits, diffs, and surrounding code from the last 24 hours",
        "If i18n.yml exists, run Hyperlocalise validation (hl check) against the translation files it maps",
        "Extract changed translation keys and review old vs new values in locale catalogs",
        "Judge localisation, translation, and locale-compliance risk in the changed code",
        "Cite commit SHAs and file paths for each finding",
        "Separate blocking localisation defects from non-blocking follow-ups",
        "Ignore unrelated logic, security, and formatting issues unless they affect user-facing copy or locale behavior",
      ],
      goal: "Surface localisation and translation risks from the last day so the team can act before they ship further.",
      extraSections: [
        {
          heading: "Review scope",
          items: [
            "Follow the Translation review shared procedure for per-key findings and P0/P1/P2 output",
            "Also review code-adjacent localisation: hard-coded copy, i18n APIs, locale routing, fallback, and writeback",
          ],
        },
        {
          heading: "Slack delivery",
          items: [
            "Post Translation review report sections as the Slack message body",
            "When P0 blockers exist, they must appear first",
          ],
        },
      ],
    }),
    activatable: true,
    defaultForm: {
      name: "Review code daily",
      triggerMode: "scheduled",
      scheduledCadence: "daily",
      scheduledHourUtc: 8,
      scheduledTimezone: "UTC",
      githubEnabled: true,
      githubMode: "agent",
      repositoryTargetKind: "github",
      pushSourceEnabled: false,
      pullTranslationsEnabled: false,
      validationEnabled: false,
      slackEnabled: true,
    },
  },
  {
    id: "daily-web-research",
    category: "popular",
    name: "Daily web research",
    description:
      "Search the live web each day for competitor, market, and localisation changes, then post a sourced brief to Slack.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a localisation research analyst",
      capabilities: [
        "Search the live web for current facts, competitors, markets, and industry changes",
        "Cite titles and URLs for every claim you rely on",
        "Separate confirmed facts from speculation",
        "Keep the brief short enough to read in a standup",
      ],
      goal: "Deliver a daily, source-backed research brief the team can act on.",
      extraSections: [
        {
          heading: "Research focus",
          items: [
            "Localisation, i18n, and TMS product or industry changes",
            "Competitor shipping, pricing, and market-language moves",
            "Regulatory, platform, or SEO changes that affect translated content",
          ],
        },
      ],
    }),
    activatable: true,
    defaultForm: {
      name: "Daily web research",
      triggerMode: "scheduled",
      scheduledCadence: "daily",
      scheduledHourUtc: 8,
      scheduledTimezone: "UTC",
      webSearchEnabled: true,
      webSearchProvider: "auto",
      slackEnabled: true,
    },
  },
  {
    id: "full-localisation-sync",
    category: "popular",
    name: "Full localisation sync",
    description: "Run a daily source push, translation pull, and validation pass for the project.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a localisation sync operator",
      capabilities: [
        "Push new or changed source strings to the translation system",
        "Pull completed translations back into the repository",
        "Validate locale coverage, placeholders, ICU syntax, and release-blocking issues",
        "Notify the configured channel with a concise summary of completed work and blockers",
      ],
      goal: "Keep source strings, translations, and validation in sync every day.",
    }),
    activatable: false,
    defaultForm: {
      name: "Full localisation sync",
      triggerMode: "scheduled",
      scheduledCadence: "daily",
      scheduledHourUtc: 22,
      scheduledTimezone: "UTC",
      githubEnabled: true,
      pushSourceEnabled: true,
      pullTranslationsEnabled: true,
      validationEnabled: true,
      slackEnabled: true,
    },
  },
  {
    id: "push-source-strings",
    category: "source-content",
    name: "Push source strings",
    description:
      "Send changed source strings to the translation system whenever localisation files change.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a source-string intake agent",
      capabilities: [
        "Push new and updated user-facing strings from the repository to the translation system",
        "Preserve stable translation keys where possible",
        "Highlight source strings that lack product context or contain hard-coded locale assumptions",
        "Avoid changing translated files unless the push workflow requires it",
      ],
      goal: "Get new source copy into translation as soon as localisation files change.",
    }),
    activatable: false,
    defaultForm: {
      name: "Push source strings",
      triggerMode: "github",
      pushBranches: ["main"],
      githubEnabled: true,
      pushSourceEnabled: true,
    },
  },
  {
    id: "pull-translations-daily",
    category: "translation-delivery",
    name: "Pull translations daily",
    description: "Bring completed translations back into the repository on a daily schedule.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a translation delivery agent",
      capabilities: [
        "Pull completed translations from the translation system into the repository",
        "Keep generated changes scoped to locale resource files",
        "Preserve formatting, placeholders, ICU syntax, and file ordering conventions",
        "Summarize newly completed locales and languages still below release coverage",
        "Avoid broad rewrites that make translation diffs hard to review",
      ],
      goal: "Bring finished translations back into the repository every day without noisy diffs.",
    }),
    activatable: false,
    defaultForm: {
      name: "Pull translations daily",
      triggerMode: "scheduled",
      scheduledCadence: "daily",
      scheduledHourUtc: 22,
      scheduledTimezone: "UTC",
      githubEnabled: true,
      pullTranslationsEnabled: true,
    },
  },
  {
    id: "release-localisation-check",
    category: "release",
    name: "Release localisation check",
    description:
      "Validate release branches for localisation coverage, placeholder safety, and blocking translation gaps.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a release localisation reviewer",
      capabilities: [
        "Confirm required locales meet coverage expectations",
        "Flag missing translations in release-critical user journeys",
        "Verify placeholders, ICU syntax, punctuation, and embedded markup remain safe",
        "Notify the team with clear release blockers and non-blocking follow-ups",
      ],
      goal: "Catch localisation gaps before a release branch ships.",
    }),
    activatable: false,
    defaultForm: {
      name: "Release localisation check",
      triggerMode: "github",
      pushBranches: ["main", "release/*"],
      githubEnabled: true,
      validationEnabled: true,
      slackEnabled: true,
    },
  },
  {
    id: "weekly-localisation-summary",
    category: "release",
    name: "Weekly localisation summary",
    description:
      "Post a weekly summary of localisation progress, outstanding gaps, and release risks.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a weekly localisation reporter",
      capabilities: [
        "Summarize source strings changed and translations pulled during the week",
        "Report locales that are complete, in progress, or blocked",
        "Call out placeholder, ICU, or formatting issues that need attention",
        "List release risks and the next recommended action for each blocker",
      ],
      goal: "Give stakeholders a weekly picture of localisation progress and remaining risk.",
    }),
    activatable: false,
    defaultForm: {
      name: "Weekly localisation summary",
      triggerMode: "scheduled",
      scheduledCadence: "weekly",
      scheduledDayOfWeek: 1,
      scheduledHourUtc: 22,
      scheduledTimezone: "UTC",
      githubEnabled: true,
      pullTranslationsEnabled: true,
      slackEnabled: true,
    },
  },
  {
    id: "icu-placeholder-audit",
    category: "quality",
    name: "ICU and placeholder audit",
    description: "Flag ICU syntax errors and unsafe placeholders on every push to main.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "an ICU and placeholder auditor",
      capabilities: [
        "Detect broken ICU plural/select syntax and invalid message format strings",
        "Flag placeholder name mismatches between source and translated strings",
        "Flag unsafe HTML or markup embedded in translated copy",
        "Notify the team only when findings are release-blocking",
      ],
      goal: "Keep message syntax and placeholders safe on every push to main.",
    }),
    activatable: false,
    defaultForm: {
      name: "ICU and placeholder audit",
      triggerMode: "github",
      pushBranches: ["main"],
      githubEnabled: true,
      validationEnabled: true,
      slackEnabled: true,
    },
  },
  {
    id: "missing-translation-gate",
    category: "quality",
    name: "Missing translation gate",
    description: "Block merges when required locales drop below coverage on protected branches.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a missing-translation gatekeeper",
      capabilities: [
        "Detect locale coverage regressions on user-facing keys",
        "Flag new source strings without completed translations in required languages",
        "Find stale or empty values in locale resource files",
        "Summarize blockers with locale, file, and key context for fast fixes",
      ],
      goal: "Block merges when required locales drop below coverage on protected branches.",
    }),
    activatable: false,
    defaultForm: {
      name: "Missing translation gate",
      triggerMode: "github",
      pushBranches: ["main", "release/*"],
      githubEnabled: true,
      validationEnabled: true,
      slackEnabled: true,
    },
  },
  {
    id: "locale-coverage-daily",
    category: "quality",
    name: "Daily locale coverage check",
    description: "Run a daily validation pass and post coverage gaps to Slack.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a daily locale coverage reporter",
      capabilities: [
        "Report locales below required coverage thresholds",
        "List keys added in the last day without translations",
        "Call out non-blocking formatting issues worth fixing before release",
      ],
      goal: "Give the team a daily view of coverage gaps before they become release blockers.",
    }),
    activatable: false,
    defaultForm: {
      name: "Daily locale coverage check",
      triggerMode: "scheduled",
      scheduledCadence: "daily",
      scheduledHourUtc: 8,
      scheduledTimezone: "UTC",
      githubEnabled: true,
      validationEnabled: true,
      slackEnabled: true,
    },
  },
  {
    id: "push-source-on-feature-branches",
    category: "source-content",
    name: "Push source on feature branches",
    description: "Send updated source strings when feature branches change localisation files.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a feature-branch source intake agent",
      capabilities: [
        "Push new user-facing copy from active feature branches to the translation system",
        "Keep translation keys stable and include clear product context for translators",
        "Skip translated locale files unless the workflow requires updates",
      ],
      goal: "Start translation on feature work before it lands on main.",
    }),
    activatable: false,
    defaultForm: {
      name: "Push source on feature branches",
      triggerMode: "github",
      pushBranches: ["feature/*", "main"],
      githubEnabled: true,
      pushSourceEnabled: true,
    },
  },
  {
    id: "pull-translations-on-merge",
    category: "translation-delivery",
    name: "Pull translations on merge",
    description: "Pull completed translations when changes land on main.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a post-merge translation delivery agent",
      capabilities: [
        "Pull completed translations into the repository after merges to main",
        "Limit diffs to locale resource files",
        "Preserve placeholders, ICU syntax, and repository formatting conventions",
        "Summarize locales updated and languages still pending review",
      ],
      goal: "Land finished translations on main as soon as they are ready.",
    }),
    activatable: false,
    defaultForm: {
      name: "Pull translations on merge",
      triggerMode: "github",
      pushBranches: ["main"],
      githubEnabled: true,
      pullTranslationsEnabled: true,
      slackEnabled: true,
    },
  },
  {
    id: "hourly-translation-pull",
    category: "translation-delivery",
    name: "Hourly translation pull",
    description: "Keep the repository in sync with completed translations throughout the day.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "an hourly translation delivery agent",
      capabilities: [
        "Pull newly completed translations from the translation system every hour",
        "Prefer incremental locale file updates over large batch rewrites",
        "Flag conflicts between in-flight repo edits and pulled translations",
      ],
      goal: "Keep the repository current with completed translations throughout the day.",
    }),
    activatable: false,
    defaultForm: {
      name: "Hourly translation pull",
      triggerMode: "scheduled",
      scheduledCadence: "hourly",
      scheduledTimezone: "UTC",
      githubEnabled: true,
      pullTranslationsEnabled: true,
    },
  },
  {
    id: "email-release-digest",
    category: "translation-delivery",
    name: "Email release digest",
    description: "Email a weekly digest of translation delivery status to stakeholders.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a translation delivery correspondent",
      capabilities: [
        "Report locales completed since the last digest",
        "List languages still below release coverage",
        "Call out pull requests or branches waiting on translations",
        "Send the digest to the configured email recipients",
      ],
      goal: "Keep stakeholders informed of translation delivery status each week.",
    }),
    activatable: false,
    defaultForm: {
      name: "Email release digest",
      triggerMode: "scheduled",
      scheduledCadence: "weekly",
      scheduledDayOfWeek: 5,
      scheduledHourUtc: 16,
      scheduledTimezone: "UTC",
      githubEnabled: true,
      pullTranslationsEnabled: true,
      emailEnabled: true,
    },
  },
  {
    id: "pre-release-validation",
    category: "release",
    name: "Pre-release validation",
    description: "Validate release branches every hour during release week.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a pre-release localisation validator",
      capabilities: [
        "Validate localisation on active release branches throughout the day",
        "Escalate missing translations in release-critical flows",
        "Flag placeholder or ICU regressions introduced during stabilization",
        "Detect locale files that drift from approved source copy",
      ],
      goal: "Catch release-blocking localisation issues while the branch is still being stabilized.",
    }),
    activatable: false,
    defaultForm: {
      name: "Pre-release validation",
      triggerMode: "scheduled",
      scheduledCadence: "hourly",
      scheduledTimezone: "UTC",
      githubEnabled: true,
      validationEnabled: true,
      slackEnabled: true,
    },
  },
  {
    id: "notify-on-push-blockers",
    category: "popular",
    name: "Notify on push blockers",
    description:
      "Review each GitHub push for localisation and translation risk, then comment on the pull request.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a localisation-focused code reviewer for this repository",
      capabilities: [
        "Read the pushed commits, diffs, and surrounding code",
        "If i18n.yml exists, run Hyperlocalise validation (hl check) against the translation files it maps",
        "Judge localisation, translation, and locale-compliance risk in the changed code",
        "Cite commit SHAs and file paths for each finding",
        "Separate blocking localisation defects from non-blocking follow-ups",
        "Ignore unrelated logic, security, and formatting issues unless they affect user-facing copy or locale behavior",
        "Post findings as a sticky GitHub pull request comment and update it on later pushes",
      ],
      goal: "Surface localisation and translation risks from this push on the pull request before they merge.",
      extraSections: [
        {
          heading: "Review focus",
          items: [
            "Hard-coded copy, missing keys, and source strings that cannot be translated",
            "Broken ICU, placeholders, plurals, and locale-sensitive formatting",
            "Translation coverage, fallback, and writeback regressions",
            "Localisation compliance: locale, RTL, legal, and market-language constraints",
          ],
        },
      ],
    }),
    activatable: true,
    defaultForm: {
      name: "Notify on push blockers",
      triggerMode: "github",
      pushBranches: ["main"],
      githubEnabled: true,
      githubMode: "agent",
      repositoryTargetKind: "github",
      pushSourceEnabled: false,
      pullTranslationsEnabled: false,
      validationEnabled: false,
      githubCommentEnabled: true,
    },
  },
  {
    id: "create-localisation-job-brief",
    category: "source-content",
    name: "Create localisation job brief",
    description:
      "Generate a translator-ready brief from PRs, tickets, assets, or TMS jobs with context, screenshots, glossary terms, tone, priority, and deadlines.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a localisation job brief writer",
      capabilities: [
        "Gather product context from PRs, tickets, and linked assets",
        "Collect screenshots, glossary terms, tone guidance, priority, and deadlines",
        "List open questions or risks that could block translation quality",
      ],
      goal: "Produce a translator-ready brief before localisation work starts.",
    }),
    activatable: false,
    defaultForm: {
      name: "Create localisation job brief",
      triggerMode: "manual",
      githubEnabled: true,
      slackEnabled: true,
    },
  },
  {
    id: "market-messaging-brief",
    category: "marketing",
    name: "Market messaging brief",
    description:
      "Build a market adaptation brief before translation when campaign or landing page copy is sent to a new market.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a market messaging analyst for localisation teams",
      capabilities: [
        "Read the source message, brand tone, and proof points",
        "Research local competitors, ads, SERPs, and category language in the target market",
        "Recommend positioning, claims, objections, and tone that work in that market",
        "Use Semrush, Ahrefs, live web search, brand docs, and the TMS glossary when connected",
      ],
      goal: "Produce a short market adaptation brief before translation starts.",
      extraSections: [
        {
          heading: "Deliverable",
          items: [
            "Recommended positioning, claims, proof, objections, tone, and translation guardrails",
            "Open questions or risks that could block high-quality localisation",
          ],
        },
      ],
    }),
    activatable: false,
    defaultForm: {
      name: "Market messaging brief",
      triggerMode: "manual",
      githubEnabled: true,
      slackEnabled: true,
    },
  },
  {
    id: "local-search-intent-brief",
    category: "marketing",
    name: "Local search intent brief",
    description:
      "Decide whether to translate, adapt, rewrite, or split SEO pages for local organic and paid search before localisation.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "an SEO localisation strategist",
      capabilities: [
        "Analyse the source page, local keywords, search volume, SERP intent, and ranking competitors",
        "Use Search Console and analytics performance when available",
        "Compare source intent with what searchers expect in the target locale",
        "Use Semrush, Ahrefs, live web search, CMS content, and the TMS glossary when connected",
      ],
      goal: "Decide whether the page should be translated, adapted, rewritten, or split for the target market.",
      extraSections: [
        {
          heading: "Deliverable",
          items: [
            "A recommendation: translate, adapt, rewrite, or split the page",
            "Priority keywords, intent notes, competitor patterns, and content changes for translators",
            "Risks to ranking, paid efficiency, or conversion if the page is translated literally",
          ],
        },
      ],
    }),
    activatable: false,
    defaultForm: {
      name: "Local search intent brief",
      triggerMode: "manual",
      githubEnabled: true,
      slackEnabled: true,
    },
  },
  {
    id: "add-context-to-tms-strings",
    category: "source-content",
    name: "Add context to TMS strings",
    description:
      "Attach PRs, tickets, screenshots, Figma frames, and usage notes to new source strings before translation starts.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a TMS context researcher",
      capabilities: [
        "Attach linked PRs, tickets, screenshots, and Figma frames to new source strings",
        "Add usage notes, glossary references, and locale-sensitive constraints",
        "Flag strings whose missing context is likely to cause rework",
      ],
      goal: "Give translators enough product and design context before they start.",
    }),
    activatable: false,
    defaultForm: {
      name: "Add context to TMS strings",
      triggerMode: "github",
      pushBranches: ["main"],
      githubEnabled: true,
      pushSourceEnabled: true,
    },
  },
  {
    id: "review-tms-translations",
    category: "quality",
    name: "Review TMS translations",
    description:
      "Check pending translations against glossary, placeholders, formatting, brand tone, and market-specific style rules.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a TMS translation reviewer",
      capabilities: [
        "Check pending translations against glossary, placeholders, ICU syntax, and formatting",
        "Judge brand tone and market-specific style rules",
        "Separate non-blocking suggestions from release-blocking issues",
      ],
      goal: "Review pending TMS translations before they are approved for delivery.",
    }),
    activatable: false,
    defaultForm: {
      name: "Review TMS translations",
      triggerMode: "scheduled",
      scheduledCadence: "daily",
      scheduledHourUtc: 9,
      scheduledTimezone: "UTC",
      githubEnabled: true,
      validationEnabled: true,
      slackEnabled: true,
    },
  },
  {
    id: "hyperlocalise-campaign-assets",
    category: "translation-delivery",
    name: "Hyperlocalise campaign assets",
    description:
      "Adapt campaign copy, CTA, tone, and visual direction for each market, then route approved copy into the TMS.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a campaign localisation editor",
      capabilities: [
        "Adapt campaign copy, CTAs, tone, and visual direction for each market",
        "Apply market-specific constraints from the glossary and brand guidelines",
        "Route approved copy into the TMS for translation and delivery",
      ],
      goal: "Hyperlocalise campaign assets so each market gets copy that converts, not a literal translation.",
    }),
    activatable: false,
    defaultForm: {
      name: "Hyperlocalise campaign assets",
      triggerMode: "manual",
      githubEnabled: true,
      pushSourceEnabled: true,
      slackEnabled: true,
    },
  },
  {
    id: "publish-approved-translations",
    category: "translation-delivery",
    name: "Publish approved translations",
    description:
      "Pull reviewed translations from the TMS and deliver them into GitHub, CMS, app store metadata, or release workflows.",
    instructions: formatWorkspaceAutomationTemplateInstructions({
      role: "a translation publishing agent",
      capabilities: [
        "Pull reviewed translations from the TMS",
        "Deliver them into GitHub locale files, CMS content, app store metadata, or release workflows",
        "Preserve placeholders, ICU syntax, and repository formatting conventions",
        "Summarize locales published and any delivery blockers",
      ],
      goal: "Publish approved translations into the downstream systems that ship them.",
    }),
    activatable: false,
    defaultForm: {
      name: "Publish approved translations",
      triggerMode: "scheduled",
      scheduledCadence: "daily",
      scheduledHourUtc: 22,
      scheduledTimezone: "UTC",
      githubEnabled: true,
      pullTranslationsEnabled: true,
      slackEnabled: true,
    },
  },
];

export const WORKSPACE_AUTOMATION_TEMPLATES = WORKSPACE_AUTOMATION_TEMPLATES_BASE;

export type WorkspaceAutomationTemplateFlowNode = {
  id: string;
  label: string;
};

export type WorkspaceAutomationTemplateFlow = {
  trigger: WorkspaceAutomationTemplateFlowNode;
  tools: WorkspaceAutomationTemplateFlowNode[];
};

function scheduledTriggerLabel(form: Partial<WorkspaceAutomationFormState>) {
  if (form.scheduledCadence === "hourly") {
    return "Hourly";
  }

  if (form.scheduledCadence === "weekly") {
    return "Weekly";
  }

  return "Daily";
}

export function getWorkspaceAutomationTemplateFlow(
  template: WorkspaceAutomationTemplate,
): WorkspaceAutomationTemplateFlow {
  const form = template.defaultForm;
  const triggerMode = form.triggerMode ?? "manual";

  const trigger: WorkspaceAutomationTemplateFlowNode =
    triggerMode === "github"
      ? { id: "github-push", label: "GitHub push" }
      : triggerMode === "contentful"
        ? { id: "contentful-webhook", label: "Contentful webhook" }
        : triggerMode === "source_upload"
          ? { id: "source-upload", label: "Source upload" }
          : triggerMode === "scheduled"
            ? { id: "scheduled", label: scheduledTriggerLabel(form) }
            : { id: "manual", label: "Manual" };

  const tools: WorkspaceAutomationTemplateFlowNode[] = [];

  if (form.githubEnabled) {
    if (form.pushSourceEnabled) {
      tools.push({ id: "push-source", label: "Push source" });
    }
    if (form.pullTranslationsEnabled) {
      tools.push({ id: "pull-translations", label: "Pull translations" });
    }
    if (form.validationEnabled) {
      tools.push({ id: "validation", label: "Validation" });
    }
    if (!form.pushSourceEnabled && !form.pullTranslationsEnabled && !form.validationEnabled) {
      tools.push({ id: "github", label: "GitHub" });
    }
  }

  if (form.createNativeTmsJobEnabled) {
    tools.push({ id: "create-job", label: "Create job" });
  }
  if (form.assignTranslateWithAgentEnabled) {
    tools.push({ id: "translate-with-agent", label: "Translate with agent" });
  }

  if (form.slackEnabled) {
    tools.push({ id: "slack", label: "Slack" });
  }

  if (form.emailEnabled) {
    tools.push({ id: "email", label: "Email" });
  }

  if (form.githubCommentEnabled) {
    tools.push({ id: "github-comment", label: "GitHub comment" });
  }

  if (form.contentfulEnabled) {
    tools.push({ id: "contentful", label: "Contentful" });
  }

  if (form.webSearchEnabled) {
    tools.push({ id: "web-search", label: "Web Search" });
  }

  return { trigger, tools };
}

export function getWorkspaceAutomationTemplate(
  templateId: string,
  templates: WorkspaceAutomationTemplate[] = WORKSPACE_AUTOMATION_TEMPLATES,
) {
  return templates.find((template) => template.id === templateId) ?? null;
}

export function getWorkspaceAutomationTemplateCategoryLabel(
  category: WorkspaceAutomationTemplateCategory,
) {
  return (
    WORKSPACE_AUTOMATION_TEMPLATE_CATEGORIES.find((entry) => entry.id === category)?.label ??
    category
  );
}

export function listWorkspaceAutomationTemplates(
  category?: WorkspaceAutomationTemplateCategory,
  templates: WorkspaceAutomationTemplate[] = WORKSPACE_AUTOMATION_TEMPLATES,
) {
  if (!category) {
    return templates;
  }

  return templates.filter((template) => template.category === category);
}
