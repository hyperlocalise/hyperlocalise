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
import type { IntegrationCatalogSlug } from "@/lib/integrations/integration-catalog.copy";
import type { IntegrationFaqDescriptor } from "@/lib/integrations/integration-catalog.types";

function faq(
  question: string,
  questionId: string,
  questionDescription: string,
  answer: string,
  answerId: string,
  answerDescription: string,
): IntegrationFaqDescriptor {
  return {
    question: {
      defaultMessage: question,
      id: questionId,
      description: questionDescription,
    },
    answer: {
      defaultMessage: answer,
      id: answerId,
      description: answerDescription,
    },
  };
}

export const integrationFaqCopy = {
  github: [
    faq(
      "Does Hyperlocalise comment on GitHub pull requests?",
      "intGitHubFaqQ1",
      "GitHub integration FAQ about pull request checks",
      "Yes. Hyperlocalise can scan string changes in a pull request, flag missing translations, and report locale status before you merge.",
      "intGitHubFaqA1",
      "GitHub integration FAQ answer about pull request checks",
    ),
    faq(
      "Do we have to replace Crowdin, Lokalise, or Phrase?",
      "intGitHubFaqQ2",
      "GitHub integration FAQ about TMS replacement",
      "No. GitHub stays where code ships. Your TMS can stay the system of record. Hyperlocalise sits in between: it reads the diff, runs review, and can open a fix PR.",
      "intGitHubFaqA2",
      "GitHub integration FAQ answer about TMS replacement",
    ),
    faq(
      "What does the GitHub App need access to?",
      "intGitHubFaqQ3",
      "GitHub integration FAQ about app permissions",
      "The app needs access to the repositories you select, plus pull requests so it can comment and open fix PRs. You choose which repos and default branches after install.",
      "intGitHubFaqA3",
      "GitHub integration FAQ answer about app permissions",
    ),
  ],
  gitlab: [
    faq(
      "Does this work with GitLab.com merge requests?",
      "intGitLabFaqQ1",
      "GitLab integration FAQ about merge requests",
      "Yes. Hyperlocalise can inspect GitLab.com projects, scan string changes, and keep locale files tied to the branch you merge.",
      "intGitLabFaqA1",
      "GitLab integration FAQ answer about merge requests",
    ),
    faq(
      "Is GitLab self-managed supported?",
      "intGitLabFaqQ2",
      "GitLab integration FAQ about self-managed",
      "The public connector is for GitLab.com. Self-managed GitLab is a separate workspace connection. Ask during a demo if you need that path.",
      "intGitLabFaqA2",
      "GitLab integration FAQ answer about self-managed",
    ),
    faq(
      "Do we replace our TMS to use GitLab?",
      "intGitLabFaqQ3",
      "GitLab integration FAQ about TMS",
      "No. GitLab stays the source of code. Hyperlocalise can still send strings to Crowdin, Lokalise, or Phrase and bring translations back as a merge request.",
      "intGitLabFaqA3",
      "GitLab integration FAQ answer about TMS",
    ),
  ],
  slack: [
    faq(
      "Where do review requests land in Slack?",
      "intSlackFaqQ1",
      "Slack integration FAQ about channels",
      "You choose the channel or thread that owns the launch. Hyperlocalise can post review requests, status updates, and blockers there instead of a separate inbox.",
      "intSlackFaqA1",
      "Slack integration FAQ answer about channels",
    ),
    faq(
      "Can reviewers reply in Slack?",
      "intSlackFaqQ2",
      "Slack integration FAQ about replies",
      "Reviewers can respond in the thread that received the request. The workspace still keeps the full review record, glossary, and job history.",
      "intSlackFaqA2",
      "Slack integration FAQ answer about replies",
    ),
    faq(
      "Does Slack replace the CAT workspace?",
      "intSlackFaqQ3",
      "Slack integration FAQ about CAT",
      "No. Slack is for coordination. Detailed review, memory, and glossary checks still happen in Hyperlocalise.",
      "intSlackFaqA3",
      "Slack integration FAQ answer about CAT",
    ),
  ],
  jira: [
    faq(
      "What will the Jira connector do?",
      "intJiraFaqQ1",
      "Jira integration FAQ about upcoming behaviour",
      "It will create Jira issues from translation blockers so localisation work sits next to the engineering tickets that block a release.",
      "intJiraFaqA1",
      "Jira integration FAQ answer about upcoming behaviour",
    ),
    faq(
      "Is Jira available now?",
      "intJiraFaqQ2",
      "Jira integration FAQ about availability",
      "Not yet. Request a demo if Jira is a requirement for your bake-off. GitHub, Slack, and TMS connectors are available today.",
      "intJiraFaqA2",
      "Jira integration FAQ answer about availability",
    ),
    faq(
      "Will this replace our Jira workflow?",
      "intJiraFaqQ3",
      "Jira integration FAQ about replacement",
      "No. Jira stays the issue tracker. Hyperlocalise would open or update issues when localisation work is blocked.",
      "intJiraFaqA3",
      "Jira integration FAQ answer about replacement",
    ),
  ],
  linear: [
    faq(
      "What will the Linear connector do?",
      "intLinearFaqQ1",
      "Linear integration FAQ about upcoming behaviour",
      "It will turn translation blockers into Linear issues so launch work stays beside the rest of your product pipeline.",
      "intLinearFaqA1",
      "Linear integration FAQ answer about upcoming behaviour",
    ),
    faq(
      "Is Linear available now?",
      "intLinearFaqQ2",
      "Linear integration FAQ about availability",
      "Not yet. Request a demo if Linear tracking is part of your evaluation. GitHub and Slack connectors are available today.",
      "intLinearFaqA2",
      "Linear integration FAQ answer about availability",
    ),
    faq(
      "Will agents create Linear issues on their own?",
      "intLinearFaqQ3",
      "Linear integration FAQ about agents",
      "Issue creation will be tied to review findings you can inspect. Agents draft; humans decide what becomes a ticket.",
      "intLinearFaqA3",
      "Linear integration FAQ answer about agents",
    ),
  ],
  crowdin: [
    faq(
      "Do we have to move off Crowdin?",
      "intCrowdinFaqQ1",
      "Crowdin integration FAQ about replacement",
      "No. Crowdin can stay the TMS. Hyperlocalise reads projects live, adds review and agent context, and can still send work back to Crowdin.",
      "intCrowdinFaqA1",
      "Crowdin integration FAQ answer about replacement",
    ),
    faq(
      "Is project data copied into Hyperlocalise?",
      "intCrowdinFaqQ2",
      "Crowdin integration FAQ about data",
      "Project and job data is read from Crowdin when you open it, so reviewers and agents work from the current TMS state.",
      "intCrowdinFaqA2",
      "Crowdin integration FAQ answer about data",
    ),
    faq(
      "Can GitHub PRs still export strings to Crowdin?",
      "intCrowdinFaqQ3",
      "Crowdin integration FAQ about GitHub",
      "Yes. A typical loop is: branch push or PR, strings exported to Crowdin, translations reviewed, locale files returned as a PR.",
      "intCrowdinFaqA3",
      "Crowdin integration FAQ answer about GitHub",
    ),
  ],
  lokalise: [
    faq(
      "Do we replace Lokalise?",
      "intLokaliseFaqQ1",
      "Lokalise integration FAQ about replacement",
      "No. Connect with OAuth and keep Lokalise for projects, tasks, glossaries, and translation memories. Hyperlocalise adds review, context, and launch tooling.",
      "intLokaliseFaqA1",
      "Lokalise integration FAQ answer about replacement",
    ),
    faq(
      "What does OAuth access?",
      "intLokaliseFaqQ2",
      "Lokalise integration FAQ about OAuth",
      "The connection browses the Lokalise projects and linguistic assets the signed-in user can already see. You revoke access from Lokalise at any time.",
      "intLokaliseFaqA2",
      "Lokalise integration FAQ answer about OAuth",
    ),
    faq(
      "Can agents use our Lokalise glossary?",
      "intLokaliseFaqQ3",
      "Lokalise integration FAQ about glossary",
      "Yes. Glossary and memory context from Lokalise can inform drafts so agents do not invent a second terminology source.",
      "intLokaliseFaqA3",
      "Lokalise integration FAQ answer about glossary",
    ),
  ],
  phrase: [
    faq(
      "Do we replace Phrase?",
      "intPhraseFaqQ1",
      "Phrase integration FAQ about replacement",
      "No. Phrase stays the TMS. Hyperlocalise connects with OAuth so you can browse projects and jobs while review happens in one workspace.",
      "intPhraseFaqA1",
      "Phrase integration FAQ answer about replacement",
    ),
    faq(
      "Which Phrase projects can we see?",
      "intPhraseFaqQ2",
      "Phrase integration FAQ about projects",
      "The ones the signed-in Phrase user can already access. Hyperlocalise does not create a parallel project tree.",
      "intPhraseFaqA2",
      "Phrase integration FAQ answer about projects",
    ),
    faq(
      "Does this work with GitHub?",
      "intPhraseFaqQ3",
      "Phrase integration FAQ about GitHub",
      "Yes. Keep GitHub as the repo, Phrase as the TMS, and Hyperlocalise as the review and automation layer between them.",
      "intPhraseFaqA3",
      "Phrase integration FAQ answer about GitHub",
    ),
  ],
  smartling: [
    faq(
      "Is this a Smartling replacement?",
      "intSmartlingFaqQ1",
      "Smartling integration FAQ about replacement",
      "No. Smartling stays the enterprise TMS. Hyperlocalise gives launch owners and reviewers a single place to see status, context, and blockers.",
      "intSmartlingFaqA1",
      "Smartling integration FAQ answer about replacement",
    ),
    faq(
      "Who is this for?",
      "intSmartlingFaqQ2",
      "Smartling integration FAQ about audience",
      "Teams that already run large programmes in Smartling and need agent drafts, review, and GitHub or Slack coordination on top.",
      "intSmartlingFaqA2",
      "Smartling integration FAQ answer about audience",
    ),
    faq(
      "Does Hyperlocalise write back to Smartling?",
      "intSmartlingFaqQ3",
      "Smartling integration FAQ about writeback",
      "The connector is for visibility and workflow. How jobs sync back is configured per workspace so Smartling can remain the source of truth for approved translations.",
      "intSmartlingFaqA3",
      "Smartling integration FAQ answer about writeback",
    ),
  ],
  contentful: [
    faq(
      "Does Hyperlocalise write drafts back to Contentful?",
      "intContentfulFaqQ1",
      "Contentful integration FAQ about writeback",
      "Yes. Agents can translate structured entries and write drafts back to the space and environment you connect.",
      "intContentfulFaqA1",
      "Contentful integration FAQ answer about writeback",
    ),
    faq(
      "Which content types can we localise?",
      "intContentfulFaqQ2",
      "Contentful integration FAQ about content types",
      "You target the content types that need localisation. The rest of the space stays untouched.",
      "intContentfulFaqA2",
      "Contentful integration FAQ answer about content types",
    ),
    faq(
      "Do editors still publish in Contentful?",
      "intContentfulFaqQ3",
      "Contentful integration FAQ about publishing",
      "Yes. Hyperlocalise writes drafts. Your team still reviews and publishes in Contentful.",
      "intContentfulFaqA3",
      "Contentful integration FAQ answer about publishing",
    ),
  ],
  canva: [
    faq(
      "Can we localise Canva designs without rebuilding layouts?",
      "intCanvaFaqQ1",
      "Canva integration FAQ about layouts",
      "That is the point. Hyperlocalise helps adapt copy and creative in the existing design instead of starting from a blank page per market.",
      "intCanvaFaqA1",
      "Canva integration FAQ answer about layouts",
    ),
    faq(
      "Does this cover campaign images as well as copy?",
      "intCanvaFaqQ2",
      "Canva integration FAQ about images",
      "Yes. Visual launch work can follow the same review path as product strings, including market checks before you export.",
      "intCanvaFaqA2",
      "Canva integration FAQ answer about images",
    ),
    faq(
      "Who approves the localised design?",
      "intCanvaFaqQ3",
      "Canva integration FAQ about approval",
      "Your reviewers. Agents draft. Nothing publishes from Canva until a human signs off in Hyperlocalise.",
      "intCanvaFaqA3",
      "Canva integration FAQ answer about approval",
    ),
  ],
  notion: [
    faq(
      "What do we import from Notion?",
      "intNotionFaqQ1",
      "Notion integration FAQ about imports",
      "Style guides, glossary notes, and market guidance your team already keeps in Notion, so agents draft against those docs.",
      "intNotionFaqA1",
      "Notion integration FAQ answer about imports",
    ),
    faq(
      "Do we copy pages into Hyperlocalise by hand?",
      "intNotionFaqQ2",
      "Notion integration FAQ about copying",
      "No. Connect Notion and point at the pages that should become guideline context. You are not maintaining a second wiki.",
      "intNotionFaqA2",
      "Notion integration FAQ answer about copying",
    ),
    faq(
      "Can agents change the Notion source?",
      "intNotionFaqQ3",
      "Notion integration FAQ about write access",
      "Guideline imports are for context. Agents do not rewrite your Notion docs unless you set up an explicit sync.",
      "intNotionFaqA3",
      "Notion integration FAQ answer about write access",
    ),
  ],
  intercom: [
    faq(
      "Can we localise Intercom help articles?",
      "intIntercomFaqQ1",
      "Intercom integration FAQ about articles",
      "Yes. Support articles and in-product messaging can follow the same review process as product strings.",
      "intIntercomFaqA1",
      "Intercom integration FAQ answer about articles",
    ),
    faq(
      "Does this replace Intercom's own multilingual tools?",
      "intIntercomFaqQ2",
      "Intercom integration FAQ about replacement",
      "No. Intercom stays where customers read the help center. Hyperlocalise is where copy is translated, checked, and approved.",
      "intIntercomFaqA2",
      "Intercom integration FAQ answer about replacement",
    ),
    faq(
      "How do we keep articles from drifting out of date?",
      "intIntercomFaqQ3",
      "Intercom integration FAQ about freshness",
      "Connect Intercom so new or changed source articles enter the same localisation workflow instead of a spreadsheet handoff.",
      "intIntercomFaqA3",
      "Intercom integration FAQ answer about freshness",
    ),
  ],
  resend: [
    faq(
      "Can we send transactional email after review?",
      "intResendFaqQ1",
      "Resend integration FAQ about sending",
      "Yes. Localised templates can go out through Resend from the same workspace that holds translation memory and review history.",
      "intResendFaqA1",
      "Resend integration FAQ answer about sending",
    ),
    faq(
      "Do we keep our Resend domain and templates?",
      "intResendFaqQ2",
      "Resend integration FAQ about templates",
      "Yes. Resend stays the delivery layer. Hyperlocalise is where copy is localised and approved before send.",
      "intResendFaqA2",
      "Resend integration FAQ answer about templates",
    ),
    faq(
      "Are glossary terms applied to email?",
      "intResendFaqQ3",
      "Resend integration FAQ about glossary",
      "Reviewed copy carries the same memory and glossary as the rest of the workspace, so transactional email does not invent a second voice.",
      "intResendFaqA3",
      "Resend integration FAQ answer about glossary",
    ),
  ],
  zernio: [
    faq(
      "Which ad platforms does Zernio cover?",
      "intZernioFaqQ1",
      "Zernio integration FAQ about platforms",
      "Meta, Google Ads, TikTok, LinkedIn, Pinterest, X, and OpenAI Ads through one API, after copy is localised.",
      "intZernioFaqA1",
      "Zernio integration FAQ answer about platforms",
    ),
    faq(
      "When are ads created?",
      "intZernioFaqQ2",
      "Zernio integration FAQ about timing",
      "After translation and review. Automations can call Zernio so you are not rebuilding campaigns by hand per market.",
      "intZernioFaqA2",
      "Zernio integration FAQ answer about timing",
    ),
    faq(
      "Where do we store the API key?",
      "intZernioFaqQ3",
      "Zernio integration FAQ about API keys",
      "In Integrations. Then attach the Zernio tool to an automation, or call it from the hosted MCP server.",
      "intZernioFaqA3",
      "Zernio integration FAQ answer about API keys",
    ),
  ],
  hyperlab: [
    faq(
      "What is Hyperlab?",
      "intHyperlabFaqQ1",
      "Hyperlab integration FAQ about definition",
      "Hyperlab is Hyperlocalise's built-in experiment layer. Test a locale change with some users before everyone sees it.",
      "intHyperlabFaqA1",
      "Hyperlab integration FAQ answer about definition",
    ),
    faq(
      "Do we need Statsig or another flag product?",
      "intHyperlabFaqQ2",
      "Hyperlab integration FAQ about flags",
      "Not for Hyperlab experiments. If you already run Statsig, that connector is planned as a complement, not a requirement.",
      "intHyperlabFaqA2",
      "Hyperlab integration FAQ answer about flags",
    ),
    faq(
      "What can we experiment on?",
      "intHyperlabFaqQ3",
      "Hyperlab integration FAQ about variants",
      "Copy, layout, or market-specific variants, with the same review trail as the rest of your localisation work.",
      "intHyperlabFaqA3",
      "Hyperlab integration FAQ answer about variants",
    ),
  ],
  statsig: [
    faq(
      "Is the Statsig connector available?",
      "intStatsigFaqQ1",
      "Statsig integration FAQ about availability",
      "Not yet. Request a demo if you already ship copy behind Statsig flags. Hyperlab is available today for in-product experiments.",
      "intStatsigFaqA1",
      "Statsig integration FAQ answer about availability",
    ),
    faq(
      "What will it do?",
      "intStatsigFaqQ2",
      "Statsig integration FAQ about behaviour",
      "Connect Statsig so localised copy can ship behind feature flags and experiments without leaving Hyperlocalise.",
      "intStatsigFaqA2",
      "Statsig integration FAQ answer about behaviour",
    ),
    faq(
      "Will this replace Hyperlab?",
      "intStatsigFaqQ3",
      "Statsig integration FAQ about Hyperlab",
      "No. Hyperlab is built in. Statsig is for teams that already run flags there and want localisation in that loop.",
      "intStatsigFaqA3",
      "Statsig integration FAQ answer about Hyperlab",
    ),
  ],
  ahrefs: [
    faq(
      "How does Ahrefs help localisation?",
      "intAhrefsFaqQ1",
      "Ahrefs integration FAQ about value",
      "Keyword and ranking data feeds locale-aware planning so you localise pages that already have search demand.",
      "intAhrefsFaqA1",
      "Ahrefs integration FAQ answer about value",
    ),
    faq(
      "Do we replace Ahrefs?",
      "intAhrefsFaqQ2",
      "Ahrefs integration FAQ about replacement",
      "No. Ahrefs stays the SEO research tool. Hyperlocalise uses that research when it chooses what to translate.",
      "intAhrefsFaqA2",
      "Ahrefs integration FAQ answer about replacement",
    ),
    faq(
      "Can this pair with Contentful?",
      "intAhrefsFaqQ3",
      "Ahrefs integration FAQ about Contentful",
      "Yes. Research in Ahrefs, write in Contentful, review in Hyperlocalise is a typical marketing loop.",
      "intAhrefsFaqA3",
      "Ahrefs integration FAQ answer about Contentful",
    ),
  ],
  semrush: [
    faq(
      "How does Semrush help localisation?",
      "intSemrushFaqQ1",
      "Semrush integration FAQ about value",
      "Keyword, ranking, and competitive research help you pick markets and pages before translation starts.",
      "intSemrushFaqA1",
      "Semrush integration FAQ answer about value",
    ),
    faq(
      "Do we replace Semrush?",
      "intSemrushFaqQ2",
      "Semrush integration FAQ about replacement",
      "No. Semrush stays the SEO suite. Hyperlocalise consumes those signals in the localisation workflow.",
      "intSemrushFaqA2",
      "Semrush integration FAQ answer about replacement",
    ),
    faq(
      "Is this useful without a CMS connector?",
      "intSemrushFaqQ3",
      "Semrush integration FAQ about CMS",
      "Yes. You can still prioritise markets from Semrush data, then localise files from GitHub or a TMS.",
      "intSemrushFaqA3",
      "Semrush integration FAQ answer about CMS",
    ),
  ],
} as const satisfies Partial<Record<IntegrationCatalogSlug, readonly IntegrationFaqDescriptor[]>>;

export function getIntegrationFaqDescriptors(slug: string): readonly IntegrationFaqDescriptor[] {
  if (slug in integrationFaqCopy) {
    return integrationFaqCopy[slug as keyof typeof integrationFaqCopy];
  }

  return [];
}
