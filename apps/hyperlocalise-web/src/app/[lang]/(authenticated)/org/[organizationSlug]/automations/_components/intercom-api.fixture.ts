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
import type {
  IntercomApiCollection,
  IntercomApiHelpCenter,
} from "@/lib/intercom/intercom-api.types";

/**
 * Fake Intercom REST payloads shaped like API 2.16:
 * https://developers.intercom.com/docs/references/rest-api/api.intercom.io/articles/article
 */

export type IntercomApiArticleContent = {
  type: "article_content";
  title: string;
  description: string;
  body: string;
  body_markdown: string;
  author_id: number;
  state: "published" | "draft";
  created_at: number;
  updated_at: number;
  has_unpublished_changes: boolean;
  draft_updated_at: number | null;
  url: string;
  audience_ids: number[];
  ai_chatbot_availability: boolean;
  ai_copilot_availability: boolean;
  ai_sales_agent_availability: boolean;
  created_by_id: number;
  updated_by_id: number;
};

export type IntercomApiArticleTranslatedContent = {
  type: "article_translated_content";
  ar?: IntercomApiArticleContent | null;
  bg?: IntercomApiArticleContent | null;
  de?: IntercomApiArticleContent | null;
  en?: IntercomApiArticleContent | null;
  es?: IntercomApiArticleContent | null;
  fr?: IntercomApiArticleContent | null;
  ja?: IntercomApiArticleContent | null;
  pt?: IntercomApiArticleContent | null;
  "pt-BR"?: IntercomApiArticleContent | null;
};

export type IntercomApiArticle = {
  type: "article";
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  body: string;
  body_markdown: string;
  author_id: number;
  state: "published" | "draft";
  created_at: number;
  updated_at: number;
  has_unpublished_changes: boolean;
  draft_updated_at: number | null;
  url: string;
  parent_ids: number[];
  ai_chatbot_availability: boolean;
  ai_copilot_availability: boolean;
  ai_sales_agent_availability: boolean;
  created_by_id: number;
  updated_by_id: number;
  exclude_from_article_suggestions: boolean;
  help_center_audience: "everyone" | "restricted";
  scheduled_publish_at: number | null;
  scheduled_unpublish_at: number | null;
  default_locale: string;
  translated_content: IntercomApiArticleTranslatedContent;
  tags: {
    type: "tag.list";
    tags: Array<{
      type: "tag";
      id: string;
      name: string;
    }>;
  };
  statistics: {
    type: "article_statistics";
    views: number;
    conversions: number;
    reactions: number;
    happy_reaction_percentage: number;
    neutral_reaction_percentage: number;
    sad_reaction_percentage: number;
  };
};

const WORKSPACE_ID = "tx2p130c";
const GETTING_STARTED_COLLECTION_ID = 38;
const BILLING_COLLECTION_ID = 52;

function articleContent(
  locale: string,
  slug: string,
  content: {
    title: string;
    description: string;
    body: string;
    markdown: string;
    state: "published" | "draft";
    created_at: number;
    updated_at: number;
    author_id: number;
    has_unpublished_changes?: boolean;
    draft_updated_at?: number | null;
  },
): IntercomApiArticleContent {
  return {
    type: "article_content",
    title: content.title,
    description: content.description,
    body: content.body,
    body_markdown: content.markdown,
    author_id: content.author_id,
    state: content.state,
    created_at: content.created_at,
    updated_at: content.updated_at,
    has_unpublished_changes: content.has_unpublished_changes ?? false,
    draft_updated_at: content.draft_updated_at ?? null,
    url: `https://intercom.help/acme-support/${locale}/articles/${slug}`,
    audience_ids: [],
    ai_chatbot_availability: true,
    ai_copilot_availability: true,
    ai_sales_agent_availability: false,
    created_by_id: content.author_id,
    updated_by_id: content.author_id,
  };
}

export const intercomApiHelpCentersFixture: IntercomApiHelpCenter[] = [
  {
    type: "help_center",
    id: "123",
    workspace_id: WORKSPACE_ID,
    created_at: 1665544931,
    updated_at: 1672318164,
    identifier: "acme-support",
    website_turned_on: true,
    display_name: "Customer Support",
    default: true,
    default_locale: "en",
    locales: ["en", "de", "fr"],
    translated_content: {
      type: "group_translated_content",
      de: { type: "group_content", name: "Kundensupport" },
      fr: { type: "group_content", name: "Assistance client" },
    },
  },
  {
    type: "help_center",
    id: "456",
    workspace_id: WORKSPACE_ID,
    created_at: 1680000000,
    updated_at: 1685000000,
    identifier: "acme-developers",
    website_turned_on: true,
    display_name: "Developer Docs",
    default: false,
    default_locale: "en",
    locales: ["en", "ja"],
    translated_content: {
      type: "group_translated_content",
      ja: { type: "group_content", name: "開発者ドキュメント" },
    },
  },
];

export const intercomApiArticlesFixture: IntercomApiArticle[] = [
  {
    type: "article",
    id: "4410",
    workspace_id: WORKSPACE_ID,
    title: "Billing and invoices",
    description: "Where to download invoices and update a payment method.",
    body: "<p>Go to <em>Settings → Billing</em> to download invoices or change your card.</p>",
    body_markdown: "Go to *Settings → Billing* to download invoices or change your card.",
    author_id: 22,
    state: "draft",
    created_at: 1675000000,
    updated_at: 1676000000,
    has_unpublished_changes: false,
    draft_updated_at: 1676000000,
    url: "https://intercom.help/acme-support/en/articles/4410-billing",
    parent_ids: [BILLING_COLLECTION_ID],
    ai_chatbot_availability: true,
    ai_copilot_availability: true,
    ai_sales_agent_availability: false,
    created_by_id: 22,
    updated_by_id: 22,
    exclude_from_article_suggestions: false,
    help_center_audience: "everyone",
    scheduled_publish_at: null,
    scheduled_unpublish_at: null,
    default_locale: "en",
    translated_content: {
      type: "article_translated_content",
    },
    tags: { type: "tag.list", tags: [] },
    statistics: {
      type: "article_statistics",
      views: 0,
      conversions: 0,
      reactions: 0,
      happy_reaction_percentage: 0,
      neutral_reaction_percentage: 0,
      sad_reaction_percentage: 0,
    },
  },
  {
    type: "article",
    id: "3102",
    workspace_id: WORKSPACE_ID,
    title: "Reset your password",
    description: "Steps to recover access if you forget your password.",
    body: "<p>Open the sign-in page and choose <strong>Forgot password</strong>. We email a reset link that expires in 30 minutes.</p>",
    body_markdown:
      "Open the sign-in page and choose **Forgot password**. We email a reset link that expires in 30 minutes.",
    author_id: 19,
    state: "published",
    created_at: 1668000000,
    updated_at: 1674000000,
    has_unpublished_changes: false,
    draft_updated_at: null,
    url: "https://intercom.help/acme-support/en/articles/3102-reset-password",
    parent_ids: [GETTING_STARTED_COLLECTION_ID],
    ai_chatbot_availability: true,
    ai_copilot_availability: true,
    ai_sales_agent_availability: false,
    created_by_id: 19,
    updated_by_id: 19,
    exclude_from_article_suggestions: false,
    help_center_audience: "everyone",
    scheduled_publish_at: null,
    scheduled_unpublish_at: null,
    default_locale: "en",
    translated_content: {
      type: "article_translated_content",
      de: articleContent("de", "3102-reset-password", {
        title: "Passwort zurücksetzen",
        description: "So stellen Sie den Zugang wieder her.",
        body: "<p>Öffnen Sie die Anmeldeseite und wählen Sie <strong>Passwort vergessen</strong>.</p>",
        markdown: "Öffnen Sie die Anmeldeseite und wählen Sie **Passwort vergessen**.",
        state: "published",
        created_at: 1673000000,
        updated_at: 1673000000,
        author_id: 19,
      }),
    },
    tags: {
      type: "tag.list",
      tags: [{ type: "tag", id: "1", name: "account" }],
    },
    statistics: {
      type: "article_statistics",
      views: 128,
      conversions: 12,
      reactions: 9,
      happy_reaction_percentage: 77,
      neutral_reaction_percentage: 11,
      sad_reaction_percentage: 12,
    },
  },
  {
    type: "article",
    id: "2048",
    workspace_id: WORKSPACE_ID,
    title: "Getting started with Acme",
    description: "Create an account and send your first message.",
    body: "<p>Welcome to Acme. Create an account, invite your team, and send your first message.</p>",
    body_markdown:
      "Welcome to Acme. Create an account, invite your team, and send your first message.",
    author_id: 19,
    state: "published",
    created_at: 1663597223,
    updated_at: 1672318164,
    has_unpublished_changes: true,
    draft_updated_at: 1672319000,
    url: "https://intercom.help/acme-support/en/articles/2048-getting-started",
    parent_ids: [GETTING_STARTED_COLLECTION_ID],
    ai_chatbot_availability: true,
    ai_copilot_availability: true,
    ai_sales_agent_availability: false,
    created_by_id: 19,
    updated_by_id: 19,
    exclude_from_article_suggestions: false,
    help_center_audience: "everyone",
    scheduled_publish_at: null,
    scheduled_unpublish_at: null,
    default_locale: "en",
    translated_content: {
      type: "article_translated_content",
      de: articleContent("de", "2048-getting-started", {
        title: "Erste Schritte mit Acme",
        description: "Konto anlegen und die erste Nachricht senden.",
        body: "<p>Willkommen bei Acme. Legen Sie ein Konto an, laden Sie Ihr Team ein und senden Sie Ihre erste Nachricht.</p>",
        markdown:
          "Willkommen bei Acme. Legen Sie ein Konto an, laden Sie Ihr Team ein und senden Sie Ihre erste Nachricht.",
        state: "draft",
        created_at: 1672317851,
        updated_at: 1672317851,
        author_id: 19,
      }),
      fr: articleContent("fr", "2048-getting-started", {
        title: "Premiers pas avec Acme",
        description: "Créez un compte et envoyez votre premier message.",
        body: "<p>Bienvenue chez Acme. Créez un compte, invitez votre équipe et envoyez votre premier message.</p>",
        markdown:
          "Bienvenue chez Acme. Créez un compte, invitez votre équipe et envoyez votre premier message.",
        state: "draft",
        created_at: 1672317900,
        updated_at: 1672317900,
        author_id: 19,
      }),
    },
    tags: {
      type: "tag.list",
      tags: [{ type: "tag", id: "2", name: "onboarding" }],
    },
    statistics: {
      type: "article_statistics",
      views: 2401,
      conversions: 188,
      reactions: 64,
      happy_reaction_percentage: 84,
      neutral_reaction_percentage: 10,
      sad_reaction_percentage: 6,
    },
  },
];

/** GET /articles — articles are newest `updated_at` first. */
export const intercomApiArticlesListResponse = {
  type: "list" as const,
  pages: {
    type: "pages" as const,
    page: 1,
    per_page: 25,
    total_pages: 1,
  },
  total_count: intercomApiArticlesFixture.length,
  data: intercomApiArticlesFixture,
};

export const intercomApiHelpCentersListResponse = {
  type: "list" as const,
  data: intercomApiHelpCentersFixture,
};

function localeKeysFromTranslatedContent(
  translatedContent: IntercomApiHelpCenter["translated_content"],
): string[] {
  if (!translatedContent) {
    return [];
  }
  return Object.keys(translatedContent).filter((key) => key !== "type");
}

export function mapIntercomHelpCentersFromApi(helpCenters: IntercomApiHelpCenter[]) {
  return helpCenters.map((center) => {
    const id = String(center.id);
    return {
      id,
      displayName: center.display_name ?? center.identifier ?? `Help Center ${id}`,
      identifier: center.identifier ?? id,
      defaultLocale: center.default_locale ?? null,
      locales:
        (center.locales ?? []).length > 0
          ? [...(center.locales ?? [])]
          : localeKeysFromTranslatedContent(center.translated_content),
    };
  });
}

export const intercomHelpCenterSummariesFixture = mapIntercomHelpCentersFromApi(
  intercomApiHelpCentersFixture,
);

export const intercomSupportHelpCenter = intercomHelpCenterSummariesFixture[0];

export const intercomApiCollectionsFixture: IntercomApiCollection[] = [
  {
    type: "collection" as const,
    id: String(GETTING_STARTED_COLLECTION_ID),
    name: "Getting started",
    help_center_id: 123,
  },
  {
    type: "collection" as const,
    id: String(BILLING_COLLECTION_ID),
    name: "Billing",
    help_center_id: 123,
  },
  {
    type: "collection" as const,
    id: "99",
    name: "Developer API",
    help_center_id: 456,
  },
];

export const intercomCollectionSummariesFixture = intercomApiCollectionsFixture
  .filter((collection) => collection.help_center_id === 123)
  .map((collection) => ({
    id: collection.id,
    name: collection.name,
    helpCenterId: String(collection.help_center_id),
    locales: [],
  }));
