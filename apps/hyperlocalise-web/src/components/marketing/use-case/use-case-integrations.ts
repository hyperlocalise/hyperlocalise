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

/** Product names are proper nouns and stay untranslated. */
export const USE_CASE_INTEGRATIONS = {
  github: { name: "GitHub", logo: "/images/github-logo.svg", invertInDark: true },
  slack: { name: "Slack", logo: "/images/slack-logo.svg" },
  teams: { name: "Microsoft Teams", logo: "/images/microsoft-teams-logo.svg" },
  figma: { name: "Figma", logo: "/images/figma-logo.svg" },
  canva: { name: "Canva", logo: "/images/canva-logo.svg" },
  notion: { name: "Notion", logo: "/images/notion.svg", invertInDark: true },
  sharepoint: { name: "SharePoint", logo: "/images/sharepoint-logo.svg" },
  contentful: { name: "Contentful", logo: "/images/contentful-logo.svg" },
  intercom: { name: "Intercom", logo: "/images/intercom-logo.svg", invertInDark: true },
  hubspot: { name: "HubSpot", logo: "/images/hubspot-logo.svg" },
  mailchimp: { name: "Mailchimp", logo: "/images/mailchimp-logo.svg" },
  braze: { name: "Braze", logo: "/images/braze-logo.svg" },
  semrush: { name: "Semrush", logo: "/images/semrush-logo.svg" },
  ahrefs: { name: "Ahrefs", logo: "/images/ahrefs-logo.svg" },
  crowdin: { name: "Crowdin", logo: "/images/tms/crowdin.png" },
  lokalise: { name: "Lokalise", logo: "/images/tms/lokalise.webp" },
  phrase: { name: "Phrase", logo: "/images/tms/phrase.png" },
  smartling: { name: "Smartling", logo: "/images/tms/smartling.png" },
  anthropic: { name: "Claude", logo: "/images/model-providers/anthropic.svg", invertInDark: true },
  openai: { name: "OpenAI", logo: "/images/model-providers/openai.svg", invertInDark: true },
  gemini: { name: "Gemini", logo: "/images/model-providers/gemini.svg" },
} as const satisfies Record<string, { name: string; logo: string; invertInDark?: boolean }>;

export type UseCaseIntegrationId = keyof typeof USE_CASE_INTEGRATIONS;
