import {
  createLocalizedAssetCache,
  type LocalizedAssetCache,
} from "@/lib/contentful/automation-executor";
import type { ContentfulManagementClient } from "@/lib/contentful/client";
import type {
  ContentfulAutomationExecutionSuccess,
  ContentfulConnectionFieldConfig,
  ContentfulDraftTranslation,
  ContentfulTranslatableFieldUnit,
} from "@/lib/contentful/types";
import type { StringTranslationGenerator } from "@/lib/translation/domain";

export type ContentfulAgentSession = {
  organizationId: string;
  runId: string;
  entryId: string;
  workspaceAutomationRunId: string;
  projectId: string;
  instructions: string;
  userBindingContext?: string | null;
  sourceLocale: string;
  targetLocales: string[];
  runQa: boolean;
  writeDrafts: boolean;
  overwriteDraftLocales: boolean;
  fieldConfig: ContentfulConnectionFieldConfig;
  client: ContentfulManagementClient;
  translateStringJob: StringTranslationGenerator;
  projectName: string;
  projectTranslationContext: string;
  localizedAssetCache: LocalizedAssetCache;
  entry?: Record<string, unknown>;
  contentType?: Record<string, unknown>;
  units: ContentfulTranslatableFieldUnit[];
  translations: ContentfulDraftTranslation[];
  qaFindings: Array<Record<string, unknown>>;
  defaultLocale?: string;
  executionResult?: ContentfulAutomationExecutionSuccess;
  executionError?: string;
};

export function createContentfulAgentSession(
  input: Omit<
    ContentfulAgentSession,
    "units" | "translations" | "qaFindings" | "localizedAssetCache"
  >,
): ContentfulAgentSession {
  return {
    ...input,
    units: [],
    translations: [],
    qaFindings: [],
    localizedAssetCache: createLocalizedAssetCache(),
  };
}
