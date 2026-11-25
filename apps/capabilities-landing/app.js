/* Hyperlocalise Capabilities Interactive Landing Page */

const HERO_WORKBENCH = {
  localisation: {
    summary: "CAT review, automated QA, local-first CLI, and CI checks.",
    tracks: [
      {
        id: "cat",
        title: "Content Editor and live preview",
        sub: "Edit segments with website preview, TM, and glossary hits",
        heading: "Review strings in full visual context",
        description:
          "Inspect source and target segments across desktop, tablet, and mobile previews, validate ICU placeholders and length limits, and export filtered slices to CSV, TMX, XLIFF, or XLSX.",
        visualType: "image",
        imageSrc: "./assets/visual-context.png",
        imageAlt: "Hyperlocalise Content Editor visual context preview",
        meta: [
          ["Setup", "Cloud Platform"],
          ["Formats", "JSON, YAML, ARB, XLIFF, PO, Office, Images"],
          ["Onboarding", "10 to 30 minutes"]
        ]
      },
      {
        id: "cli",
        title: "Local-first CLI and GitHub Actions",
        sub: "Translate, evaluate, check diffs, and sync TMS from git",
        heading: "Run localization checks directly in pull requests",
        description:
          "Install the MIT-licensed Go CLI with zero account required. Run drift detection, diff-scoped integrity checks, quality evals, or sync against six TMS adapters.",
        visualType: "terminal",
        code: [
          "$ curl -fsSL https://hyperlocalise.com/install | bash",
          "$ hyperlocalise check --diff-stdin --format json",
          "  Checked 18 changed keys in locales/fr-FR.json",
          "  Placeholders & ICU: 0 errors  |  Glossary: 0 forbidden terms",
          "$ hyperlocalise sync push --dry-run",
          "  Ready to upload 4 updated source files to Cloud"
        ],
        meta: [
          ["Setup", "Standalone CLI or Cloud Platform"],
          ["TMS adapters", "Crowdin, Lokalise, Phrase, Smartling, Lilt, POEditor"],
          ["Onboarding", "Under 5 minutes"]
        ]
      },
      {
        id: "mcp",
        title: "Hosted MCP server and automations",
        sub: "Connect Claude Code, Codex, Cursor, and visual workflows",
        heading: "Let coding and content agents use approved memory",
        description:
          "OAuth-protected MCP tools expose projects, CAT queues, glossaries, TM concordance, guidelines, jobs, and Board issues. Pair with scheduled, GitHub push, or visual canvas workflows.",
        visualType: "terminal",
        code: [
          "$ claude mcp add -t http hyperlocalise https://hyperlocalise.com/mcp",
          "  OAuth PKCE session scoped to your workspace role",
          "  Tools active: list_translations, query_glossary,",
          "                query_translation_memory, update_translation,",
          "                create_issue, run_workflow"
        ],
        meta: [
          ["Setup", "Cloud Platform"],
          ["Clients", "Claude Code, Codex, Cursor, custom MCP"],
          ["Onboarding", "5 minutes via OAuth"]
        ]
      }
    ]
  },
  business: {
    summary: "Canva and Figma design sync, Zernio ads, SEO domains, and compliance.",
    tracks: [
      {
        id: "design-ads",
        title: "Canva, Figma, and Zernio paid ads",
        sub: "Localize creative layouts and publish paused ad campaigns",
        heading: "Turn approved copy into regional campaigns fast",
        description:
          "Extract and sync localized copy back into Canva designs and Figma frames, then launch localized ads across Meta, Google, TikTok, LinkedIn, Pinterest, X, and OpenAI Ads via Zernio.",
        visualType: "image",
        imageSrc: "./assets/generated/business-markets.jpg",
        imageAlt: "Global campaign localisation and regional market readiness",
        meta: [
          ["Setup", "Cloud Platform + PAT / API key"],
          ["Channels", "Canva, Figma, Contentful, Webflow, Sanity, Zernio"],
          ["Onboarding", "15 minutes"]
        ]
      },
      {
        id: "seo-growth",
        title: "Linked Domains, SEO, and HyperLab",
        sub: "Keyword expansion, live SERPs, rank tracking, and A/B flags",
        heading: "Measure search demand and test localized experiences",
        description:
          "Verify hostnames via DNS or meta tag, research keywords and track live ranks with DataForSEO, connect Google Search Console and Ahrefs, and run OpenFeature experiments in HyperLab.",
        visualType: "terminal",
        code: [
          "Domain verified: acme.com (DNS TXT _hyperlocalise.acme.com)",
          "Markets active:  france-fr, germany-de, japan-ja, vietnam-vi",
          "SEO sources:     DataForSEO Labs + Google Search Console + Ahrefs",
          "HyperLab SDK:    OpenFeature OFREP provider active (3 experiments)"
        ],
        meta: [
          ["Setup", "Cloud Platform"],
          ["Integrations", "GSC, Ahrefs, Semrush, Similarweb, OpenFeature"],
          ["Onboarding", "30 minutes (DNS verify)"]
        ]
      },
      {
        id: "audit-compliance",
        title: "Localisation Audit and governance",
        sub: "Public readiness scoring, forbidden terms, and RBAC",
        heading: "Score any website and enforce brand compliance",
        description:
          "Crawl any domain with the public Localisation Audit for Lighthouse-style pass/fail reports, enforce legal guidelines and forbidden terms across every agent, and review workspace Activity Logs.",
        visualType: "terminal",
        code: [
          "Audit target:    https://example.com",
          "Hreflang & URL:  PASS (96/100)",
          "Locale coverage: NEEDS WORK (74/100)  2 untranslated routes",
          "Governance:      WorkOS SSO, RBAC, PATs, Activity Logs active"
        ],
        meta: [
          ["Setup", "Public Audit (Standalone) + Governance (Cloud)"],
          ["Teams", "Sales, Pre-Sales, Legal, Compliance, Leadership"],
          ["Onboarding", "Instant for Audit"]
        ]
      }
    ]
  }
};

const FUNCTIONS = [
  // Localisation team
  {
    team: "localisation",
    group: "CAT & Content",
    name: "Cloud Content Editor (CAT)",
    scope: "Platform",
    setupKey: "platform",
    detail:
      "Browser review workspace with Edit, Queue, and AI tabs, segment locking, exact-duplicate grouping, and live Desktop, Tablet, and Mobile website preview with string highlighting."
  },
  {
    team: "localisation",
    group: "CAT & Content",
    name: "Filtered queue export",
    scope: "Platform",
    setupKey: "platform",
    detail:
      "Export up to 5,000 filtered or searched segments directly from the CAT queue to CSV, TMX, XLF/XLIFF, or XLSX."
  },
  {
    team: "localisation",
    group: "CAT & Content",
    name: "Multi-format file & Office support",
    scope: "Standalone & Platform",
    setupKey: "standalone",
    detail:
      "Handles JSON/JSONC, YAML, ARB, XLIFF, PO, HTML, Liquid, Markdown/MDX, Apple .strings/.stringsdict, Android strings.xml, CSV, Office documents (Univer), and image variants."
  },
  {
    team: "localisation",
    group: "CAT & Content",
    name: "Crowdin App Inbox",
    scope: "Platform",
    setupKey: "platform",
    detail:
      "Embedded Hyperlocalise inbox and agent workflow running directly inside Crowdin projects."
  },
  {
    team: "localisation",
    group: "Linguistic QA",
    name: "Glossaries and forbidden terms",
    scope: "Platform",
    setupKey: "platform",
    detail:
      "Concept-linked native glossaries with forbidden-term enforcement and TBX, CSV, and XLSX import/export, plus read-only sync of external TMS term bases."
  },
  {
    team: "localisation",
    group: "Linguistic QA",
    name: "Translation Memories (TM)",
    scope: "Platform",
    setupKey: "platform",
    detail:
      "Workspace and external TMS memories with CSV and TMX import/export and exact plus lexical concordance matching."
  },
  {
    team: "localisation",
    group: "Linguistic QA",
    name: "Guidelines (Memory.md) & Spellcheck",
    scope: "Platform",
    setupKey: "platform",
    detail:
      "Org- and project-scoped style guides read by CAT and agents, paired with custom Hunspell spellcheck dictionaries powered by go-svc."
  },
  {
    team: "localisation",
    group: "Linguistic QA",
    name: "Automated QA scans & Board issues",
    scope: "Platform",
    setupKey: "platform",
    detail:
      "Placeholder, ICU, length, and spelling checks with scheduled scans, one-click promotion of findings to Linear-style Board issues (HL-*), custom columns, comments, and CSV import."
  },
  {
    team: "localisation",
    group: "CLI & CI/CD",
    name: "Local-first Go CLI (hyperlocalise)",
    scope: "Standalone & Platform",
    setupKey: "standalone",
    detail:
      "MIT-licensed binary supporting init, run, eval (quality TUI), check (--diff-stdin), fix, extract, pack, entries, status, sync push/pull, and native Crowdin, Lokalise, Phrase, and Smartling commands."
  },
  {
    team: "localisation",
    group: "CLI & CI/CD",
    name: "GitHub Actions (drift & check)",
    scope: "Standalone & Platform",
    setupKey: "standalone",
    detail:
      "Composite CI actions for dry-run drift detection and PR diff-scoped integrity checks with inline GitHub annotations and JSON/text report artifacts."
  },
  {
    team: "localisation",
    group: "CLI & CI/CD",
    name: "Hosted MCP Server (/mcp) & REST API",
    scope: "Platform",
    setupKey: "platform",
    detail:
      "OAuth PKCE MCP server for Claude Code, Codex, and Cursor plus /api/v1 REST endpoints for source uploads, string/file jobs, status polling, and reconstructed downloads."
  },
  {
    team: "localisation",
    group: "CLI & CI/CD",
    name: "OTA Delivery & Multi-LLM AI Engine",
    scope: "Standalone & Platform",
    setupKey: "standalone",
    detail:
      "Over-the-air hashed translation bundles and configurable model routing across 11 LLM providers including OpenAI, Anthropic, Gemini, Azure OpenAI, Bedrock, Groq, Mistral, OpenRouter, Ollama, LM Studio, and Vercel AI Gateway."
  },
  {
    team: "localisation",
    group: "Automations",
    name: "Agent Automations & Content Sync",
    scope: "Platform",
    setupKey: "platform",
    detail:
      "Event-driven playbooks triggered manually, on schedule, on GitHub push/PR, on source upload, or on Contentful webhook, plus automated repository Content Sync."
  },
  {
    team: "localisation",
    group: "Automations",
    name: "Visual Workflows & Native macOS App",
    scope: "Platform",
    setupKey: "platform",
    detail:
      "Deterministic node canvas (HTTP, AI, Slack, email, branching, loops, mock/live test, versioned publish), web/Slack Inbox chat, and a native macOS SwiftUI client."
  },

  // Business team
  {
    team: "business",
    group: "Marketing",
    name: "Canva App & Figma Plugin",
    scope: "Platform",
    setupKey: "platform",
    detail:
      "Extract text from Canva designs or Figma selections and pages, run translation jobs against workspace glossaries, and sync localized layouts straight back into design files."
  },
  {
    team: "business",
    group: "Marketing",
    name: "CMS & Web Publishing Connectors",
    scope: "Platform",
    setupKey: "platform",
    detail:
      "Connect Contentful (including live entry webhook triggers), Webflow, and Sanity to localize landing pages and editorial content."
  },
  {
    team: "business",
    group: "Marketing",
    name: "Paid Ads Delivery via Zernio",
    scope: "Platform",
    setupKey: "platform",
    detail:
      "Create campaigns, ad sets, and localized ads (defaulting to PAUSED) across Meta, Google, TikTok, LinkedIn, Pinterest, X, and OpenAI Ads via automations or MCP."
  },
  {
    team: "business",
    group: "Marketing",
    name: "Image & Video Asset Localisation",
    scope: "Platform",
    setupKey: "platform",
    detail:
      "Extract text from campaign visuals and generate localized image and video variants alongside ready-made marketing automation templates."
  },
  {
    team: "business",
    group: "Marketing",
    name: "Customer Engagement & Email",
    scope: "Platform",
    setupKey: "platform",
    detail:
      "Connect Intercom, HubSpot, Mailchimp, SendGrid, and Resend through WorkOS Pipes to localize lifecycle emails and support content."
  },
  {
    team: "business",
    group: "Growth & SEO",
    name: "Linked Domains & Market Research",
    scope: "Platform",
    setupKey: "platform",
    detail:
      "Verify hostname ownership (DNS TXT, HTML file, meta tag), expand seed keywords, inspect live SERPs, and track keyword rankings via DataForSEO across active markets."
  },
  {
    team: "business",
    group: "Growth & SEO",
    name: "Google Search Console & SEO Tools",
    scope: "Platform",
    setupKey: "platform",
    detail:
      "Surface Google Search Console performance inside Domains and connect Ahrefs (WorkOS Pipes MCP), Semrush (outbound MCP), and Similarweb."
  },
  {
    team: "business",
    group: "Growth & SEO",
    name: "HyperLab Experimentation & Flags",
    scope: "Platform",
    setupKey: "platform",
    detail:
      "Run localized A/B experiments, audience targeting, and feature flags served over standard OpenFeature (OFREP) SDKs."
  },
  {
    team: "business",
    group: "Compliance",
    name: "Brand & Legal Compliance Guardrails",
    scope: "Platform",
    setupKey: "platform",
    detail:
      "Org-wide compliance Guidelines and enforced Glossary forbidden terms automatically constrain CAT reviews, automations, and coding agents."
  },
  {
    team: "business",
    group: "Compliance",
    name: "Activity Logs, RBAC & WorkOS SSO",
    scope: "Platform",
    setupKey: "platform",
    detail:
      "Workspace audit trails, role-based access control, team-scoped project permissions, user-scoped Personal Access Tokens, and encrypted org credentials."
  },
  {
    team: "business",
    group: "Sales",
    name: "Public Localisation Audit",
    scope: "Standalone & Platform",
    setupKey: "standalone",
    detail:
      "Self-serve website crawler (/localisation-audit) that scores any domain's international readiness with Lighthouse-style pass/fail criteria and shareable reports."
  },
  {
    team: "business",
    group: "Sales",
    name: "Public Agent Chat, Slack Connect & Budgets",
    scope: "Platform",
    setupKey: "platform",
    detail:
      "Shareable web chat endpoints for cross-team requests, Slack Connect shared client channels, and executive reporting across locale coverage, word counts, and AI spend."
  }
];

const COMPARISONS = {
  teams: {
    headers: ["Dimension", "Localisation team", "Business team (Marketing, Growth, Compliance, Sales)"],
    rows: [
      {
        dim: "Speed to onboarding",
        colA: {
          lead: "Fast for CLI or TMS sync; moderate for full governance",
          text: "Under 5 minutes to install the CLI and run local checks. 10 to 30 minutes to connect Cloud CAT or an existing TMS, and a few hours to import TMX/TBX archives and tune QA rules."
        },
        colB: {
          lead: "Instant for audit and design plugins; moderate for SEO/flags",
          text: "Immediate access to the public Localisation Audit, Canva/Figma plugins, and Pipes API keys. DNS verification for Linked Domains or OpenFeature setup for HyperLab takes 30 to 60 minutes."
        }
      },
      {
        dim: "Standalone vs platform setup",
        colA: {
          lead: "Both standalone and Cloud supported",
          text: "Run completely standalone with the MIT-licensed CLI, GitHub Actions, and your own LLM/TMS keys, or step up to Hyperlocalise Cloud for CAT, QA scans, Board, MCP, and automations."
        },
        colB: {
          lead: "Primarily Cloud Platform",
          text: "Only the public Localisation Audit runs standalone without an account. Canva, Figma, Zernio ads, Domains, HyperLab, CMS/CRM connectors, and compliance governance require a Cloud workspace."
        }
      },
      {
        dim: "Range of integrations",
        colA: {
          lead: "Deep engineering, TMS, and agent stack",
          text: "GitHub, GitLab, Crowdin, Lokalise, Phrase, Smartling, Lilt (CLI), POEditor (CLI), Slack, Atlassian, 11 LLM providers, inbound MCP (Claude Code, Codex, Cursor), and custom outbound MCP."
        },
        colB: {
          lead: "Broad GTM, creative, and SEO stack",
          text: "Canva, Figma, Contentful, Webflow, Sanity, Intercom, HubSpot, Mailchimp, SendGrid, Resend, Zernio (7 ad networks), Ahrefs, Semrush, Similarweb, Google Search Console, DataForSEO, Notion, OpenFeature, and Slack Connect."
        }
      }
    ]
  },
  setup: {
    headers: ["Dimension", "Standalone (CLI, GitHub Action, Public Audit)", "Full Platform (Hyperlocalise Cloud)"],
    rows: [
      {
        dim: "Speed to onboarding",
        colA: {
          lead: "Under 5 minutes with zero account required",
          text: "Install the binary via curl, add i18n.yml and an LLM or TMS API key, and run local generation, evals, or PR checks immediately."
        },
        colB: {
          lead: "10 to 30 minutes to launch; 1 to 2 days full rollout",
          text: "Sign in with WorkOS SSO, create a project, upload files or connect GitHub/TMS, then roll out RBAC, glossaries, design plugins, and marketing automations across teams."
        }
      },
      {
        dim: "Included capabilities",
        colA: {
          lead: "Local-first generation, CI checks, and public audit",
          text: "Includes the full Go CLI (run, eval, check, fix, extract, status, TMS sync), GitHub Actions (drift, check), and the public /localisation-audit crawler."
        },
        colB: {
          lead: "Complete multilingual operating system",
          text: "Everything in Standalone plus Cloud CAT with visual preview, automated QA, Board, Glossaries, TM, Guidelines, Agent Automations, Visual Workflows, Domains/SEO, HyperLab, Canva/Figma, Mac app, MCP, and Reporting."
        }
      },
      {
        dim: "Range of integrations",
        colA: {
          lead: "11 LLM providers + 6 TMS adapters + GitHub Actions",
          text: "Direct CLI connections to OpenAI, Anthropic, Gemini, Bedrock, Azure, Groq, Mistral, OpenRouter, Ollama, LM Studio, Vercel AI Gateway, and Crowdin, Lokalise, Phrase, Smartling, Lilt, POEditor."
        },
        colB: {
          lead: "All standalone adapters plus 20+ live workspace connectors",
          text: "Adds GitHub App, GitLab OAuth, Canva, Figma, Contentful, Webflow, Sanity, Intercom, HubSpot, Mailchimp, SendGrid, Resend, Zernio, Ahrefs, Semrush, Similarweb, GSC, DataForSEO, Slack, Atlassian, Notion, and MCP."
        }
      }
    ]
  }
};

const PLANNER_PLANS = {
  "localisation:standalone": {
    title: "Localisation team on Standalone CLI",
    eta: "Under 5 minutes",
    steps: [
      "Install the MIT-licensed Go binary locally or in GitHub Actions.",
      "Initialize i18n.yml pointing to your JSON, YAML, ARB, XLIFF, or mobile resource files.",
      "Export your preferred LLM or existing TMS key and run hyperlocalise run or check."
    ],
    code: [
      "$ curl -fsSL https://hyperlocalise.com/install | bash",
      "$ hyperlocalise init",
      "$ hyperlocalise run --dry-run",
      "$ hyperlocalise check --diff-stdin"
    ],
    note: "No Hyperlocalise Cloud account or database required. Upgrade to Cloud sync anytime by adding a project_id."
  },
  "localisation:platform": {
    title: "Localisation team on Cloud Platform",
    eta: "15 to 30 minutes",
    steps: [
      "Sign in to Hyperlocalise Cloud, create a project, and select source and target locales.",
      "Connect GitHub or an existing TMS (Crowdin, Lokalise, Phrase, Smartling), or push files via CLI.",
      "Import TMX/TBX glossaries, attach Guidelines, and enable scheduled QA scans or MCP for coding agents."
    ],
    code: [
      "$ export HYPERLOCALISE_API_KEY=hl_org_...",
      "$ hyperlocalise sync push",
      "$ claude mcp add -t http hyperlocalise https://hyperlocalise.com/mcp"
    ],
    note: "Adds browser CAT with live website preview, Board issue tracking, Visual Workflows, and RBAC."
  },
  "marketing:standalone": {
    title: "Marketing team on Standalone setup",
    eta: "Cloud workspace required",
    steps: [
      "Run the public Localisation Audit on your marketing domain immediately with no login.",
      "For Canva, Figma, Contentful, Webflow, Sanity, or Zernio ads, create a Cloud workspace.",
      "Reuse one shared glossary so product and campaign terminology stay aligned."
    ],
    code: [
      "Public tool: https://www.hyperlocalise.com/localisation-audit",
      "Next step:   Create Cloud workspace -> Integrations -> Canva / Contentful / Zernio"
    ],
    note: "Marketing creative and ad connectors rely on Cloud job orchestration and encrypted org credentials."
  },
  "marketing:platform": {
    title: "Marketing team on Cloud Platform",
    eta: "15 to 25 minutes",
    steps: [
      "Create a Personal Access Token and link the Canva App or Figma Plugin to your project.",
      "Connect Contentful, Webflow, or Sanity plus email tools (Intercom, HubSpot, Resend) under Integrations.",
      "Add your Zernio API key to generate paused regional ad campaigns directly from approved copy."
    ],
    code: [
      "1. Settings -> Personal access tokens -> create token (files + jobs)",
      "2. Integrations -> Canva / Contentful / Zernio -> save connection",
      "3. Automations -> pick template 'hyperlocalise-campaign-assets'"
    ],
    note: "New Zernio ads default to PAUSED so marketing leads review every regional campaign before spend."
  },
  "growth:standalone": {
    title: "Growth and SEO on Standalone setup",
    eta: "Instant audit; Cloud for tracking",
    steps: [
      "Benchmark any international domain right away using the public Localisation Audit.",
      "Move to Hyperlocalise Cloud to unlock verified Domains, live SERPs, rank history, and HyperLab flags."
    ],
    code: [
      "Public audit: https://www.hyperlocalise.com/localisation-audit",
      "Cloud unlock: Domains (DataForSEO + GSC) & HyperLab (OpenFeature)"
    ],
    note: "Standalone CLI focuses on repository translation; ongoing SEO tracking and A/B experiments live in Cloud."
  },
  "growth:platform": {
    title: "Growth and SEO on Cloud Platform",
    eta: "30 to 45 minutes",
    steps: [
      "Link your hostname in Domains and verify ownership via DNS TXT, HTML file, or meta tag.",
      "Connect Google Search Console, Ahrefs (Pipes), and Semrush (outbound MCP) to expand market keywords.",
      "Point your app's OpenFeature SDK at HyperLab OFREP to test localized variants by audience."
    ],
    code: [
      "OpenFeature.setProvider(new OFREPProvider({",
      "  baseUrl: 'https://hyperlocalise.com/api/go-svc',",
      "  headers: [['X-API-Key', 'hlk_...']]",
      "}));"
    ],
    note: "Live Domains research currently covers France (fr), Germany (de), Japan (ja), and Vietnam (vi)."
  },
  "compliance:standalone": {
    title: "Compliance and Sales on Standalone setup",
    eta: "2 minutes for Audit / CI checks",
    steps: [
      "Share public Localisation Audit reports during pre-sales or international readiness reviews.",
      "Enforce deterministic placeholder and glossary checks in pull requests via GitHub Actions."
    ],
    code: [
      "Pre-sales: https://www.hyperlocalise.com/localisation-audit",
      "CI check:  uses: hyperlocalise/hyperlocalise@v1 (check: check)"
    ],
    note: "Workspace Activity Logs, WorkOS SSO, RBAC, and org-wide forbidden terms require Cloud Platform."
  },
  "compliance:platform": {
    title: "Compliance and Sales on Cloud Platform",
    eta: "20 to 40 minutes",
    steps: [
      "Configure WorkOS AuthKit SSO, team roles, and project-scoped permissions under Members.",
      "Publish org-wide legal Guidelines and forbidden glossary terms enforced across CAT and all agents.",
      "Enable Slack Connect client channels, public shareable agent chat, and monitor Activity Logs and budgets."
    ],
    code: [
      "Governance: Members -> RBAC + WorkOS SSO",
      "Guardrails: Guidelines (Memory.md) + Glossary forbidden terms",
      "Oversight:  Settings -> Activity Logs & Reports -> AI Budgets"
    ],
    note: "Every MCP session and Personal Access Token inherits live org membership and revokes immediately on removal."
  }
};

const INTEGRATIONS = [
  { name: "GitHub", cat: "loc", role: "App, PR reviews, push triggers, Content Sync, Actions", mode: "Standalone & Platform", icon: "./assets/integrations/github-logo.svg" },
  { name: "GitLab", cat: "loc", role: "OAuth repo cloning in chat and scheduled automations", mode: "Platform (WorkOS Pipes)", monogram: "GL" },
  { name: "Crowdin", cat: "loc", role: "TMS sync, CAT bridge, and embedded Crowdin App Inbox", mode: "Standalone & Platform", icon: "./assets/tms/crowdin.png" },
  { name: "Lokalise", cat: "loc", role: "TMS storage adapter and project sync", mode: "Standalone & Platform", icon: "./assets/tms/lokalise.webp" },
  { name: "Phrase", cat: "loc", role: "TMS file workflows and project sync", mode: "Standalone & Platform", icon: "./assets/tms/phrase.png" },
  { name: "Smartling", cat: "loc", role: "Enterprise TMS sync and glossary commands", mode: "Standalone & Platform", icon: "./assets/tms/smartling.png" },
  { name: "Lilt & POEditor", cat: "loc", role: "CLI storage adapters for pull and push sync", mode: "Standalone CLI", icon: "./assets/tms/poeditor.png" },
  { name: "Slack & Slack Connect", cat: "loc", role: "Workspace bot, alerts, and shared client channels", mode: "Platform", icon: "./assets/integrations/slack-logo.svg" },
  { name: "Atlassian", cat: "loc", role: "Collaboration connector via WorkOS Pipes", mode: "Platform", monogram: "AT" },
  { name: "MCP (Inbound & Outbound)", cat: "loc", role: "Hosted /mcp for Claude, Codex, Cursor + remote MCP servers", mode: "Platform", monogram: "MCP" },

  { name: "Canva", cat: "biz", role: "Dedicated Canva App to translate and sync design pages", mode: "Platform", icon: "./assets/integrations/canva-logo.svg" },
  { name: "Figma", cat: "biz", role: "Design plugin to extract text, run jobs, and pull locales", mode: "Platform", monogram: "Fg" },
  { name: "Contentful", cat: "biz", role: "CMS connector and entry create/update webhook triggers", mode: "Platform", icon: "./assets/integrations/contentful-logo.svg" },
  { name: "Webflow & Sanity", cat: "biz", role: "CMS and web publishing connectors via WorkOS Pipes", mode: "Platform", monogram: "CMS" },
  { name: "Zernio Ads", cat: "biz", role: "Localized paid ads on Meta, Google, TikTok, LinkedIn, X, OpenAI", mode: "Platform", icon: "./assets/integrations/zernio-logo.svg" },
  { name: "Intercom & HubSpot", cat: "biz", role: "Customer engagement and support content connectors", mode: "Platform", icon: "./assets/integrations/intercom-logo.svg" },
  { name: "Mailchimp, SendGrid, Resend", cat: "biz", role: "Localized lifecycle and transactional email delivery", mode: "Platform", icon: "./assets/integrations/sendgrid-logo.svg" },
  { name: "Ahrefs", cat: "biz", role: "SEO MCP automation tool via WorkOS Pipes", mode: "Platform", icon: "./assets/integrations/ahrefs-logo.svg" },
  { name: "Semrush", cat: "biz", role: "SEO automation tool via outbound MCP server", mode: "Platform", icon: "./assets/integrations/semrush-logo.svg" },
  { name: "Similarweb & GSC", cat: "biz", role: "Market intelligence and Google Search Console performance", mode: "Platform", monogram: "SEO" },
  { name: "DataForSEO & OpenFeature", cat: "biz", role: "Live SERP/rank research and HyperLab experimentation", mode: "Platform", monogram: "OF" },
  { name: "Notion", cat: "biz", role: "Style guide and guideline connector via WorkOS Pipes", mode: "Platform", monogram: "N" },

  { name: "OpenAI & Azure OpenAI", cat: "ai", role: "Direct LLM provider for CLI and Cloud AI Engine", mode: "Standalone & Platform", icon: "./assets/integrations/openai-old-logo.webp" },
  { name: "Anthropic Claude", cat: "ai", role: "LLM translation and review provider", mode: "Standalone & Platform", icon: "./assets/integrations/claude.png" },
  { name: "Google Gemini", cat: "ai", role: "Multimodal text, image, and video localisation provider", mode: "Standalone & Platform", icon: "./assets/integrations/gemini.webp" },
  { name: "Groq", cat: "ai", role: "Low-latency LLM inference for fast batch runs", mode: "Standalone & Platform", icon: "./assets/integrations/groq.webp" },
  { name: "Mistral", cat: "ai", role: "European LLM provider for CLI and Cloud AI Engine", mode: "Standalone & Platform", icon: "./assets/integrations/mistral.jpg" },
  { name: "Bedrock, OpenRouter, Local", cat: "ai", role: "AWS Bedrock, OpenRouter, Vercel AI Gateway, Ollama, LM Studio", mode: "Standalone & Platform", monogram: "AI" }
];

// State
let heroTeam = "localisation";
let heroTrackId = "cat";
let filterTeam = "all";
let filterSubteam = "all";
let filterSetup = "all";
let filterQuery = "";
let compareMode = "teams";
let plannerTeam = "localisation";
let plannerSetup = "standalone";
let integrationCat = "all";

function initHeaderScroll() {
  const header = document.getElementById("siteHeader");
  const update = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 12);
  };
  update();
  window.addEventListener("scroll", update, { passive: true });
}

function initThemeToggle() {
  const root = document.documentElement;
  const toggle = document.getElementById("themeToggle");
  const saved = window.localStorage.getItem("hl-theme");
  if (saved === "dark" || saved === "light") {
    root.setAttribute("data-theme", saved);
    toggle.setAttribute("aria-pressed", String(saved === "dark"));
  }
  toggle.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    toggle.setAttribute("aria-pressed", String(next === "dark"));
    window.localStorage.setItem("hl-theme", next);
  });
}

function renderHeroWorkbench() {
  const data = HERO_WORKBENCH[heroTeam];
  const summaryEl = document.getElementById("heroWorkbenchSummary");
  const listEl = document.getElementById("heroTrackList");
  const previewEl = document.getElementById("heroPreviewPane");

  summaryEl.textContent = data.summary;
  if (!data.tracks.some((t) => t.id === heroTrackId)) {
    heroTrackId = data.tracks[0].id;
  }

  listEl.innerHTML = data.tracks
    .map(
      (track) => `
      <button
        type="button"
        role="option"
        aria-selected="${track.id === heroTrackId}"
        class="track-row ${track.id === heroTrackId ? "is-active" : ""}"
        data-track-id="${track.id}"
      >
        <span class="track-title">${track.title}</span>
        <span class="track-sub">${track.sub}</span>
      </button>
    `
    )
    .join("");

  const active = data.tracks.find((t) => t.id === heroTrackId) || data.tracks[0];

  const visualHtml =
    active.visualType === "image"
      ? `<div class="preview-visual"><img src="${active.imageSrc}" alt="${active.imageAlt}" /></div>`
      : `<pre class="preview-terminal">${active.code
          .map((line) => {
            if (line.startsWith("$")) {
              return `<span class="t-prompt">$</span>${line.slice(1)}`;
            }
            if (line.startsWith("  ")) {
              return `<span class="t-muted">${line}</span>`;
            }
            return line;
          })
          .join("\n")}</pre>`;

  const metaHtml = active.meta
    .map(([label, value]) => `<span><strong>${label}:</strong> ${value}</span>`)
    .join("");

  previewEl.innerHTML = `
    <div class="preview-header">
      <h3>${active.heading}</h3>
      <p>${active.description}</p>
    </div>
    ${visualHtml}
    <div class="preview-meta-row">${metaHtml}</div>
  `;
}

function initHeroWorkbench() {
  const tabs = document.getElementById("heroTeamTabs");
  const list = document.getElementById("heroTrackList");

  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-hero-team]");
    if (!btn) return;
    heroTeam = btn.dataset.heroTeam;
    tabs.querySelectorAll(".segmented-item").forEach((el) => {
      const active = el === btn;
      el.classList.toggle("is-active", active);
      el.setAttribute("aria-selected", String(active));
    });
    renderHeroWorkbench();
  });

  list.addEventListener("click", (e) => {
    const row = e.target.closest("[data-track-id]");
    if (!row) return;
    heroTrackId = row.dataset.trackId;
    renderHeroWorkbench();
  });

  renderHeroWorkbench();
}

function renderFunctions() {
  const grid = document.getElementById("functionGrid");
  const meta = document.getElementById("resultsMeta");
  const q = filterQuery.trim().toLowerCase();

  const matches = FUNCTIONS.filter((item) => {
    if (filterTeam !== "all" && item.team !== filterTeam) return false;
    if (filterSubteam !== "all" && item.group !== filterSubteam) return false;
    if (filterSetup === "standalone" && item.setupKey !== "standalone") return false;
    if (filterSetup === "platform" && item.setupKey !== "platform") return false;
    if (q) {
      const hay = `${item.name} ${item.group} ${item.detail} ${item.scope}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  meta.textContent = `Showing ${matches.length} of ${FUNCTIONS.length} currently available functions. Select any item to expand details.`;

  const pillars = [];
  if (filterTeam === "all" || filterTeam === "localisation") {
    pillars.push({
      key: "localisation",
      title: "For localisation team",
      desc: "Localisation managers, linguists, translators, and localisation engineers."
    });
  }
  if (filterTeam === "all" || filterTeam === "business") {
    pillars.push({
      key: "business",
      title: "For business team",
      desc: "Marketing, compliance, growth, international SEO, sales, and leadership."
    });
  }

  grid.classList.toggle("is-single", pillars.length === 1);

  if (matches.length === 0) {
    grid.innerHTML = `<p class="section-lead">No functions match your current filter. Clear search or switch groups to view all capabilities.</p>`;
    return;
  }

  grid.innerHTML = pillars
    .map((pillar) => {
      const items = matches.filter((m) => m.team === pillar.key);
      if (items.length === 0) return "";

      const groups = [...new Set(items.map((i) => i.group))];
      const groupsHtml = groups
        .map((groupName) => {
          const groupItems = items.filter((i) => i.group === groupName);
          return `
            <div class="function-group">
              <h3 class="group-title">${groupName}</h3>
              <ul class="function-list">
                ${groupItems
                  .map(
                    (fn) => `
                  <li class="function-item">
                    <details>
                      <summary class="function-summary">
                        <span class="function-name">${fn.name}</span>
                        <span class="function-scope">${fn.scope}</span>
                      </summary>
                      <div class="function-detail">
                        <p>${fn.detail}</p>
                      </div>
                    </details>
                  </li>
                `
                  )
                  .join("")}
              </ul>
            </div>
          `;
        })
        .join("");

      return `
        <div class="pillar-col">
          <p class="pillar-heading">${pillar.title}</p>
          <p class="pillar-desc">${pillar.desc}</p>
          ${groupsHtml}
        </div>
      `;
    })
    .join("");
}

function initFunctionExplorer() {
  const tabs = document.getElementById("teamFilterTabs");
  const subteam = document.getElementById("subteamSelect");
  const setup = document.getElementById("setupSelect");
  const search = document.getElementById("functionSearch");

  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-team]");
    if (!btn) return;
    filterTeam = btn.dataset.team;
    tabs.querySelectorAll(".segmented-item").forEach((el) => {
      const active = el === btn;
      el.classList.toggle("is-active", active);
      el.setAttribute("aria-selected", String(active));
    });
    renderFunctions();
  });

  subteam.addEventListener("change", () => {
    filterSubteam = subteam.value;
    renderFunctions();
  });

  setup.addEventListener("change", () => {
    filterSetup = setup.value;
    renderFunctions();
  });

  search.addEventListener("input", () => {
    filterQuery = search.value;
    renderFunctions();
  });

  renderFunctions();
}

function renderComparison() {
  const container = document.getElementById("comparisonContainer");
  const data = COMPARISONS[compareMode];

  container.innerHTML = `
    <table class="compare-table">
      <thead>
        <tr>
          ${data.headers.map((h) => `<th scope="col">${h}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${data.rows
          .map(
            (row) => `
          <tr>
            <th scope="row">${row.dim}</th>
            <td>
              <span class="compare-highlight">${row.colA.lead}</span>
              ${row.colA.text}
            </td>
            <td>
              <span class="compare-highlight">${row.colB.lead}</span>
              ${row.colB.text}
            </td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function initComparison() {
  const tabs = document.getElementById("compareModeTabs");
  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-compare]");
    if (!btn) return;
    compareMode = btn.dataset.compare;
    tabs.querySelectorAll(".segmented-item").forEach((el) => {
      const active = el === btn;
      el.classList.toggle("is-active", active);
      el.setAttribute("aria-selected", String(active));
    });
    renderComparison();
  });
  renderComparison();
}

function renderPlanner() {
  const out = document.getElementById("plannerOutput");
  const key = `${plannerTeam}:${plannerSetup}`;
  const plan = PLANNER_PLANS[key];

  out.innerHTML = `
    <div class="planner-header">
      <h3>${plan.title}</h3>
      <span class="planner-eta">Onboarding: ${plan.eta}</span>
    </div>
    <ol class="planner-steps">
      ${plan.steps.map((s) => `<li>${s}</li>`).join("")}
    </ol>
    <pre class="preview-terminal">${plan.code.join("\n")}</pre>
    <p class="planner-note">${plan.note}</p>
  `;
}

function initPlanner() {
  const radios = document.getElementById("plannerTeamRadios");
  const tabs = document.getElementById("plannerSetupTabs");

  radios.addEventListener("change", (e) => {
    if (e.target.name === "plannerTeam") {
      plannerTeam = e.target.value;
      renderPlanner();
    }
  });

  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-planner-setup]");
    if (!btn) return;
    plannerSetup = btn.dataset.plannerSetup;
    tabs.querySelectorAll(".segmented-item").forEach((el) => {
      const active = el === btn;
      el.classList.toggle("is-active", active);
      el.setAttribute("aria-selected", String(active));
    });
    renderPlanner();
  });

  renderPlanner();
}

function renderIntegrations() {
  const grid = document.getElementById("integrationsGrid");
  const list =
    integrationCat === "all"
      ? INTEGRATIONS
      : INTEGRATIONS.filter((i) => i.cat === integrationCat);

  grid.innerHTML = list
    .map((item) => {
      const visual = item.icon
        ? `<img src="${item.icon}" alt="" class="integration-icon" loading="lazy" />`
        : `<span class="integration-monogram" aria-hidden="true">${item.monogram}</span>`;
      return `
        <article class="integration-cell">
          <div class="integration-top">
            ${visual}
            <span class="integration-name">${item.name}</span>
          </div>
          <p class="integration-role">${item.role}</p>
          <p class="integration-meta">${item.mode}</p>
        </article>
      `;
    })
    .join("");
}

function initIntegrations() {
  const tabs = document.getElementById("integrationTabs");
  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-int-cat]");
    if (!btn) return;
    integrationCat = btn.dataset.intCat;
    tabs.querySelectorAll(".segmented-item").forEach((el) => {
      const active = el === btn;
      el.classList.toggle("is-active", active);
      el.setAttribute("aria-selected", String(active));
    });
    renderIntegrations();
  });
  renderIntegrations();
}

document.addEventListener("DOMContentLoaded", () => {
  initHeaderScroll();
  initThemeToggle();
  initHeroWorkbench();
  initFunctionExplorer();
  initComparison();
  initPlanner();
  initIntegrations();
});
