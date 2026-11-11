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

import { db, schema } from "@/lib/database/client";
import { isErr, ok, type Result } from "@/lib/primitives/result/results";

import { listAllBrazeContentBlocks, listAllBrazeEmailTemplates } from "./client";
import { collectKnownBrazeCopyIds, shouldSkipBrazeLibraryItem } from "./copy-filter";
import { loadBrazeAutomationClient } from "./credentials";
import { mapProjectLocalesToBraze } from "./locale";
import type { BrazeSettingsError } from "./types";

export type BrazeLibraryPickerItem = { id: string; name: string };

export async function listBrazeLibraryForPicker(input: {
  localOrganizationId: string;
  workosUserId: string;
  projectId?: string | null;
}): Promise<
  Result<
    {
      templates: BrazeLibraryPickerItem[];
      contentBlocks: BrazeLibraryPickerItem[];
    },
    BrazeSettingsError
  >
> {
  const loaded = await loadBrazeAutomationClient({
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(loaded)) {
    return loaded;
  }

  const mappings = await db
    .select({ localeCopyIds: schema.brazeTemplateSyncStates.localeCopyIds })
    .from(schema.brazeTemplateSyncStates)
    .where(eq(schema.brazeTemplateSyncStates.organizationId, input.localOrganizationId));
  const knownCopyIds = collectKnownBrazeCopyIds(mappings);

  let suffixes: string[] = [];
  if (input.projectId) {
    const [project] = await db
      .select({
        sourceLocale: schema.projects.sourceLocale,
        targetLocales: schema.projects.targetLocales,
      })
      .from(schema.projects)
      .where(eq(schema.projects.id, input.projectId))
      .limit(1);
    if (project) {
      suffixes = mapProjectLocalesToBraze({
        projectSourceLocale: project.sourceLocale ?? "en",
        projectTargetLocales: Array.isArray(project.targetLocales)
          ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
          : [],
      }).brazeSuffixes;
    }
  }

  const [templates, contentBlocks] = await Promise.all([
    listAllBrazeEmailTemplates(loaded.value.client),
    listAllBrazeContentBlocks(loaded.value.client),
  ]);

  return ok({
    templates: templates
      .filter(
        (item) =>
          !shouldSkipBrazeLibraryItem({
            id: item.email_template_id,
            name: item.template_name,
            knownCopyIds,
            suffixes,
          }),
      )
      .map((item) => ({ id: item.email_template_id, name: item.template_name })),
    contentBlocks: contentBlocks
      .filter(
        (item) =>
          !shouldSkipBrazeLibraryItem({
            id: item.content_block_id,
            name: item.name,
            knownCopyIds,
            suffixes,
          }),
      )
      .map((item) => ({ id: item.content_block_id, name: item.name })),
  });
}
