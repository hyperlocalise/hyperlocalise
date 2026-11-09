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

export type WebflowPipesConnectionStatus = {
  connected: boolean;
  needsReauthorization: boolean;
  apiKeyLast4?: string | null;
};

export type WebflowPipesError = {
  code:
    | "webflow_pipes_unavailable"
    | "webflow_not_connected"
    | "webflow_pipes_needs_reauthorization"
    | "webflow_site_token_required";
  message: string;
};

export type WebflowLocale = {
  id: string;
  cmsLocaleId: string;
  tag: string;
  enabled: boolean;
  subdirectory?: string | null;
};

export type WebflowSiteLocales = {
  primary: WebflowLocale;
  secondary: WebflowLocale[];
};

export type WebflowSiteSummary = {
  id: string;
  displayName: string;
  lastPublished?: string | null;
  lastUpdated?: string | null;
};

export type WebflowSite = WebflowSiteSummary & {
  locales: WebflowSiteLocales;
};

export type WebflowCollectionSummary = {
  id: string;
  displayName: string;
  slug: string;
  lastUpdated?: string | null;
};

export type WebflowCollectionFieldType =
  | "PlainText"
  | "RichText"
  | "Option"
  | "Reference"
  | "MultiReference"
  | "Image"
  | "File"
  | "Link"
  | "Email"
  | "Phone"
  | "Number"
  | "DateTime"
  | "Switch"
  | "Color"
  | "VideoLink"
  | "User";

export type WebflowCollectionField = {
  id: string;
  slug: string;
  displayName: string;
  type: WebflowCollectionFieldType;
  isRequired?: boolean;
};

export type WebflowCollection = WebflowCollectionSummary & {
  fields: WebflowCollectionField[];
};

export type WebflowCollectionItemFieldData = Record<string, unknown>;

export type WebflowCollectionItem = {
  id: string;
  cmsLocaleId?: string | null;
  lastPublished?: string | null;
  lastUpdated?: string | null;
  createdOn?: string | null;
  isArchived?: boolean;
  isDraft?: boolean;
  fieldData: WebflowCollectionItemFieldData;
};

export type WebflowPagination = {
  limit: number;
  offset: number;
  total: number;
};

export type WebflowConnectionValidationStatus =
  | "unvalidated"
  | "valid"
  | "invalid"
  | "needs_reauthorization";

export type WebflowConnectionSummary = {
  id: string;
  organizationId: string;
  displayName: string;
  siteId: string;
  collectionIds: string[];
  pipesWorkosUserId: string;
  enabled: boolean;
  validationStatus: WebflowConnectionValidationStatus;
  validationMessage: string | null;
  lastValidatedAt: string | null;
  maskedTokenSuffix: string | null;
};

export type WebflowDiscoveryResult = {
  sites: WebflowSiteSummary[];
  site: WebflowSite | null;
  collections: WebflowCollectionSummary[];
  locales: WebflowSiteLocales | null;
  scopes: {
    sitesRead: boolean;
    cmsRead: boolean;
    cmsWrite: boolean;
    componentsRead: boolean;
  };
};

export type WebflowClientError = {
  code: "webflow_request_failed";
  status: number;
  message: string;
  operation?: string;
};
