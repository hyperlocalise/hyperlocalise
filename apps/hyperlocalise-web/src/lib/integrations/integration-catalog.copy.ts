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
import type { IntegrationCopyDescriptors } from "@/lib/integrations/integration-catalog.types";

export const integrationCatalogCopy = {
  github: {
    name: {
      defaultMessage: "GitHub",
      id: "intGitHubName",
      description: "GitHub integration name",
    },
    tagline: {
      defaultMessage:
        "Connect GitHub so Hyperlocalise can inspect localized strings, review merge requests, and open localization fixes.",
      id: "intGitHubTagline",
      description: "GitHub integration short description",
    },
    overview: [
      {
        defaultMessage:
          "Connect GitHub so Hyperlocalise can inspect localized strings in your repositories, review merge requests, and open localization fixes without leaving your workflow.",
        id: "intGitHubOverview0",
        description: "GitHub integration marketing overview paragraph",
      },
      {
        defaultMessage:
          "Agents can trace product context from code, propose translation updates, and keep launch work tied to the branches your team already ships from.",
        id: "intGitHubOverview1",
        description: "GitHub integration marketing overview paragraph",
      },
    ],
    productName: {
      defaultMessage: "GitHub",
      id: "intGitHubProductName",
      description: "GitHub integration product name on marketing detail page",
    },
    productDescription: {
      defaultMessage:
        "Repository sync, localization-aware reviews, and agent-driven fix proposals.",
      id: "intGitHubProductDescription",
      description: "GitHub integration product description on marketing detail page",
    },
    metadataTitle: {
      defaultMessage: "GitHub integration | Hyperlocalise",
      id: "intGitHubMetaTitle",
      description: "GitHub integration marketing page meta title",
    },
    metadataDescription: {
      defaultMessage:
        "Connect GitHub to Hyperlocalise for localization-aware code review, string inspection, and agent-driven fixes.",
      id: "intGitHubMetaDescription",
      description: "GitHub integration marketing page meta description",
    },
  },
  gitlab: {
    name: {
      defaultMessage: "GitLab",
      id: "ufjLSLmtEV",
      description: "GitLab integration name on the integrations page",
    },
    tagline: {
      defaultMessage:
        "Connect GitLab so Hyperlocalise can inspect localized strings, review merge requests, and open localization fixes.",
      id: "ezhaX1jR0b",
      description: "GitLab integration description on the integrations page",
    },
    overview: [
      {
        defaultMessage:
          "GitLab support lets Hyperlocalise inspect localized strings, review merge requests, and open localization fixes from GitLab repositories.",
        id: "intGitLabOverview0",
        description: "GitLab integration marketing overview paragraph",
      },
      {
        defaultMessage:
          "This connector is on the roadmap for teams that run localization workflows on GitLab instead of GitHub.",
        id: "intGitLabOverview1",
        description: "GitLab integration marketing overview paragraph",
      },
    ],
    productName: {
      defaultMessage: "GitLab",
      id: "intGitLabProductName",
      description: "GitLab integration product name on marketing detail page",
    },
    productDescription: {
      defaultMessage: "Repository sync and localization-aware reviews for GitLab projects.",
      id: "intGitLabProductDescription",
      description: "GitLab integration product description on marketing detail page",
    },
    metadataTitle: {
      defaultMessage: "GitLab integration | Hyperlocalise",
      id: "intGitLabMetaTitle",
      description: "GitLab integration marketing page meta title",
    },
    metadataDescription: {
      defaultMessage:
        "Connect GitLab to Hyperlocalise for localization-aware reviews and agent-driven translation workflows.",
      id: "intGitLabMetaDescription",
      description: "GitLab integration marketing page meta description",
    },
  },
  slack: {
    name: {
      defaultMessage: "Slack",
      id: "intSlackName",
      description: "Slack integration name",
    },
    tagline: {
      defaultMessage: "Coordinate localization reviews from Slack channels and threads.",
      id: "intSlackTagline",
      description: "Slack integration short description",
    },
    overview: [
      {
        defaultMessage:
          "Connect Slack so reviewers can respond to localization work where your team already collaborates.",
        id: "intSlackOverview0",
        description: "Slack integration marketing overview paragraph",
      },
      {
        defaultMessage:
          "Hyperlocalise can route review requests, status updates, and launch blockers into the channels that own the work.",
        id: "intSlackOverview1",
        description: "Slack integration marketing overview paragraph",
      },
    ],
    productName: {
      defaultMessage: "Slack",
      id: "intSlackProductName",
      description: "Slack integration product name on marketing detail page",
    },
    productDescription: {
      defaultMessage: "Review notifications, thread-based coordination, and workspace alerts.",
      id: "intSlackProductDescription",
      description: "Slack integration product description on marketing detail page",
    },
    metadataTitle: {
      defaultMessage: "Slack integration | Hyperlocalise",
      id: "intSlackMetaTitle",
      description: "Slack integration marketing page meta title",
    },
    metadataDescription: {
      defaultMessage:
        "Connect Slack to Hyperlocalise for localization review notifications and team coordination.",
      id: "intSlackMetaDescription",
      description: "Slack integration marketing page meta description",
    },
  },
  crowdin: {
    name: {
      defaultMessage: "Crowdin",
      id: "b1aqjjuIqX",
      description: "Crowdin TMS integration name on the integrations page",
    },
    tagline: {
      defaultMessage:
        "Connect to browse Crowdin projects alongside native Hyperlocalise projects. Project and job data is read live from Crowdin when you open it.",
      id: "F63lYTb8dq",
      description: "Crowdin TMS integration description on the integrations page",
    },
    overview: [
      {
        defaultMessage:
          "Connect Crowdin to browse projects, jobs, and translation data alongside native Hyperlocalise work.",
        id: "intCrowdinOverview0",
        description: "Crowdin integration marketing overview paragraph",
      },
      {
        defaultMessage:
          "Project and job data is read live from Crowdin when you open it, so agents and reviewers always work from the latest source of truth.",
        id: "intCrowdinOverview1",
        description: "Crowdin integration marketing overview paragraph",
      },
    ],
    productName: {
      defaultMessage: "Crowdin",
      id: "intCrowdinProductName",
      description: "Crowdin integration product name on marketing detail page",
    },
    productDescription: {
      defaultMessage: "Live TMS project browsing, OAuth connections, and PAT-based setup.",
      id: "intCrowdinProductDescription",
      description: "Crowdin integration product description on marketing detail page",
    },
    metadataTitle: {
      defaultMessage: "Crowdin integration | Hyperlocalise",
      id: "intCrowdinMetaTitle",
      description: "Crowdin integration marketing page meta title",
    },
    metadataDescription: {
      defaultMessage:
        "Connect Crowdin to Hyperlocalise to browse TMS projects and run agent-native localization workflows.",
      id: "intCrowdinMetaDescription",
      description: "Crowdin integration marketing page meta description",
    },
  },
  lokalise: {
    name: {
      defaultMessage: "Lokalise",
      id: "7bhDbepHzq",
      description: "Lokalise TMS integration name on the integrations page",
    },
    tagline: {
      defaultMessage:
        "Connect to browse Lokalise projects, tasks, glossaries, and translation memories with user OAuth.",
      id: "KsWSfbuaLd",
      description: "Lokalise TMS integration description on the integrations page",
    },
    overview: [
      {
        defaultMessage:
          "Connect Lokalise with user OAuth to browse projects, tasks, glossaries, and translation memories from Hyperlocalise.",
        id: "intLokaliseOverview0",
        description: "Lokalise integration marketing overview paragraph",
      },
      {
        defaultMessage:
          "Keep external TMS context available to agents without forcing teams to abandon the tools they already use.",
        id: "intLokaliseOverview1",
        description: "Lokalise integration marketing overview paragraph",
      },
    ],
    productName: {
      defaultMessage: "Lokalise",
      id: "intLokaliseProductName",
      description: "Lokalise integration product name on marketing detail page",
    },
    productDescription: {
      defaultMessage: "OAuth-backed TMS browsing for projects, tasks, and linguistic assets.",
      id: "intLokaliseProductDescription",
      description: "Lokalise integration product description on marketing detail page",
    },
    metadataTitle: {
      defaultMessage: "Lokalise integration | Hyperlocalise",
      id: "intLokaliseMetaTitle",
      description: "Lokalise integration marketing page meta title",
    },
    metadataDescription: {
      defaultMessage:
        "Connect Lokalise to Hyperlocalise for OAuth-backed TMS browsing and localization workflows.",
      id: "intLokaliseMetaDescription",
      description: "Lokalise integration marketing page meta description",
    },
  },
  phrase: {
    name: {
      defaultMessage: "Phrase",
      id: "PNU13RfDla",
      description: "Phrase TMS integration name on the integrations page",
    },
    tagline: {
      defaultMessage: "Connect to browse Phrase projects and jobs with user OAuth.",
      id: "HsI1Rbh6Cp",
      description: "Phrase TMS integration description on the integrations page",
    },
    overview: [
      {
        defaultMessage:
          "Connect Phrase to browse projects and jobs from Hyperlocalise using user OAuth.",
        id: "intPhraseOverview0",
        description: "Phrase integration marketing overview paragraph",
      },
      {
        defaultMessage:
          "Bring enterprise TMS structure into the same workspace where agents, reviewers, and launch owners coordinate work.",
        id: "intPhraseOverview1",
        description: "Phrase integration marketing overview paragraph",
      },
    ],
    productName: {
      defaultMessage: "Phrase",
      id: "intPhraseProductName",
      description: "Phrase integration product name on marketing detail page",
    },
    productDescription: {
      defaultMessage: "OAuth-backed access to Phrase projects and localization jobs.",
      id: "intPhraseProductDescription",
      description: "Phrase integration product description on marketing detail page",
    },
    metadataTitle: {
      defaultMessage: "Phrase integration | Hyperlocalise",
      id: "intPhraseMetaTitle",
      description: "Phrase integration marketing page meta title",
    },
    metadataDescription: {
      defaultMessage:
        "Connect Phrase to Hyperlocalise for OAuth-backed TMS browsing and localization operations.",
      id: "intPhraseMetaDescription",
      description: "Phrase integration marketing page meta description",
    },
  },
  smartling: {
    name: {
      defaultMessage: "Smartling",
      id: "7nMUUnudcv",
      description: "Smartling TMS integration name on the integrations page",
    },
    tagline: {
      defaultMessage: "Connect enterprise localization programs.",
      id: "4HsCO20k/1",
      description: "Smartling TMS integration description on the integrations page",
    },
    overview: [
      {
        defaultMessage:
          "Smartling support is designed for enterprise localization programs that need Hyperlocalise agents and review workflows on top of existing TMS infrastructure.",
        id: "intSmartlingOverview0",
        description: "Smartling integration marketing overview paragraph",
      },
      {
        defaultMessage:
          "Connect Smartling to keep large-scale translation operations visible inside the same workspace your launch team uses.",
        id: "intSmartlingOverview1",
        description: "Smartling integration marketing overview paragraph",
      },
    ],
    productName: {
      defaultMessage: "Smartling",
      id: "intSmartlingProductName",
      description: "Smartling integration product name on marketing detail page",
    },
    productDescription: {
      defaultMessage: "Enterprise TMS connectivity for programs managed in Smartling.",
      id: "intSmartlingProductDescription",
      description: "Smartling integration product description on marketing detail page",
    },
    metadataTitle: {
      defaultMessage: "Smartling integration | Hyperlocalise",
      id: "intSmartlingMetaTitle",
      description: "Smartling integration marketing page meta title",
    },
    metadataDescription: {
      defaultMessage:
        "Connect Smartling to Hyperlocalise for enterprise TMS visibility and agent-native localization workflows.",
      id: "intSmartlingMetaDescription",
      description: "Smartling integration marketing page meta description",
    },
  },
  contentful: {
    name: {
      defaultMessage: "Contentful",
      id: "msm7HmNNfJ",
      description: "Contentful CMS integration name on the integrations page",
    },
    tagline: {
      defaultMessage: "CMS connector for agentic article translation and draft writeback.",
      id: "YrDOYyksrv",
      description: "Contentful CMS integration description on the integrations page",
    },
    overview: [
      {
        defaultMessage:
          "The Contentful connector lets Hyperlocalise agents translate structured content and write drafts back into your space.",
        id: "intContentfulOverview0",
        description: "Contentful integration marketing overview paragraph",
      },
      {
        defaultMessage:
          "Connect a space and environment so localization work stays tied to the CMS entries your marketing and product teams publish.",
        id: "intContentfulOverview1",
        description: "Contentful integration marketing overview paragraph",
      },
    ],
    productName: {
      defaultMessage: "Contentful",
      id: "intContentfulProductName",
      description: "Contentful integration product name on marketing detail page",
    },
    productDescription: {
      defaultMessage: "Space connections, content-type targeting, and draft writeback.",
      id: "intContentfulProductDescription",
      description: "Contentful integration product description on marketing detail page",
    },
    metadataTitle: {
      defaultMessage: "Contentful integration | Hyperlocalise",
      id: "intContentfulMetaTitle",
      description: "Contentful integration marketing page meta title",
    },
    metadataDescription: {
      defaultMessage:
        "Connect Contentful to Hyperlocalise for agentic content translation and draft writeback.",
      id: "intContentfulMetaDescription",
      description: "Contentful integration marketing page meta description",
    },
  },
  canva: {
    name: {
      defaultMessage: "Canva",
      id: "intCanvaName",
      description: "Canva integration name",
    },
    tagline: {
      defaultMessage: "Localize design assets and campaign creative from Canva.",
      id: "intCanvaTagline",
      description: "Canva integration short description",
    },
    overview: [
      {
        defaultMessage:
          "Connect Canva so Hyperlocalise can help teams localize design assets and campaign creative without rebuilding layouts from scratch.",
        id: "intCanvaOverview0",
        description: "Canva integration marketing overview paragraph",
      },
      {
        defaultMessage:
          "Keep visual launch work inside the same localization operating system as your product copy and support content.",
        id: "intCanvaOverview1",
        description: "Canva integration marketing overview paragraph",
      },
    ],
    productName: {
      defaultMessage: "Canva",
      id: "intCanvaProductName",
      description: "Canva integration product name on marketing detail page",
    },
    productDescription: {
      defaultMessage: "Design asset localization and creative workflow connections.",
      id: "intCanvaProductDescription",
      description: "Canva integration product description on marketing detail page",
    },
    metadataTitle: {
      defaultMessage: "Canva integration | Hyperlocalise",
      id: "intCanvaMetaTitle",
      description: "Canva integration marketing page meta title",
    },
    metadataDescription: {
      defaultMessage:
        "Connect Canva to Hyperlocalise for design asset localization and creative workflows.",
      id: "intCanvaMetaDescription",
      description: "Canva integration marketing page meta description",
    },
  },
  intercom: {
    name: {
      defaultMessage: "Intercom",
      id: "intIntercomName",
      description: "Intercom integration name",
    },
    tagline: {
      defaultMessage: "Localize support content and customer messaging from Intercom.",
      id: "intIntercomTagline",
      description: "Intercom integration short description",
    },
    overview: [
      {
        defaultMessage:
          "Connect Intercom so Hyperlocalise can help teams localize support articles, in-product messaging, and customer-facing content.",
        id: "intIntercomOverview0",
        description: "Intercom integration marketing overview paragraph",
      },
      {
        defaultMessage:
          "Keep customer experience work aligned with the same review and launch process used for product strings.",
        id: "intIntercomOverview1",
        description: "Intercom integration marketing overview paragraph",
      },
    ],
    productName: {
      defaultMessage: "Intercom",
      id: "intIntercomProductName",
      description: "Intercom integration product name on marketing detail page",
    },
    productDescription: {
      defaultMessage: "Support content localization and customer messaging workflows.",
      id: "intIntercomProductDescription",
      description: "Intercom integration product description on marketing detail page",
    },
    metadataTitle: {
      defaultMessage: "Intercom integration | Hyperlocalise",
      id: "intIntercomMetaTitle",
      description: "Intercom integration marketing page meta title",
    },
    metadataDescription: {
      defaultMessage:
        "Connect Intercom to Hyperlocalise for support content localization and customer messaging workflows.",
      id: "intIntercomMetaDescription",
      description: "Intercom integration marketing page meta description",
    },
  },
  ahrefs: {
    name: {
      defaultMessage: "Ahrefs",
      id: "intAhrefsName",
      description: "Ahrefs integration name",
    },
    tagline: {
      defaultMessage: "Bring SEO research into locale-aware content workflows.",
      id: "intAhrefsTagline",
      description: "Ahrefs integration short description",
    },
    overview: [
      {
        defaultMessage:
          "Connect Ahrefs to feed keyword research and ranking context into Hyperlocalise SEO workflows.",
        id: "intAhrefsOverview0",
        description: "Ahrefs integration marketing overview paragraph",
      },
      {
        defaultMessage:
          "Help content and localization teams prioritize market-specific pages with real search data instead of guesswork.",
        id: "intAhrefsOverview1",
        description: "Ahrefs integration marketing overview paragraph",
      },
    ],
    productName: {
      defaultMessage: "Ahrefs",
      id: "intAhrefsProductName",
      description: "Ahrefs integration product name on marketing detail page",
    },
    productDescription: {
      defaultMessage: "SEO research connections for locale-aware content planning.",
      id: "intAhrefsProductDescription",
      description: "Ahrefs integration product description on marketing detail page",
    },
    metadataTitle: {
      defaultMessage: "Ahrefs integration | Hyperlocalise",
      id: "intAhrefsMetaTitle",
      description: "Ahrefs integration marketing page meta title",
    },
    metadataDescription: {
      defaultMessage:
        "Connect Ahrefs to Hyperlocalise for SEO-informed, locale-aware content workflows.",
      id: "intAhrefsMetaDescription",
      description: "Ahrefs integration marketing page meta description",
    },
  },
  semrush: {
    name: {
      defaultMessage: "Semrush",
      id: "intSemrushName",
      description: "Semrush integration name",
    },
    tagline: {
      defaultMessage: "Connect SEO intelligence to multilingual content operations.",
      id: "intSemrushTagline",
      description: "Semrush integration short description",
    },
    overview: [
      {
        defaultMessage:
          "Semrush connections bring keyword, ranking, and competitive research into Hyperlocalise so launch teams can localize with search intent in mind.",
        id: "intSemrushOverview0",
        description: "Semrush integration marketing overview paragraph",
      },
      {
        defaultMessage:
          "Use SEO signals to prioritize markets, pages, and content updates before translation work begins.",
        id: "intSemrushOverview1",
        description: "Semrush integration marketing overview paragraph",
      },
    ],
    productName: {
      defaultMessage: "Semrush",
      id: "intSemrushProductName",
      description: "Semrush integration product name on marketing detail page",
    },
    productDescription: {
      defaultMessage: "SEO intelligence for multilingual content planning and optimization.",
      id: "intSemrushProductDescription",
      description: "Semrush integration product description on marketing detail page",
    },
    metadataTitle: {
      defaultMessage: "Semrush integration | Hyperlocalise",
      id: "intSemrushMetaTitle",
      description: "Semrush integration marketing page meta title",
    },
    metadataDescription: {
      defaultMessage:
        "Connect Semrush to Hyperlocalise for SEO-informed multilingual content operations.",
      id: "intSemrushMetaDescription",
      description: "Semrush integration marketing page meta description",
    },
  },
  hyperlab: {
    name: {
      defaultMessage: "Hyperlab",
      id: "dj/oJykkFj",
      description: "Built-in market experiments product name on the integrations page",
    },
    tagline: {
      defaultMessage: "Test a change with some users before you show it to everyone.",
      id: "Rk8U85urY5",
      description: "Built-in experiments product description on the integrations page",
    },
    overview: [
      {
        defaultMessage:
          "Hyperlab is Hyperlocalise's built-in experimentation layer for testing localized experiences before full rollout.",
        id: "intHyperlabOverview0",
        description: "Hyperlab integration marketing overview paragraph",
      },
      {
        defaultMessage:
          "Run controlled experiments on copy, layout, or market-specific variants without bolting on a separate feature-flag stack.",
        id: "intHyperlabOverview1",
        description: "Hyperlab integration marketing overview paragraph",
      },
    ],
    productName: {
      defaultMessage: "Hyperlab",
      id: "intHyperlabProductName",
      description: "Hyperlab integration product name on marketing detail page",
    },
    productDescription: {
      defaultMessage: "Built-in experiments for localized product and content changes.",
      id: "intHyperlabProductDescription",
      description: "Hyperlab integration product description on marketing detail page",
    },
    metadataTitle: {
      defaultMessage: "Hyperlab | Hyperlocalise integrations",
      id: "intHyperlabMetaTitle",
      description: "Hyperlab integration marketing page meta title",
    },
    metadataDescription: {
      defaultMessage:
        "Use Hyperlab inside Hyperlocalise to experiment with localized experiences before global rollout.",
      id: "intHyperlabMetaDescription",
      description: "Hyperlab integration marketing page meta description",
    },
  },
  jira: {
    name: {
      defaultMessage: "Jira",
      id: "i8B+GP5gs5",
      description: "Jira integration name on the integrations page",
    },
    tagline: {
      defaultMessage:
        "Create Jira issues from translation blockers and keep localization work in sync.",
      id: "jEkf8VDO5/",
      description: "Jira integration description on the integrations page",
    },
    overview: [
      {
        defaultMessage:
          "Jira support will let teams create issues from translation blockers and keep localization tasks synchronized with engineering workflows.",
        id: "intJiraOverview0",
        description: "Jira integration marketing overview paragraph",
      },
      {
        defaultMessage:
          "This connector is planned for teams that coordinate launches through Atlassian.",
        id: "intJiraOverview1",
        description: "Jira integration marketing overview paragraph",
      },
    ],
    productName: {
      defaultMessage: "Jira",
      id: "intJiraProductName",
      description: "Jira integration product name on marketing detail page",
    },
    productDescription: {
      defaultMessage: "Issue creation and workflow sync for localization blockers.",
      id: "intJiraProductDescription",
      description: "Jira integration product description on marketing detail page",
    },
    metadataTitle: {
      defaultMessage: "Jira integration | Hyperlocalise",
      id: "intJiraMetaTitle",
      description: "Jira integration marketing page meta title",
    },
    metadataDescription: {
      defaultMessage:
        "Connect Jira to Hyperlocalise to track localization blockers and sync launch work.",
      id: "intJiraMetaDescription",
      description: "Jira integration marketing page meta description",
    },
  },
  linear: {
    name: {
      defaultMessage: "Linear",
      id: "NJJU5P3v/j",
      description: "Linear integration name on the integrations page",
    },
    tagline: {
      defaultMessage: "Create issues from translation blockers and keep launch tasks in sync.",
      id: "rponYzKMZ3",
      description: "Linear integration description on the integrations page",
    },
    overview: [
      {
        defaultMessage:
          "Linear support will help teams turn translation blockers into tracked issues without losing product context.",
        id: "intLinearOverview0",
        description: "Linear integration marketing overview paragraph",
      },
      {
        defaultMessage:
          "Keep localization launch work visible beside the rest of your product delivery pipeline.",
        id: "intLinearOverview1",
        description: "Linear integration marketing overview paragraph",
      },
    ],
    productName: {
      defaultMessage: "Linear",
      id: "intLinearProductName",
      description: "Linear integration product name on marketing detail page",
    },
    productDescription: {
      defaultMessage: "Issue sync for localization blockers and launch coordination.",
      id: "intLinearProductDescription",
      description: "Linear integration product description on marketing detail page",
    },
    metadataTitle: {
      defaultMessage: "Linear integration | Hyperlocalise",
      id: "intLinearMetaTitle",
      description: "Linear integration marketing page meta title",
    },
    metadataDescription: {
      defaultMessage:
        "Connect Linear to Hyperlocalise for localization issue tracking and launch coordination.",
      id: "intLinearMetaDescription",
      description: "Linear integration marketing page meta description",
    },
  },
  notion: {
    name: {
      defaultMessage: "Notion",
      id: "geRgaRor6g",
      description: "Notion integration name on the integrations page",
    },
    tagline: {
      defaultMessage: "Import style guides and market notes from Notion.",
      id: "m9ESiA+Ppw",
      description: "Notion integration description on the integrations page",
    },
    overview: [
      {
        defaultMessage:
          "Notion support will let Hyperlocalise import style guides, glossary notes, and market guidance directly from your team's knowledge base.",
        id: "intNotionOverview0",
        description: "Notion integration marketing overview paragraph",
      },
      {
        defaultMessage:
          "Give agents the brand and market context they need without copying docs into yet another system.",
        id: "intNotionOverview1",
        description: "Notion integration marketing overview paragraph",
      },
    ],
    productName: {
      defaultMessage: "Notion",
      id: "intNotionProductName",
      description: "Notion integration product name on marketing detail page",
    },
    productDescription: {
      defaultMessage: "Guideline and knowledge imports for agent context.",
      id: "intNotionProductDescription",
      description: "Notion integration product description on marketing detail page",
    },
    metadataTitle: {
      defaultMessage: "Notion integration | Hyperlocalise",
      id: "intNotionMetaTitle",
      description: "Notion integration marketing page meta title",
    },
    metadataDescription: {
      defaultMessage:
        "Connect Notion to Hyperlocalise to import style guides and market guidance for localization agents.",
      id: "intNotionMetaDescription",
      description: "Notion integration marketing page meta description",
    },
  },
  resend: {
    name: {
      defaultMessage: "Resend",
      id: "mP2HNF+0n+",
      description: "Resend integration name on the integrations page",
    },
    tagline: {
      defaultMessage: "Send localized transactional email through Resend.",
      id: "HYHV9OorEn",
      description: "Resend integration description on the integrations page",
    },
    overview: [
      {
        defaultMessage:
          "Resend support will let teams send localized transactional email from the same workspace where copy is reviewed and approved.",
        id: "intResendOverview0",
        description: "Resend integration marketing overview paragraph",
      },
      {
        defaultMessage:
          "Keep email launch work connected to the translation memory and review history behind it.",
        id: "intResendOverview1",
        description: "Resend integration marketing overview paragraph",
      },
    ],
    productName: {
      defaultMessage: "Resend",
      id: "intResendProductName",
      description: "Resend integration product name on marketing detail page",
    },
    productDescription: {
      defaultMessage: "Localized transactional email delivery.",
      id: "intResendProductDescription",
      description: "Resend integration product description on marketing detail page",
    },
    metadataTitle: {
      defaultMessage: "Resend integration | Hyperlocalise",
      id: "intResendMetaTitle",
      description: "Resend integration marketing page meta title",
    },
    metadataDescription: {
      defaultMessage:
        "Connect Resend to Hyperlocalise for localized transactional email workflows.",
      id: "intResendMetaDescription",
      description: "Resend integration marketing page meta description",
    },
  },
  "projects-files": {
    name: {
      defaultMessage: "Projects & files",
      id: "sPnHTuWYkS",
      description: "Built-in translation workspace name on the integrations page",
    },
    tagline: {
      defaultMessage:
        "Manage translations, jobs, and memories in Hyperlocalise without an external TMS.",
      id: "M+1IVHnYL6",
      description: "Built-in translation workspace description on the integrations page",
    },
  },
  "microsoft-teams": {
    name: {
      defaultMessage: "Microsoft Teams",
      id: "Brot+npjjF",
      description: "Microsoft Teams integration name on the integrations page",
    },
    tagline: {
      defaultMessage: "Coordinate localization reviews from Microsoft Teams workspaces.",
      id: "hMoO98tftt",
      description: "Microsoft Teams integration description on the integrations page",
    },
  },
  "google-drive": {
    name: {
      defaultMessage: "Google Drive",
      id: "EQ48eGG7/X",
      description: "Google Drive integration name on the integrations page",
    },
    tagline: {
      defaultMessage: "Import brand guidelines and style docs from Google Drive.",
      id: "EgJBlBjf3r",
      description: "Google Drive integration description on the integrations page",
    },
  },
  sharepoint: {
    name: {
      defaultMessage: "SharePoint",
      id: "LxzxKCrG8Q",
      description: "SharePoint integration name on the integrations page",
    },
    tagline: {
      defaultMessage: "Import localization guidance from SharePoint.",
      id: "YgXBEI+WDA",
      description: "SharePoint integration description on the integrations page",
    },
  },
  braze: {
    name: {
      defaultMessage: "Braze",
      id: "xbozAAPBGJ",
      description: "Braze integration name on the integrations page",
    },
    tagline: {
      defaultMessage: "Localize campaigns, in-app messages, and customer journeys in Braze.",
      id: "eENPAn2kRY",
      description: "Braze integration description on the integrations page",
    },
  },
  iterable: {
    name: {
      defaultMessage: "Iterable",
      id: "RG2VP91ErR",
      description: "Iterable integration name on the integrations page",
    },
    tagline: {
      defaultMessage: "Localize campaigns, journeys, and in-app messages in Iterable.",
      id: "SO48T+V4po",
      description: "Iterable integration description on the integrations page",
    },
  },
  "customer-io": {
    name: {
      defaultMessage: "Customer.io",
      id: "UI13YDnUPd",
      description: "Customer.io integration name on the integrations page",
    },
    tagline: {
      defaultMessage: "Localize behavioral email and in-app messages in Customer.io.",
      id: "qCIzGw7LDA",
      description: "Customer.io integration description on the integrations page",
    },
  },
  hubspot: {
    name: {
      defaultMessage: "HubSpot",
      id: "KxUwuBv/S/",
      description: "HubSpot integration name on the integrations page",
    },
    tagline: {
      defaultMessage: "Localize marketing emails, landing pages, and CRM messages in HubSpot.",
      id: "NCfwtZnJJa",
      description: "HubSpot integration description on the integrations page",
    },
  },
  mailchimp: {
    name: {
      defaultMessage: "Mailchimp",
      id: "VNOmqIMmQh",
      description: "Mailchimp integration name on the integrations page",
    },
    tagline: {
      defaultMessage: "Localize audiences, campaigns, and automations in Mailchimp.",
      id: "uzxy3XOTGJ",
      description: "Mailchimp integration description on the integrations page",
    },
  },
  loops: {
    name: {
      defaultMessage: "Loops",
      id: "YCRoGFQJBc",
      description: "Loops integration name on the integrations page",
    },
    tagline: {
      defaultMessage: "Localize product emails and customer messaging in Loops.",
      id: "/I4cav3gE2",
      description: "Loops integration description on the integrations page",
    },
  },
  sendgrid: {
    name: {
      defaultMessage: "SendGrid",
      id: "RrWEsf3aht",
      description: "SendGrid integration name on the integrations page",
    },
    tagline: {
      defaultMessage: "Send localized transactional email through SendGrid.",
      id: "YoR3hQqYL1",
      description: "SendGrid integration description on the integrations page",
    },
  },
  pages: {
    name: {
      defaultMessage: "Pages",
      id: "WYPwI9kUrL",
      description: "Built-in pages integration name on the integrations page",
    },
    tagline: {
      defaultMessage: "Create, edit, and publish localized pages from Hyperlocalise.",
      id: "ZQP7LGFxPh",
      description: "Built-in content integration description on the integrations page",
    },
  },
  hyperseo: {
    name: {
      defaultMessage: "HyperSEO",
      id: "l2rdlltKQu",
      description: "Built-in SEO product name on the integrations page",
    },
    tagline: {
      defaultMessage:
        "Keyword research, rankings, technical SEO, content optimization, and locale-aware audits built into Hyperlocalise.",
      id: "1VHN7KiWQG",
      description: "Built-in SEO product description on the integrations page",
    },
  },
} as const satisfies Record<string, IntegrationCopyDescriptors>;

export type IntegrationCatalogSlug = keyof typeof integrationCatalogCopy;

export function getIntegrationCopyDescriptors(slug: string): IntegrationCopyDescriptors | null {
  const descriptors = integrationCatalogCopy[slug as IntegrationCatalogSlug];
  return descriptors ?? null;
}
