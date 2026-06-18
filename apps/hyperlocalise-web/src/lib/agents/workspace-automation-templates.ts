import type { WorkspaceAutomationFormState } from "./workspace-automation-view-model";
import { mergeWorkspaceTemplateSkills } from "@/agents/automations/workspace/agent/workspace-template-manifest";

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
    id: "translate-contentful-article",
    category: "popular",
    name: "Translate Contentful article",
    description:
      "Translate updated Contentful help center articles, run QA, and write localized draft fields back for review.",
    instructions: [
      "Translate Contentful help center article updates into the configured target locales.",
      "",
      "Workflow:",
      "- Read the updated entry and metadata from Contentful.",
      "- Detect translatable title, body, SEO, tags, CTA fields, and localized image assets.",
      "- Localize embedded or linked images when the entry contains image content.",
      "- Preserve placeholders, links, product terms, glossary terms, tone, and rich text structure.",
      "- Run QA checks before writeback.",
      "- Write localized fields back as Contentful drafts for review. Do not publish.",
    ].join("\n"),
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
    instructions: [
      "You are a localisation quality automation.",
      "",
      "Goal: validate source string and translation changes before they reach production.",
      "",
      "Review strategy:",
      "- Check changed source strings for missing context, unstable copy, and accidental key churn.",
      "- Flag missing translations, broken ICU syntax, mismatched placeholders, and unsafe HTML.",
      "- Treat locale coverage regressions and release-blocking translation issues as blocking findings.",
      "- Ignore style-only code changes that do not affect localisation files or user-facing strings.",
    ].join("\n"),
    activatable: true,
    defaultForm: {
      name: "Validate localisation on push",
      triggerMode: "github",
      pushBranches: ["main"],
      githubEnabled: true,
      validationEnabled: true,
      slackEnabled: true,
    },
  },
  {
    id: "full-localisation-sync",
    category: "popular",
    name: "Full localisation sync",
    description: "Run a daily source push, translation pull, and validation pass for the project.",
    instructions: [
      "Run the full localisation sync loop for this repository.",
      "",
      "Expected outcome:",
      "- Push new or changed source strings to the translation system.",
      "- Pull completed translations back into the repository.",
      "- Validate locale coverage, placeholders, ICU syntax, and release-blocking translation issues.",
      "- Notify the configured channel with a concise summary of completed sync work and blockers.",
    ].join("\n"),
    activatable: true,
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
    instructions: [
      "Push changed source strings from the repository to the translation system.",
      "",
      "Focus on source content hygiene:",
      "- Include new and updated user-facing strings.",
      "- Preserve stable translation keys where possible.",
      "- Highlight source strings that lack product context or contain hard-coded locale assumptions.",
      "- Avoid changing translated files unless the push workflow requires it.",
    ].join("\n"),
    activatable: true,
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
    instructions: [
      "Pull completed translations from the translation system into the repository.",
      "",
      "Delivery criteria:",
      "- Keep generated translation changes scoped to locale resources.",
      "- Preserve formatting, placeholders, ICU syntax, and file ordering conventions.",
      "- Summarize newly completed locales and any languages still below release coverage.",
      "- Avoid broad rewrites that make translation diffs hard to review.",
    ].join("\n"),
    activatable: true,
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
    instructions: [
      "Review release-bound localisation changes for blocking issues.",
      "",
      "Release criteria:",
      "- Confirm required locales meet coverage expectations.",
      "- Flag missing translations in release-critical user journeys.",
      "- Verify placeholders, ICU syntax, punctuation, and embedded markup remain safe.",
      "- Notify the team with clear release blockers and non-blocking follow-ups.",
    ].join("\n"),
    activatable: true,
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
    instructions: [
      "Summarize localisation progress for the week.",
      "",
      "Include:",
      "- Source strings changed and translations pulled.",
      "- Locales that are complete, in progress, or blocked.",
      "- Placeholder, ICU, or formatting issues that need attention.",
      "- Release risks and the next recommended action for each blocker.",
    ].join("\n"),
    activatable: true,
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
    instructions: [
      "Audit localisation changes for ICU and placeholder safety.",
      "",
      "Focus on:",
      "- Broken ICU plural/select syntax and invalid message format strings.",
      "- Placeholder name mismatches between source and translated strings.",
      "- Unsafe HTML or markup embedded in translated copy.",
      "- Notify the team only when findings are release-blocking.",
    ].join("\n"),
    activatable: true,
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
    instructions: [
      "Treat missing translations in required locales as release blockers.",
      "",
      "Check for:",
      "- Locale coverage regressions on user-facing keys.",
      "- New source strings without completed translations in required languages.",
      "- Stale or empty values in locale resource files.",
      "- Summarize blockers with locale, file, and key context for fast fixes.",
    ].join("\n"),
    activatable: true,
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
    instructions: [
      "Report daily locale coverage and translation health for the project.",
      "",
      "Include:",
      "- Locales below required coverage thresholds.",
      "- Keys added in the last day without translations.",
      "- Non-blocking formatting issues worth fixing before release.",
    ].join("\n"),
    activatable: true,
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
    instructions: [
      "Push source string changes from feature branches to the translation system.",
      "",
      "Prioritize:",
      "- New user-facing copy introduced on active feature work.",
      "- Stable keys and clear product context for translators.",
      "- Skipping translated locale files unless the workflow requires updates.",
    ].join("\n"),
    activatable: true,
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
    instructions: [
      "Pull completed translations into the repository after merges to main.",
      "",
      "Delivery rules:",
      "- Limit diffs to locale resource files.",
      "- Preserve placeholders, ICU syntax, and repository formatting conventions.",
      "- Summarize locales updated and languages still pending review.",
    ].join("\n"),
    activatable: true,
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
    instructions: [
      "Pull newly completed translations from the translation system on an hourly cadence.",
      "",
      "Keep updates small and reviewable:",
      "- Prefer incremental locale file updates over large batch rewrites.",
      "- Flag conflicts between in-flight repo edits and pulled translations.",
    ].join("\n"),
    activatable: true,
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
    instructions: [
      "Send a weekly email digest of translation delivery progress.",
      "",
      "Cover:",
      "- Locales completed since the last digest.",
      "- Languages still below release coverage.",
      "- Pull requests or branches waiting on translations.",
    ].join("\n"),
    activatable: true,
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
    instructions: [
      "Run pre-release localisation validation on active release branches.",
      "",
      "Escalate:",
      "- Missing translations in release-critical flows.",
      "- Placeholder or ICU regressions introduced during stabilization.",
      "- Locale files that drift from approved source copy.",
    ].join("\n"),
    activatable: true,
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
    description: "Validate every push and ping Slack when localisation blockers are found.",
    instructions: [
      "Validate localisation changes on push and notify the team about blockers.",
      "",
      "Notify when:",
      "- Required locales lose coverage.",
      "- Placeholders, ICU syntax, or unsafe markup fail validation.",
      "- Skip notifications for clean runs unless configured otherwise.",
    ].join("\n"),
    activatable: true,
    defaultForm: {
      name: "Notify on push blockers",
      triggerMode: "github",
      pushBranches: ["main"],
      githubEnabled: true,
      validationEnabled: true,
      slackEnabled: true,
    },
  },
  {
    id: "create-localisation-job-brief",
    category: "source-content",
    name: "Create localisation job brief",
    description:
      "Generate a translator-ready brief from PRs, tickets, assets, or TMS jobs with context, screenshots, glossary terms, tone, priority, and deadlines.",
    instructions: [
      "Create a translator-ready localisation job brief from linked work items.",
      "",
      "Include:",
      "- Product context from PRs, tickets, and linked assets.",
      "- Screenshots, glossary terms, tone guidance, priority, and deadlines.",
      "- Open questions or risks that could block translation quality.",
    ].join("\n"),
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
    instructions: [
      "You are a market messaging analyst for localisation teams.",
      "",
      "Trigger: run when a campaign, landing page, or marketing asset is sent for localisation into a new market.",
      "",
      "Goal: produce a short market adaptation brief before translation starts.",
      "",
      "Analyse:",
      "- The source message, brand tone, and proof points.",
      "- Local competitors, ads, SERPs, and category language in the target market.",
      "- What positioning, claims, objections, and tone work in that market.",
      "",
      "Deliverable:",
      "- A concise brief covering recommended positioning, claims, proof, objections, tone, and translation guardrails.",
      "- Open questions or risks that could block high-quality localisation.",
      "",
      "Tools: Semrush, Ahrefs, Google SERP API, Meta Ads Library, Google Ads Transparency Center, Similarweb, brand docs, TMS glossary, Slack, Notion, and Linear.",
    ].join("\n"),
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
    instructions: [
      "You are an SEO localisation strategist.",
      "",
      "Trigger: run when an SEO page, landing page, blog, or campaign page is being localised for organic or paid search.",
      "",
      "Goal: decide whether the page should be translated, adapted, rewritten, or split for the target market.",
      "",
      "Analyse:",
      "- The source page, local keywords, search volume, SERP intent, and ranking competitors.",
      "- Existing Google Search Console and analytics performance where available.",
      "- Gaps between source intent and what searchers expect in the target locale.",
      "",
      "Deliverable:",
      "- A recommendation: translate, adapt, rewrite, or split the page.",
      "- Priority keywords, intent notes, competitor patterns, and content changes for translators.",
      "- Risks to ranking, paid efficiency, or conversion if the page is translated literally.",
      "",
      "Tools: Semrush, Ahrefs, DataForSEO, Google Search Console, GA4, Google Trends, SERP API, CMS, TMS glossary, and translation memory.",
    ].join("\n"),
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
    instructions: [
      "Enrich new TMS source strings with product and design context before translation starts.",
      "",
      "Attach:",
      "- Linked PRs, tickets, screenshots, and Figma frames.",
      "- Usage notes, glossary references, and locale-sensitive constraints.",
      "- Flags when context is missing or likely to cause rework.",
    ].join("\n"),
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
    instructions: [
      "Review pending TMS translations before they are approved for delivery.",
      "",
      "Check:",
      "- Glossary adherence, placeholders, ICU syntax, and formatting.",
      "- Brand tone and market-specific style rules.",
      "- Non-blocking suggestions versus release-blocking issues.",
    ].join("\n"),
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
    instructions: [
      "Hyperlocalise campaign assets for each target market.",
      "",
      "Adapt:",
      "- Campaign copy, CTAs, tone, and visual direction per locale.",
      "- Market-specific constraints from glossary and brand guidelines.",
      "- Route approved copy into the TMS for translation and delivery.",
    ].join("\n"),
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
    instructions: [
      "Publish approved translations from the TMS into downstream delivery targets.",
      "",
      "Deliver to:",
      "- GitHub locale files, CMS content, app store metadata, or release workflows.",
      "- Preserve placeholders, ICU syntax, and repository formatting conventions.",
      "- Summarize locales published and any delivery blockers.",
    ].join("\n"),
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

export const WORKSPACE_AUTOMATION_TEMPLATES = mergeWorkspaceTemplateSkills(
  WORKSPACE_AUTOMATION_TEMPLATES_BASE,
);

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

  if (form.slackEnabled) {
    tools.push({ id: "slack", label: "Slack" });
  }

  if (form.emailEnabled) {
    tools.push({ id: "email", label: "Email" });
  }

  if (form.contentfulEnabled) {
    tools.push({ id: "contentful", label: "Contentful" });
  }

  return { trigger, tools };
}

export function getWorkspaceAutomationTemplate(templateId: string) {
  return WORKSPACE_AUTOMATION_TEMPLATES.find((template) => template.id === templateId) ?? null;
}

export function getWorkspaceAutomationTemplateCategoryLabel(
  category: WorkspaceAutomationTemplateCategory,
) {
  return (
    WORKSPACE_AUTOMATION_TEMPLATE_CATEGORIES.find((entry) => entry.id === category)?.label ??
    category
  );
}

export function listWorkspaceAutomationTemplates(category?: WorkspaceAutomationTemplateCategory) {
  if (!category) {
    return WORKSPACE_AUTOMATION_TEMPLATES;
  }

  return WORKSPACE_AUTOMATION_TEMPLATES.filter((template) => template.category === category);
}
