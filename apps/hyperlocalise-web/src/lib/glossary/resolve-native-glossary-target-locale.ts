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
import { eq } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database";
import { GlossaryValidationError } from "@/lib/glossary/glossary";

export type ResolveNativeGlossaryTargetLocaleInput = {
  glossary: { id: string; targetLocale: string | null };
  projectId?: string | null;
  explicitTargetLocale?: string;
  database?: DatabaseClient;
};

export type ResolveNativeGlossaryTargetLocaleResult =
  | { locale: string }
  | { error: "missing" | "ambiguous"; locales: string[] };

export async function resolveNativeGlossaryTargetLocale(
  input: ResolveNativeGlossaryTargetLocaleInput,
): Promise<ResolveNativeGlossaryTargetLocaleResult> {
  if (input.glossary.targetLocale) {
    return { locale: input.glossary.targetLocale };
  }

  const database = input.database ?? db;

  if (input.projectId) {
    const [project] = await database
      .select({ targetLocales: schema.projects.targetLocales })
      .from(schema.projects)
      .where(eq(schema.projects.id, input.projectId))
      .limit(1);
    const targetLocale = project?.targetLocales?.[0];
    if (targetLocale) {
      return { locale: targetLocale };
    }
    return { error: "missing", locales: [] };
  }

  const attachedProjects = await database
    .select({ targetLocales: schema.projects.targetLocales })
    .from(schema.projectGlossaries)
    .innerJoin(schema.projects, eq(schema.projectGlossaries.projectId, schema.projects.id))
    .where(eq(schema.projectGlossaries.glossaryId, input.glossary.id));

  const locales = [
    ...new Set(attachedProjects.flatMap((project) => project.targetLocales ?? []).filter(Boolean)),
  ];

  if (locales.length === 0) {
    return { error: "missing", locales: [] };
  }

  if (input.explicitTargetLocale) {
    if (locales.includes(input.explicitTargetLocale)) {
      return { locale: input.explicitTargetLocale };
    }
    return { error: "ambiguous", locales };
  }

  if (locales.length === 1) {
    return { locale: locales[0]! };
  }

  return { error: "ambiguous", locales };
}

export function assertNativeGlossaryTargetLocale(
  resolution: ResolveNativeGlossaryTargetLocaleResult,
): string {
  if ("locale" in resolution) {
    return resolution.locale;
  }

  if (resolution.error === "missing") {
    throw new GlossaryValidationError(
      "glossary_target_locale_required",
      "Cannot create a source/target term pair without a target locale. Attach a project or specify targetLocale.",
    );
  }

  throw new GlossaryValidationError(
    "glossary_target_locale_ambiguous",
    `Multiple target locales are attached (${resolution.locales.join(", ")}). Specify targetLocale.`,
    { locales: resolution.locales },
  );
}
