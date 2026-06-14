export type UseCaseWorkflowStep = {
  label: string;
  description?: string;
};

export type UseCaseCapability = {
  title: string;
  description: string;
};

export type UseCasePageContent = {
  slug: string;
  metadata: {
    title: string;
    description: string;
    keywords: string[];
  };
  hero: {
    eyebrow: string;
    headline: string;
    subheadline: string;
    ctaLabel: "Join the waitlist" | "Request a demo";
  };
  problem: {
    title: string;
    description: string;
    pains: string[];
  };
  workflow: {
    label: string;
    title: string;
    description: string;
    steps: UseCaseWorkflowStep[];
  };
  capabilities: {
    label: string;
    title: string;
    items: UseCaseCapability[];
  };
  differentiator: {
    label: string;
    title: string;
    description: string;
    points: string[];
  };
  scenario: {
    label: string;
    title: string;
    narrative: string;
  };
  cta: {
    headline: string;
    description: string;
    primaryLabel: "Join the waitlist" | "Request a demo";
  };
};

export const useCasePages: UseCasePageContent[] = [
  {
    slug: "product-localisation",
    metadata: {
      title: "Product Localisation Platform | Hyperlocalise",
      description:
        "Turn product changes, pull requests, and launch briefs into reviewed, release-ready translations. Keep localisation inside your release workflow without replacing your TMS.",
      keywords: [
        "product localisation platform",
        "AI product localisation",
        "GitHub localisation workflow",
        "software localisation automation",
      ],
    },
    hero: {
      eyebrow: "Product localisation",
      headline: "Product localisation that keeps up with every release",
      subheadline:
        "Turn product changes, pull requests, and launch briefs into reviewed, release-ready translations with AI-assisted workflows and human approval built in.",
      ctaLabel: "Join the waitlist",
    },
    problem: {
      title: "Product strings change faster than localisation can follow",
      description:
        "Product teams ship continuously. Localisation teams are left reconciling context across tools after the fact.",
      pains: [
        "Product context lives across GitHub, Slack, Notion, Figma, and your TMS — never in one place when translation starts.",
        "AI drafts miss UI constraints, glossary rules, and what actually changed in the pull request.",
        "Translation work starts too late in the release cycle, so locales block launches or ship with gaps.",
        "Engineering and localisation rely on manual spot checks before release instead of structured gates.",
        "Inconsistent UI copy and terminology drift across locales after every sprint.",
      ],
    },
    workflow: {
      label: "How it works",
      title: "From pull request to release-ready locales",
      description:
        "Hyperlocalise connects product change signals to the review and sync workflow your team already runs.",
      steps: [
        { label: "GitHub PR", description: "Detect changed strings and gather PR context" },
        { label: "Product context", description: "Pull briefs, glossaries, and UI constraints" },
        { label: "AI translation draft", description: "Generate locale drafts with your LLM" },
        { label: "Human review", description: "Route to reviewers in your TMS workflow" },
        { label: "TMS sync", description: "Push approved translations back" },
        { label: "Release check", description: "Flag unresolved locales before ship" },
      ],
    },
    capabilities: {
      label: "Key capabilities",
      title: "Built for product release velocity",
      items: [
        {
          title: "Pull product context from where work happens",
          description:
            "Gather string changes, PR descriptions, Slack threads, and launch briefs so translators see why copy changed — not just the diff.",
        },
        {
          title: "Generate drafts with your preferred LLM",
          description:
            "Use OpenAI, Claude, Gemini, or another provider without locking your stack to one model vendor.",
        },
        {
          title: "Apply glossary, tone, and UI constraints before review",
          description:
            "Enforce terminology, character limits, and product voice before drafts reach human reviewers.",
        },
        {
          title: "Route work to reviewers inside your existing workflow",
          description:
            "Keep review assignments, approvals, and comments in the TMS your localisation team already uses.",
        },
        {
          title: "Sync with your TMS instead of replacing it",
          description:
            "Push approved strings to Crowdin, Lokalise, Phrase, Smartling, or another platform without a migration project.",
        },
        {
          title: "Catch bad translations before production",
          description:
            "Run release checks and regression gates so unresolved locales and quality issues surface before merge.",
        },
      ],
    },
    differentiator: {
      label: "Why this is different",
      title: "An AI-native layer across your product stack — not another TMS",
      description:
        "Hyperlocalise is not here to replace your TMS. It adds a workflow layer that connects engineering change signals, LLM-assisted drafting, human review, and release confidence.",
      points: [
        "TMS agnostic",
        "LLM agnostic",
        "Human-in-the-loop by design",
        "Context-aware from GitHub and product briefs",
        "Built for localisation operations at release speed",
        "Works across engineering, product, and localisation workflows",
      ],
    },
    scenario: {
      label: "Example workflow",
      title: "A new onboarding flow ships in Friday's release",
      narrative:
        "A product manager merges a pull request with a redesigned onboarding flow. Hyperlocalise detects changed strings, gathers context from the PR and product brief, creates translation drafts for each target locale, checks glossary and tone rules, routes them to reviewers in the TMS, syncs approved translations back, and flags unresolved locales before the release train leaves the station.",
    },
    cta: {
      headline: "Build your AI-native localisation workflow",
      description:
        "Join the Hyperlocalise waitlist and see how your team can launch global product content faster without replacing your existing tools.",
      primaryLabel: "Join the waitlist",
    },
  },
  {
    slug: "marketing-localisation",
    metadata: {
      title: "Marketing Localisation Platform | Hyperlocalise",
      description:
        "Turn campaign briefs into brand-safe, locale-adapted marketing copy with review workflows and asset delivery built in. Keep global messaging consistent without slowing launches.",
      keywords: [
        "marketing localisation platform",
        "AI marketing translation",
        "campaign localisation",
        "brand-safe translation",
      ],
    },
    hero: {
      eyebrow: "Marketing localisation",
      headline: "Campaign localisation that protects brand voice in every market",
      subheadline:
        "Turn launch briefs, campaign assets, and regional messaging into reviewed, culturally adapted copy — with approval flows and glossary control built in.",
      ctaLabel: "Request a demo",
    },
    problem: {
      title: "Global campaigns break when context stays in the brief",
      description:
        "Marketing teams move fast. Localisation becomes a bottleneck when brand nuance and regional intent never reach the translator.",
      pains: [
        "Campaign context sits in Notion, Figma, Slack, and agency decks — not in the translation workflow.",
        "Generic AI translation flattens brand voice, cultural references, and regional nuance.",
        "Approval chains span marketing, legal, and localisation with no shared view of what changed.",
        "Landing pages and ads drift across locales after the initial launch push.",
        "Performance learnings from one market rarely feed back into the next campaign cycle.",
      ],
    },
    workflow: {
      label: "How it works",
      title: "From campaign brief to market-ready assets",
      description:
        "Hyperlocalise carries brand context through adaptation, review, and delivery so every locale ships with intent intact.",
      steps: [
        { label: "Campaign brief", description: "Capture goals, audience, and messaging" },
        { label: "Brand context", description: "Apply voice, glossary, and legal guardrails" },
        { label: "Locale adaptation", description: "Adapt copy for regional nuance" },
        { label: "Review workflow", description: "Route to marketing and legal reviewers" },
        { label: "Asset delivery", description: "Sync approved copy to CMS and ad platforms" },
        { label: "Performance learning", description: "Feed locale results into the next cycle" },
      ],
    },
    capabilities: {
      label: "Key capabilities",
      title: "Built for brand-safe global campaigns",
      items: [
        {
          title: "Ingest campaign briefs and creative context",
          description:
            "Pull messaging intent, audience notes, and creative direction from the tools marketing teams already use.",
        },
        {
          title: "Enforce brand voice and terminology",
          description:
            "Apply glossaries, tone guides, and do-not-translate rules before drafts reach reviewers.",
        },
        {
          title: "Adapt for regional nuance, not word-for-word translation",
          description:
            "Generate locale-aware drafts that respect cultural context while keeping campaign intent aligned.",
        },
        {
          title: "Run multi-stakeholder approval flows",
          description:
            "Route copy through marketing, legal, and localisation reviewers with clear status and audit trails.",
        },
        {
          title: "Deliver to CMS and campaign tools",
          description:
            "Sync approved copy to Contentful, Webflow, ad platforms, and your TMS without duplicate handoffs.",
        },
        {
          title: "Track drift across live campaigns",
          description:
            "Monitor when published marketing copy falls out of sync with source messaging or glossary rules.",
        },
      ],
    },
    differentiator: {
      label: "Why this is different",
      title: "Translation intelligence for marketing — not a generic TMS",
      description:
        "Hyperlocalise connects campaign context, brand rules, and review decisions into one workflow. Your TMS stays the system of record; Hyperlocalise makes sure the right context reaches every locale.",
      points: [
        "TMS agnostic",
        "LLM agnostic",
        "Human-in-the-loop approvals",
        "Context-aware from briefs and brand guides",
        "Built for marketing and localisation operations",
        "Works across CMS, creative, and campaign workflows",
      ],
    },
    scenario: {
      label: "Example workflow",
      title: "A product launch campaign goes live in six markets",
      narrative:
        "A growth lead shares a launch brief in Slack with positioning, audience segments, and legal disclaimers. Hyperlocalise structures the campaign for localisation, applies brand glossary and tone rules, generates adapted drafts for each locale, routes them through marketing and legal review, syncs approved copy to the CMS and ad platforms, and flags any locale where messaging has drifted from the approved source.",
    },
    cta: {
      headline: "Bring translation intelligence into your localisation workflow",
      description: "Request early access to Hyperlocalise.",
      primaryLabel: "Request a demo",
    },
  },
  {
    slug: "help-center-localisation",
    metadata: {
      title: "Help Center Localisation | Hyperlocalise",
      description:
        "Keep support articles translated and fresh across locales. Connect CMS updates to review workflows and freshness monitoring without support content lag.",
      keywords: [
        "help center localisation",
        "AI help center translation",
        "support content localisation",
        "knowledge base translation",
      ],
    },
    hero: {
      eyebrow: "Help center localisation",
      headline: "Support content that stays current in every language",
      subheadline:
        "Turn new and updated help articles into reviewed translations, sync them to your CMS, and monitor freshness so customers never read stale guidance.",
      ctaLabel: "Join the waitlist",
    },
    problem: {
      title: "Support content goes stale the moment it ships in English",
      description:
        "Product updates outpace help center translations. Support teams absorb the cost when localized articles lag behind.",
      pains: [
        "New articles and updates live in Zendesk, Intercom, Contentful, or Notion — disconnected from localisation queues.",
        "AI translation misses product terminology, UI labels, and support-specific phrasing.",
        "Reviewers cannot see what changed in the source article when approving updates.",
        "Translated articles fall behind after every product release without anyone noticing.",
        "Support tickets spike in non-English locales when guidance is outdated or missing.",
      ],
    },
    workflow: {
      label: "How it works",
      title: "From new article to monitored locale coverage",
      description:
        "Hyperlocalise connects CMS change signals to translation, terminology checks, and ongoing freshness monitoring.",
      steps: [
        { label: "New article", description: "Detect published or updated support content" },
        { label: "Content analysis", description: "Extract structure, links, and product terms" },
        { label: "Translation draft", description: "Generate locale drafts with your LLM" },
        { label: "Terminology check", description: "Validate glossary and UI label consistency" },
        { label: "CMS sync", description: "Push approved translations to your help center" },
        { label: "Freshness monitoring", description: "Alert when locales fall behind source" },
      ],
    },
    capabilities: {
      label: "Key capabilities",
      title: "Built for support content at scale",
      items: [
        {
          title: "Connect to Zendesk, Intercom, Contentful, and more",
          description:
            "Detect new and updated articles from the CMS and support platforms your team already maintains.",
        },
        {
          title: "Preserve product terminology and UI labels",
          description:
            "Apply glossaries and in-product string references so help content matches what users see in the app.",
        },
        {
          title: "Show reviewers what changed in the source",
          description:
            "Attach article diffs and product context so reviewers approve updates with full visibility.",
        },
        {
          title: "Route to support and localisation reviewers",
          description:
            "Assign articles to the right reviewers based on topic, locale, or expertise.",
        },
        {
          title: "Sync approved translations back to your CMS",
          description:
            "Publish localized articles without manual copy-paste between your TMS and help center.",
        },
        {
          title: "Monitor locale freshness and coverage gaps",
          description:
            "Track which articles are missing translations or lag behind the English source after product changes.",
        },
      ],
    },
    differentiator: {
      label: "Why this is different",
      title: "Support localisation that stays connected to the product",
      description:
        "Hyperlocalise is not another help center tool. It adds an AI-native workflow layer that keeps support content aligned with product changes, glossary rules, and review standards.",
      points: [
        "TMS agnostic",
        "LLM agnostic",
        "Human-in-the-loop review",
        "Context-aware from CMS and product docs",
        "Built for support and localisation operations",
        "Works across CMS, TMS, and product workflows",
      ],
    },
    scenario: {
      label: "Example workflow",
      title: "A billing FAQ update needs to reach twelve locales",
      narrative:
        "Support publishes an updated billing FAQ after a pricing change. Hyperlocalise detects the article update, analyzes changed sections and linked product terms, generates translation drafts for each locale, runs terminology checks against the product glossary, routes drafts to support reviewers, syncs approved translations to Zendesk and Contentful, and alerts the team if any locale still shows the pre-change version after forty-eight hours.",
    },
    cta: {
      headline: "Build your AI-native localisation workflow",
      description:
        "Join the Hyperlocalise waitlist and see how your team can keep support content current across every locale.",
      primaryLabel: "Join the waitlist",
    },
  },
  {
    slug: "github-release-localisation",
    metadata: {
      title: "GitHub Localisation Workflow | Hyperlocalise",
      description:
        "Automate localisation checks in CI/CD. Detect string changes in pull requests, draft translations, and gate releases before bad translations reach production.",
      keywords: [
        "GitHub localisation workflow",
        "localisation CI",
        "software translation automation",
        "AI localisation for developers",
      ],
    },
    hero: {
      eyebrow: "GitHub release localisation",
      headline: "Localisation checks that run with every pull request",
      subheadline:
        "Detect string changes, gather PR context, draft translations, and gate releases — so engineering teams catch localisation issues before merge, not after launch.",
      ctaLabel: "Join the waitlist",
    },
    problem: {
      title: "Localisation is still a manual step outside the release pipeline",
      description:
        "Developers merge string changes daily. Localisation quality depends on someone remembering to check before ship.",
      pains: [
        "String changes hide in large pull requests without clear localisation impact.",
        "Engineering and localisation coordinate over Slack instead of inside CI/CD.",
        "Translation files drift from source strings between releases.",
        "Release gates depend on manual TMS checks that block deploys unpredictably.",
        "Bad translations reach production because there is no automated regression layer.",
      ],
    },
    workflow: {
      label: "How it works",
      title: "From pull request to release gate",
      description:
        "Hyperlocalise fits into the developer workflow your team already runs — with GitHub Actions and TMS sync built in.",
      steps: [
        { label: "Pull request", description: "Detect added, changed, and removed strings" },
        { label: "Change analysis", description: "Map diffs to locales and glossary impact" },
        { label: "Translation draft", description: "Generate locale drafts with your LLM" },
        { label: "Review routing", description: "Open review tasks in your TMS" },
        { label: "CI check", description: "Run localisation gates in GitHub Actions" },
        { label: "Release gate", description: "Block merge when locales are unresolved" },
      ],
    },
    capabilities: {
      label: "Key capabilities",
      title: "Built for developer-led release workflows",
      items: [
        {
          title: "GitHub Action for localisation checks",
          description:
            "Run drift detection, coverage checks, and regression evals on every pull request.",
        },
        {
          title: "Detect string changes from PR diffs",
          description:
            "Surface added, modified, and removed keys with context from the pull request description and linked issues.",
        },
        {
          title: "Draft translations with your preferred LLM",
          description:
            "Generate locale drafts automatically when strings change, using glossary and TM context.",
        },
        {
          title: "Comment on pull requests with localisation status",
          description:
            "Give reviewers a clear view of locale coverage, quality flags, and unresolved items before merge.",
        },
        {
          title: "Sync approved strings to your TMS",
          description:
            "Push translations to Crowdin, Lokalise, Phrase, or Smartling without leaving the release flow.",
        },
        {
          title: "Block releases when quality gates fail",
          description:
            "Configure checks that prevent merge when critical locales are missing or regression thresholds are exceeded.",
        },
      ],
    },
    differentiator: {
      label: "Why this is different",
      title: "Localisation intelligence inside your CI/CD pipeline",
      description:
        "Hyperlocalise is not a replacement for your TMS or i18n library. It adds an AI-native layer that connects GitHub change signals, translation drafting, and release gates.",
      points: [
        "TMS agnostic",
        "LLM agnostic",
        "Human-in-the-loop when review is required",
        "Context-aware from pull requests and issues",
        "Built for engineering and localisation operations",
        "Works across GitHub, TMS, and release tooling",
      ],
    },
    scenario: {
      label: "Example workflow",
      title: "A pricing page refactor opens a pull request on Tuesday",
      narrative:
        "A developer opens a pull request that renames fourteen UI strings and adds six new ones. Hyperlocalise comments on the PR with affected locales, generates translation drafts using glossary context from the linked launch brief, opens review tasks in Lokalise, runs the GitHub Action to verify all target locales are covered, and blocks merge until German and Japanese reviewers approve the updated pricing terminology.",
    },
    cta: {
      headline: "Build your AI-native localisation workflow",
      description:
        "Join the Hyperlocalise waitlist and bring localisation checks into your release pipeline.",
      primaryLabel: "Join the waitlist",
    },
  },
  {
    slug: "localisation-quality-monitoring",
    metadata: {
      title: "Localisation Quality Monitoring | Hyperlocalise",
      description:
        "Monitor translation quality, terminology drift, and locale coverage at scale. Run quality gates and catch regressions before they reach customers.",
      keywords: [
        "localisation quality monitoring",
        "translation quality automation",
        "AI translation QA",
        "localisation QA checks",
      ],
    },
    hero: {
      eyebrow: "Localisation quality monitoring",
      headline: "Catch translation drift before your customers do",
      subheadline:
        "Monitor terminology consistency, locale coverage, and translation quality across product, marketing, and support content — with gates that block bad syncs before they go live.",
      ctaLabel: "Request a demo",
    },
    problem: {
      title: "Quality issues surface after launch, not before",
      description:
        "Teams ship translations and hope for the best. Drift, missing locales, and terminology breaks accumulate quietly across releases.",
      pains: [
        "No single view of locale health across product strings, marketing copy, and support articles.",
        "Terminology breaks when different teams translate the same product terms independently.",
        "Regression checks run manually — or not at all — before major releases.",
        "Review coverage is unclear: which locales were human-approved vs. machine-translated only.",
        "Quality problems are discovered by customers, support tickets, or app store reviews.",
      ],
    },
    workflow: {
      label: "How it works",
      title: "From content sync to ongoing quality monitoring",
      description:
        "Hyperlocalise runs quality checks at every stage — draft, review, sync, and after publish.",
      steps: [
        { label: "Content sync", description: "Track strings across TMS and sources" },
        { label: "Quality analysis", description: "Run glossary, drift, and coverage checks" },
        { label: "Regression eval", description: "Compare against approved baselines" },
        { label: "Review routing", description: "Escalate flagged items to reviewers" },
        { label: "Release gate", description: "Block sync when thresholds fail" },
        { label: "Ongoing monitor", description: "Alert on drift after publish" },
      ],
    },
    capabilities: {
      label: "Key capabilities",
      title: "Built for quality at scale",
      items: [
        {
          title: "Monitor locale coverage across all content types",
          description:
            "See which locales are complete, partial, or missing for product, marketing, and support content.",
        },
        {
          title: "Detect terminology drift and glossary violations",
          description:
            "Flag when translations diverge from approved terminology or when source strings change without locale updates.",
        },
        {
          title: "Run regression evals before sync and release",
          description:
            "Compare new translations against approved baselines and block sync when quality thresholds fail.",
        },
        {
          title: "Track review coverage and approval status",
          description:
            "Know which strings were human-reviewed, machine-translated only, or pending approval per locale.",
        },
        {
          title: "Surface quality issues in pull requests",
          description:
            "Show localisation health directly in GitHub so engineering and localisation share one view.",
        },
        {
          title: "Alert on post-publish drift",
          description:
            "Monitor live content for terminology breaks, missing updates, and locale gaps after release.",
        },
      ],
    },
    differentiator: {
      label: "Why this is different",
      title: "Quality monitoring across your stack — not a point-in-time QA tool",
      description:
        "Hyperlocalise connects quality checks to the workflows where content is created, reviewed, and synced. Your TMS stays the system of record; Hyperlocalise makes quality visible at every step.",
      points: [
        "TMS agnostic",
        "LLM agnostic",
        "Human-in-the-loop escalation",
        "Context-aware quality checks",
        "Built for localisation operations and release confidence",
        "Works across product, marketing, support, and engineering",
      ],
    },
    scenario: {
      label: "Example workflow",
      title: "A glossary update needs to propagate across three content types",
      narrative:
        "Localisation updates the product glossary after a rebrand. Hyperlocalise scans product strings, marketing landing pages, and help center articles for terminology that no longer matches, runs regression evals against approved baselines, routes flagged strings to reviewers, blocks TMS sync for locales that fail the threshold, and continues monitoring published content for drift over the following two weeks.",
    },
    cta: {
      headline: "Bring translation intelligence into your localisation workflow",
      description: "Request early access to Hyperlocalise.",
      primaryLabel: "Request a demo",
    },
  },
  {
    slug: "localisation-operations",
    metadata: {
      title: "Localisation Operations Platform | Hyperlocalise",
      description:
        "Orchestrate localisation across TMS platforms, LLM providers, vendors, and reviewers. One workflow layer for localisation managers without replacing your stack.",
      keywords: [
        "localisation operations platform",
        "AI localisation operations",
        "TMS agnostic localisation",
        "translation workflow automation",
      ],
    },
    hero: {
      eyebrow: "Localisation operations",
      headline: "One operations layer across your entire localisation stack",
      subheadline:
        "Orchestrate agents, reviewers, vendors, LLMs, and TMS platforms in a single workflow — without replacing the tools your team already depends on.",
      ctaLabel: "Request a demo",
    },
    problem: {
      title: "Localisation operations span too many disconnected systems",
      description:
        "Localisation managers coordinate across TMS tools, model providers, vendors, and engineering — with no unified view of what is in flight.",
      pains: [
        "Work arrives from product, marketing, support, and engineering through different channels with no shared intake.",
        "Switching LLM providers or TMS platforms disrupts established workflows.",
        "Vendor and reviewer assignments happen manually across spreadsheets and Slack.",
        "Approvals and status live in the TMS while context lives elsewhere.",
        "Reporting on throughput, quality, and locale coverage requires stitching data from multiple tools.",
      ],
    },
    workflow: {
      label: "How it works",
      title: "From intake to orchestrated delivery",
      description:
        "Hyperlocalise gives localisation operations a single control plane across sources, models, reviewers, and sync targets.",
      steps: [
        { label: "Intake", description: "Collect work from GitHub, Slack, CMS, and TMS" },
        { label: "Context assembly", description: "Attach glossaries, briefs, and history" },
        { label: "Agent assignment", description: "Route to LLM agents or human reviewers" },
        { label: "Review & approval", description: "Track decisions across stakeholders" },
        { label: "TMS sync", description: "Push approved work to your platform" },
        { label: "Operations report", description: "Monitor throughput and locale health" },
      ],
    },
    capabilities: {
      label: "Key capabilities",
      title: "Built for localisation managers",
      items: [
        {
          title: "Unified intake across product, marketing, and support",
          description:
            "Collect localisation requests from GitHub, Slack, CMS platforms, and your TMS into one queue.",
        },
        {
          title: "Orchestrate agents, vendors, and internal reviewers",
          description:
            "Assign translation, review, and QA work based on locale, content type, or expertise.",
        },
        {
          title: "Switch LLM providers without workflow redesign",
          description:
            "Use different models for different content types while keeping review and sync logic consistent.",
        },
        {
          title: "Stay TMS agnostic across platforms",
          description:
            "Operate across Crowdin, Lokalise, Phrase, Smartling, and other TMS tools from one workflow layer.",
        },
        {
          title: "Track approvals and audit trails",
          description:
            "See who approved what, when, and with what context — across agents and human reviewers.",
        },
        {
          title: "Report on throughput, coverage, and quality",
          description:
            "Monitor locale health, review backlog, and quality trends without exporting from three systems.",
        },
      ],
    },
    differentiator: {
      label: "Why this is different",
      title: "An operations platform that connects your stack — not another silo",
      description:
        "Hyperlocalise is not a TMS replacement. It is the workflow layer localisation operations teams use to orchestrate agents, humans, models, and platforms without a rip-and-replace migration.",
      points: [
        "TMS agnostic",
        "LLM agnostic",
        "Human-in-the-loop orchestration",
        "Context-aware across all content sources",
        "Built for localisation operations at scale",
        "Works across product, marketing, support, and engineering",
      ],
    },
    scenario: {
      label: "Example workflow",
      title: "A localisation manager plans the quarter across four content streams",
      narrative:
        "A localisation manager receives intake from a product release, a marketing campaign, twelve updated help articles, and a vendor translation batch. Hyperlocalise structures each stream with the right context and glossary rules, assigns product strings to an LLM agent with human review, routes marketing copy through legal approval, sends vendor work to the TMS with quality gates, and surfaces a single dashboard showing locale coverage, review backlog, and blocked releases across all four streams.",
    },
    cta: {
      headline: "Build your AI-native localisation workflow",
      description:
        "Join the Hyperlocalise waitlist and see how your operations team can orchestrate localisation without replacing your existing tools.",
      primaryLabel: "Join the waitlist",
    },
  },
];

export const useCasePagesBySlug = Object.fromEntries(
  useCasePages.map((page) => [page.slug, page]),
) as Record<string, UseCasePageContent>;

export const useCaseSlugs = useCasePages.map((page) => page.slug);

export const useCaseFooterLinks = useCasePages.map((page) => ({
  label: page.hero.eyebrow,
  href: `/use-cases/${page.slug}`,
}));
