export type ContentfulConnectionFieldConfig = {
  fieldMode?: "auto" | "configured";
  fieldsByContentType?: Record<string, string[]>;
  overwriteDraftLocales?: boolean;
};

export type ContentfulConnectionSummary = {
  id: string;
  organizationId: string;
  projectId: string;
  displayName: string;
  spaceId: string;
  environmentId: string;
  sourceLocale: string;
  targetLocales: string[];
  contentTypeIds: string[];
  fieldConfig: ContentfulConnectionFieldConfig;
  enabled: boolean;
  validationStatus: string;
  validationMessage: string | null;
  lastValidatedAt: string | null;
  maskedTokenSuffix: string;
  webhook: {
    id: string;
    status: string;
    providerWebhookId: string | null;
    lastDeliveryId: string | null;
    lastDeliveredAt: string | null;
    lastError: string | null;
    url: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type ContentfulConnectionSecretResult = {
  connection: ContentfulConnectionSummary;
  webhookSecret: string | null;
};

export type ContentfulWebhookEvent = {
  eventType: string;
  providerEventId: string | null;
  dedupeKey: string;
  entryId: string | null;
  contentTypeId: string | null;
  revision: number | null;
  publishedVersion: number | null;
  redactedPayload: Record<string, unknown>;
};

export type ContentfulFieldDefinition = {
  id: string;
  name: string;
  type: string;
  localized?: boolean;
  linkType?: string;
  items?: {
    type?: string;
    linkType?: string;
  };
};

export type ContentfulAssetLink = {
  sys: {
    type: "Link";
    linkType: "Asset";
    id: string;
  };
};

export type ContentfulAsset = {
  sys: {
    id: string;
    version: number;
  };
  fields: {
    title?: Record<string, string>;
    description?: Record<string, string>;
    file?: Record<
      string,
      {
        url: string;
        fileName: string;
        contentType: string;
      }
    >;
  };
};

export type ContentfulContentType = {
  sys: {
    id: string;
  };
  fields: ContentfulFieldDefinition[];
};

export type ContentfulEntry = {
  sys: {
    id: string;
    version: number;
    contentType?: {
      sys?: {
        id?: string;
      };
    };
  };
  fields: Record<string, Record<string, unknown> | undefined>;
};

export type ContentfulTranslatableUnit = {
  kind: "text";
  externalStringId: string;
  key: string;
  fieldId: string;
  fieldName: string;
  sourceLocale: string;
  sourceValue: unknown;
  sourceText: string;
  existingTranslations: Array<{
    locale: string;
    text: string;
    value: unknown;
  }>;
  contentfulValueKind: "string" | "array" | "rich_text" | "json";
  embeddedAssetIds?: string[];
};

export type ContentfulImageUnit = {
  kind: "image";
  externalStringId: string;
  key: string;
  fieldId: string;
  fieldName: string;
  sourceLocale: string;
  sourceValue: unknown;
  assetId: string;
  existingLocales: string[];
};

export type ContentfulTranslatableFieldUnit = ContentfulTranslatableUnit | ContentfulImageUnit;

export type ContentfulDraftTranslation = {
  fieldId: string;
  locale: string;
  value: unknown;
};

export type ContentfulConnectionValidation = {
  environmentId: string;
  locales: Array<{
    code: string;
    name: string;
    default: boolean;
  }>;
};

export type ContentfulContentTypeSummary = {
  id: string;
  name: string;
};

export type ContentfulSpaceDiscovery = {
  environmentId: string;
  locales: Array<{
    code: string;
    name: string;
    default: boolean;
  }>;
  contentTypes: ContentfulContentTypeSummary[];
};

export type ContentfulConnectionValidationError = {
  code: "contentful_connection_validation_failed";
  message: string;
};

export type ContentfulAutomationExecutionSuccess = {
  runId: string;
};

export type ContentfulAutomationExecutionError = {
  code: "contentful_automation_failed";
  runId: string;
  message: string;
};
