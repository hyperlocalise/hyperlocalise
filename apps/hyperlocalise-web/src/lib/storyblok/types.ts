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
import type { StoryblokRegion } from "./constants";

export type StoryblokPipesConnectionStatus = {
  connected: boolean;
  needsReauthorization: boolean;
  apiKeyLast4?: string | null;
};

export type StoryblokPipesError = {
  code:
    | "storyblok_pipes_unavailable"
    | "storyblok_not_connected"
    | "storyblok_pipes_needs_reauthorization"
    | "storyblok_access_token_required";
  message: string;
};

export type StoryblokLanguage = {
  code: string;
  name: string;
};

export type StoryblokSpaceSummary = {
  id: string;
  name: string;
  region: string | null;
};

export type StoryblokSpace = StoryblokSpaceSummary & {
  /** Languages added under Settings → Internationalization. The default language is not listed. */
  languages: StoryblokLanguage[];
};

export type StoryblokStorySummary = {
  id: string;
  name: string;
  slug: string;
  fullSlug: string;
  isFolder: boolean;
  updatedAt: string | null;
};

export type StoryblokStoriesPage = {
  stories: StoryblokStorySummary[];
  total: number;
  page: number;
  perPage: number;
};

/** Flat export.json payload: content keys plus the meta keys Storyblok adds. */
export type StoryblokExportPayload = Record<string, string | number>;

export type StoryblokExportMeta = Partial<
  Record<"page" | "language" | "url" | "text_nodes", string | number>
>;

export type StoryblokConnectionValidationStatus =
  | "unvalidated"
  | "valid"
  | "invalid"
  | "needs_reauthorization";

export type StoryblokConnectionSummary = {
  id: string;
  organizationId: string;
  displayName: string;
  spaceId: string;
  region: StoryblokRegion;
  folderSlugs: string[];
  pipesWorkosUserId: string;
  enabled: boolean;
  validationStatus: StoryblokConnectionValidationStatus;
  validationMessage: string | null;
  lastValidatedAt: string | null;
  maskedTokenSuffix: string | null;
};

export type StoryblokDiscoveryResult = {
  spaces: StoryblokSpaceSummary[];
  space: StoryblokSpace | null;
  folders: StoryblokStorySummary[];
  /** False when the space's plan does not include translation export and import. */
  translationExportAvailable: boolean;
};

export type StoryblokClientError = {
  code: "storyblok_request_failed";
  status: number;
  message: string;
  operation?: string;
};
