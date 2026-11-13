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
import { and, asc, eq, ilike, inArray, not, or, sql } from "drizzle-orm";

import type { ApiAuthContext } from "@/api/auth/workos";
import { db, schema } from "@/lib/database/client";
import { getAccessibleFigmaProject } from "@/lib/figma/localize-file";
import { createGoSvcServerClient } from "@/lib/go-svc/go-svc-server-client";
import { canonicalizeLocale } from "@/lib/i18n/locales";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

/**
 * Design context links Figma text layers to the project's existing string keys (the
 * key store), not to the `figma.k.*` stamps the Upload flow creates. Keys stored under
 * the plugin's own `figma/files/` source paths are excluded so a design is matched to
 * product strings.
 */
const FIGMA_PLUGIN_SOURCE_PREFIX = "figma/files/";
const MAX_CANDIDATES_PER_TEXT = 5;
const SEARCH_LIMIT = 25;

export type FigmaDesignKey = {
  id: string;
  key: string;
  sourcePath: string | null;
  sourceText: string;
  maxLength: number | null;
};

export type FigmaKeyMatchInput = {
  nodeId: string;
  text: string;
  layerName?: string;
};

export type FigmaKeyMatch = {
  nodeId: string;
  /** `key_name` when the layer is named after the key; `source_text` for a text match. */
  matchedBy: "key_name" | "source_text" | null;
  /** Set only when the match is unambiguous. */
  key: FigmaDesignKey | null;
  candidates: FigmaDesignKey[];
};

export type FigmaKeyTranslation = {
  keyId: string;
  text: string | null;
  status: string | null;
  maxLength: number | null;
  sourceText: string;
};

function designKeyColumns() {
  return {
    id: schema.projectTranslationKeys.id,
    key: schema.projectTranslationKeys.key,
    sourcePath: schema.repositorySourceFiles.sourcePath,
    sourceText: schema.projectTranslationKeys.sourceText,
    maxLength: schema.projectTranslationKeys.maxLength,
  };
}

function productKeyScope(organizationId: string, projectId: string) {
  return and(
    eq(schema.projectTranslationKeys.organizationId, organizationId),
    eq(schema.projectTranslationKeys.projectId, projectId),
    eq(schema.projectTranslationKeys.isHidden, false),
    or(
      sql`${schema.repositorySourceFiles.sourcePath} is null`,
      not(ilike(schema.repositorySourceFiles.sourcePath, `${FIGMA_PLUGIN_SOURCE_PREFIX}%`)),
    ),
  );
}

async function requireFigmaProject(auth: ApiAuthContext, projectId: string) {
  const project = await getAccessibleFigmaProject(auth, projectId);
  if (!project) {
    throw new Error("figma_project_not_found");
  }
  return project;
}

/** Layer names like `checkout.title` or `checkout/title` name a key; plain words do not. */
export function keyNameFromLayerName(layerName: string | undefined): string | null {
  const trimmed = layerName?.trim();
  if (!trimmed || trimmed.length > 256 || /\s/.test(trimmed)) {
    return null;
  }
  if (!/[._/:-]/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function resolveFigmaKeyMatches(
  inputs: FigmaKeyMatchInput[],
  keysByName: Map<string, FigmaDesignKey[]>,
  keysByText: Map<string, FigmaDesignKey[]>,
): FigmaKeyMatch[] {
  return inputs.map((input) => {
    const keyName = keyNameFromLayerName(input.layerName);
    const named = keyName ? (keysByName.get(keyName) ?? []) : [];
    if (named.length === 1) {
      return { nodeId: input.nodeId, matchedBy: "key_name", key: named[0]!, candidates: named };
    }
    const byText = keysByText.get(normalizeTranslationMemorySourceText(input.text)) ?? [];
    // A layer named after a key that shares the text narrows an ambiguous text match.
    const narrowed =
      byText.length > 1 && named.length > 1
        ? byText.filter((key) => named.some((candidate) => candidate.id === key.id))
        : byText;
    const candidates = (narrowed.length > 0 ? narrowed : byText).slice(0, MAX_CANDIDATES_PER_TEXT);
    if (candidates.length === 1) {
      return {
        nodeId: input.nodeId,
        matchedBy: "source_text",
        key: candidates[0]!,
        candidates,
      };
    }
    return {
      nodeId: input.nodeId,
      matchedBy: candidates.length > 0 ? "source_text" : null,
      key: null,
      candidates,
    };
  });
}

function groupBy(rows: FigmaDesignKey[], pick: (row: FigmaDesignKey) => string) {
  const grouped = new Map<string, FigmaDesignKey[]>();
  for (const row of rows) {
    const id = pick(row);
    const list = grouped.get(id);
    if (list) {
      list.push(row);
    } else {
      grouped.set(id, [row]);
    }
  }
  return grouped;
}

export async function matchFigmaTextsToKeys(input: {
  auth: ApiAuthContext;
  projectId: string;
  texts: FigmaKeyMatchInput[];
}): Promise<FigmaKeyMatch[]> {
  await requireFigmaProject(input.auth, input.projectId);
  const organizationId = input.auth.organization.localOrganizationId;
  const normalizedTexts = [
    ...new Set(
      input.texts.map((entry) => normalizeTranslationMemorySourceText(entry.text)).filter(Boolean),
    ),
  ];
  const keyNames = [
    ...new Set(
      input.texts
        .map((entry) => keyNameFromLayerName(entry.layerName))
        .filter((name): name is string => name !== null),
    ),
  ];
  const matchers = [];
  if (normalizedTexts.length > 0) {
    matchers.push(inArray(schema.projectTranslationKeys.normalizedSourceText, normalizedTexts));
  }
  if (keyNames.length > 0) {
    matchers.push(inArray(schema.projectTranslationKeys.key, keyNames));
  }
  if (matchers.length === 0) {
    return resolveFigmaKeyMatches(input.texts, new Map(), new Map());
  }

  const rows = await db
    .select({
      ...designKeyColumns(),
      normalizedSourceText: schema.projectTranslationKeys.normalizedSourceText,
    })
    .from(schema.projectTranslationKeys)
    .leftJoin(
      schema.repositorySourceFiles,
      eq(schema.repositorySourceFiles.id, schema.projectTranslationKeys.repositorySourceFileId),
    )
    .where(and(productKeyScope(organizationId, input.projectId), or(...matchers)))
    .orderBy(asc(schema.projectTranslationKeys.key));

  const keys = rows.map(({ normalizedSourceText: _ignored, ...key }) => key);
  const keysByName = groupBy(keys, (key) => key.key);
  const keysByText = new Map<string, FigmaDesignKey[]>();
  rows.forEach((row, index) => {
    const list = keysByText.get(row.normalizedSourceText);
    if (list) {
      list.push(keys[index]!);
    } else {
      keysByText.set(row.normalizedSourceText, [keys[index]!]);
    }
  });
  return resolveFigmaKeyMatches(input.texts, keysByName, keysByText);
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function searchFigmaProjectKeys(input: {
  auth: ApiAuthContext;
  projectId: string;
  query: string;
}): Promise<FigmaDesignKey[]> {
  await requireFigmaProject(input.auth, input.projectId);
  const pattern = `%${escapeLikePattern(input.query.trim())}%`;
  return db
    .select(designKeyColumns())
    .from(schema.projectTranslationKeys)
    .leftJoin(
      schema.repositorySourceFiles,
      eq(schema.repositorySourceFiles.id, schema.projectTranslationKeys.repositorySourceFileId),
    )
    .where(
      and(
        productKeyScope(input.auth.organization.localOrganizationId, input.projectId),
        or(
          ilike(schema.projectTranslationKeys.key, pattern),
          ilike(schema.projectTranslationKeys.sourceText, pattern),
        ),
      ),
    )
    .orderBy(asc(schema.projectTranslationKeys.key))
    .limit(SEARCH_LIMIT);
}

/** Current text per key for one locale, for previewing translations in the design. */
export async function getFigmaKeyTranslations(input: {
  auth: ApiAuthContext;
  projectId: string;
  locale: string;
  keyIds: string[];
}): Promise<FigmaKeyTranslation[]> {
  const project = await requireFigmaProject(input.auth, input.projectId);
  const locale = canonicalizeLocale(input.locale) ?? input.locale;
  const organizationId = input.auth.organization.localOrganizationId;
  const keys = await db
    .select({
      id: schema.projectTranslationKeys.id,
      sourceText: schema.projectTranslationKeys.sourceText,
      maxLength: schema.projectTranslationKeys.maxLength,
    })
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.organizationId, organizationId),
        eq(schema.projectTranslationKeys.projectId, project.id),
        inArray(schema.projectTranslationKeys.id, input.keyIds),
      ),
    );
  if (keys.length === 0) {
    return [];
  }
  const isSource =
    (canonicalizeLocale(project.sourceLocale ?? "") ?? project.sourceLocale) === locale;
  const translations = isSource
    ? []
    : await db
        .select({
          keyId: schema.projectTranslations.translationKeyId,
          text: schema.projectTranslations.text,
          status: schema.projectTranslations.status,
        })
        .from(schema.projectTranslations)
        .where(
          and(
            eq(schema.projectTranslations.organizationId, organizationId),
            eq(schema.projectTranslations.projectId, project.id),
            eq(schema.projectTranslations.targetLocale, locale),
            inArray(
              schema.projectTranslations.translationKeyId,
              keys.map((key) => key.id),
            ),
          ),
        );
  const byKey = new Map(translations.map((row) => [row.keyId, row]));
  return keys.map((key) => {
    const translation = byKey.get(key.id);
    return {
      keyId: key.id,
      text: isSource ? key.sourceText : translation?.text || null,
      status: isSource ? "source" : (translation?.status ?? null),
      maxLength: key.maxLength,
      sourceText: key.sourceText,
    };
  });
}

export type FigmaFrameBinding = {
  translationKeyId: string;
  marker: { left: number; top: number; width: number; height: number } | null;
};

/** Store one frame as CAT visual context. Go-svc owns object storage for screenshots. */
export async function syncFigmaFrameVisualContext(input: {
  auth: ApiAuthContext;
  projectId: string;
  fileKey: string;
  nodeId: string;
  name?: string;
  figmaUrl: string;
  contentType: "image/png" | "image/jpeg";
  imageBase64: string;
  bindings: FigmaFrameBinding[];
}) {
  const project = await requireFigmaProject(input.auth, input.projectId);
  const client = createGoSvcServerClient();
  const { visualContext } = await client.cat.syncFigmaVisualContext({
    organizationId: input.auth.organization.localOrganizationId,
    projectId: project.id,
    fileKey: input.fileKey,
    nodeId: input.nodeId,
    name: input.name ?? null,
    figmaUrl: input.figmaUrl,
    contentType: input.contentType,
    imageBase64: input.imageBase64,
    bindings: input.bindings,
  });
  return visualContext;
}
