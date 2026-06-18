import type { ToolSet } from "ai";
import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { executeTranslateString } from "@/agents/_runtime/shared-tools/translate_string";
import { detectContentfulTranslatableFields } from "@/lib/contentful/field-detector";
import {
  contentfulQaFindingsContainError,
  ensureLocalizedAssets,
} from "@/lib/contentful/automation-executor";
import { ContentfulManagementClient } from "@/lib/contentful/client";
import { isErr } from "@/lib/primitives/result/results";
import { loadContentfulConnectionWithToken } from "@/lib/contentful/connections";
import type { ContentfulContentType, ContentfulEntry } from "@/lib/contentful/types";

import type { ContentfulAgentSession } from "../context";

function collectBasicQaFindings(input: {
  unit: { fieldId: string; sourceText: string };
  locale: string;
  translatedText: string;
}) {
  const PLACEHOLDER_REGEX = /(\{\{[^}]+\}\}|\{[A-Za-z0-9_.-]+\}|%[sdif])/g;
  const URL_REGEX = /https?:\/\/[^\s)]+/g;
  const findings: Array<Record<string, unknown>> = [];
  const sourcePlaceholders = new Set(input.unit.sourceText.match(PLACEHOLDER_REGEX) ?? []);
  const targetPlaceholders = new Set(input.translatedText.match(PLACEHOLDER_REGEX) ?? []);
  for (const placeholder of sourcePlaceholders) {
    if (!targetPlaceholders.has(placeholder)) {
      findings.push({
        checkType: "placeholder_mismatch",
        severity: "error",
        locale: input.locale,
        fieldId: input.unit.fieldId,
        placeholder,
      });
    }
  }

  const sourceLinks = new Set(input.unit.sourceText.match(URL_REGEX) ?? []);
  const targetLinks = new Set(input.translatedText.match(URL_REGEX) ?? []);
  for (const link of sourceLinks) {
    if (!targetLinks.has(link)) {
      findings.push({
        checkType: "markdown_link",
        severity: "warning",
        locale: input.locale,
        fieldId: input.unit.fieldId,
        link,
      });
    }
  }

  return findings;
}

export function buildContentfulAgentTools(session: ContentfulAgentSession): ToolSet {
  const tools = {} as ToolSet;

  tools.fetch_entry = defineAgentTool({
    description: "Fetch the Contentful entry and content type for the current automation run.",
    inputSchema: z.object({}),
    execute: async () => {
      const entryResult = await session.client.getEntry(session.entryId);
      if (isErr(entryResult)) {
        throw entryResult.error;
      }

      session.entry = entryResult.value as unknown as Record<string, unknown>;
      const contentTypeId = entryResult.value.sys?.contentType?.sys?.id;
      if (!contentTypeId) {
        throw new Error("contentful_entry_missing_content_type");
      }

      const contentTypeResult = await session.client.getContentType(contentTypeId);
      if (isErr(contentTypeResult)) {
        throw contentTypeResult.error;
      }

      session.contentType = contentTypeResult.value as unknown as Record<string, unknown>;
      return {
        entryId: session.entryId,
        contentTypeId,
        fieldCount: Object.keys(
          (entryResult.value as { fields?: Record<string, unknown> }).fields ?? {},
        ).length,
      };
    },
  });

  tools.list_translatable_fields = defineAgentTool({
    description: "Detect translatable fields on the loaded Contentful entry.",
    inputSchema: z.object({}),
    execute: async () => {
      if (!session.entry || !session.contentType) {
        throw new Error("fetch_entry_required");
      }

      const fieldConfig = session.fieldConfig;
      session.units = detectContentfulTranslatableFields({
        entry: session.entry as ContentfulEntry,
        contentType: session.contentType as ContentfulContentType,
        sourceLocale: session.sourceLocale,
        targetLocales: session.targetLocales,
        fieldConfig,
        overwriteDraftLocales: session.overwriteDraftLocales,
        defaultLocale: session.defaultLocale,
      });

      return {
        count: session.units.length,
        fields: session.units.map((unit) => ({
          fieldId: unit.fieldId,
          kind: unit.kind,
        })),
      };
    },
  });

  tools.translate_string = defineAgentTool({
    description: "Translate a source string into target locales for a Contentful field.",
    inputSchema: z.object({
      fieldId: z.string(),
      sourceText: z.string(),
      targetLocales: z.array(z.string()).optional(),
    }),
    execute: async ({ fieldId, sourceText, targetLocales }) => {
      const locales = targetLocales ?? session.targetLocales;
      const result = await executeTranslateString({
        projectId: session.projectId,
        sourceText,
        targetLocales: locales,
        sourceLocale: session.sourceLocale,
        context: session.instructions,
      });

      for (const translation of result.translations) {
        session.translations.push({
          fieldId,
          locale: translation.locale,
          value: translation.text,
        });
      }

      return result;
    },
  });

  if (session.runQa) {
    tools.run_qa = defineAgentTool({
      description: "Run QA checks on translated field text.",
      inputSchema: z.object({
        fieldId: z.string(),
        locale: z.string(),
        sourceText: z.string(),
        translatedText: z.string(),
      }),
      execute: async (input) => {
        const findings = collectBasicQaFindings({
          unit: {
            fieldId: input.fieldId,
            sourceText: input.sourceText,
          },
          locale: input.locale,
          translatedText: input.translatedText,
        });
        session.qaFindings.push(...findings);
        return { findings, hasErrors: contentfulQaFindingsContainError(findings) };
      },
    });
  }

  if (session.writeDrafts) {
    tools.write_drafts = defineAgentTool({
      description: "Write accumulated draft translations back to Contentful.",
      inputSchema: z.object({
        translations: z
          .array(
            z.object({
              fieldId: z.string(),
              locale: z.string(),
              value: z.unknown(),
            }),
          )
          .optional(),
      }),
      execute: async ({ translations }) => {
        const payload = translations ?? session.translations;
        if (!session.entry || payload.length === 0) {
          return { fieldsWritten: 0, localeValuesWritten: 0 };
        }

        const updatedEntryResult = await session.client.updateEntryDraft({
          entry: session.entry as never,
          translations: payload,
        });
        if (isErr(updatedEntryResult)) {
          throw updatedEntryResult.error;
        }

        session.entry = updatedEntryResult.value as unknown as Record<string, unknown>;
        return {
          fieldsWritten: new Set(payload.map((item) => item.fieldId)).size,
          localeValuesWritten: payload.length,
        };
      },
    });
  }

  tools.localize_asset = defineAgentTool({
    description: "Localize a Contentful asset for a target locale.",
    inputSchema: z.object({
      fieldName: z.string(),
      assetId: z.string(),
      targetLocale: z.string(),
    }),
    execute: async ({ fieldName, assetId, targetLocale }) => {
      const localized = await ensureLocalizedAssets({
        client: session.client,
        sourceLocale: session.sourceLocale,
        targetLocale,
        fieldName,
        assetIds: [assetId],
        cache: session.localizedAssetCache,
      });
      return { localizedAssetId: localized.get(assetId) ?? null };
    },
  });

  return tools;
}

export async function loadContentfulAgentClient(input: {
  organizationId: string;
  connectionId: string;
}) {
  const loaded = await loadContentfulConnectionWithToken(input);
  if (!loaded) {
    throw new Error("contentful_connection_not_found");
  }
  if (!loaded.connection.enabled) {
    throw new Error("contentful_connection_disabled");
  }

  const client = new ContentfulManagementClient({
    accessToken: loaded.token,
    spaceId: loaded.connection.spaceId,
    environmentId: loaded.connection.environmentId,
  });

  return { client, connection: loaded.connection };
}
