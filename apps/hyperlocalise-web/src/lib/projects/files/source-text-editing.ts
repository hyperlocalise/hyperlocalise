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
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";

import { writeJsonSourceText } from "./json-source-text-writer";
import { isSourceEditableSourcePath } from "./source-text-editable-paths";

export { isSourceEditableSourcePath } from "./source-text-editable-paths";

/** A list item, by the importer's flattened key (`items[2]`, `a.b[0].c`). */
const LIST_ITEM = /\[\d+\]/;

/**
 * The file as the project has it now: the stored (or repository) bytes with the source text
 * edited in the project written in, for a JSON-family file in a project that lets source text be
 * edited here. Anything else comes back as it was. Readers that turn a source file into work
 * (translation jobs) or send it on (GitLab delivery) use this, so they see the edited text.
 *
 * A list item that clashes is left as the file has it: an item inserted above it in the file
 * shifts the others, so the clash may be a neighbour in its place. Both readers follow this, so a
 * job never translates text the merge request won't send.
 */
export async function applyProjectSourceText(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  content: Buffer;
}): Promise<{ content: Buffer; written: string[] }> {
  const unchanged = { content: input.content, written: [] };
  // A Lottie animation's text keys (`layers[0].t.d.k[0].s.t`) are its JSON paths, so it is
  // written like any other JSON file.
  if (!isSourceEditableSourcePath(input.sourcePath)) {
    return unchanged;
  }
  const [project] = await db
    .select({ sourceTextEditable: schema.projects.sourceTextEditable })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, input.projectId),
        eq(schema.projects.organizationId, input.organizationId),
      ),
    );
  if (!project?.sourceTextEditable) {
    return unchanged;
  }
  const edited = await loadEditedSourceTexts(input);
  if (edited.size === 0) {
    return unchanged;
  }
  const outcome = writeJsonSourceText(
    input.content,
    Object.fromEntries([...edited].map(([key, row]) => [key, row.sourceText])),
    (key, fileText) => !LIST_ITEM.test(key) || fileText === edited.get(key)!.importedSourceText,
  );
  return outcome.kind === "file"
    ? { content: outcome.content, written: outcome.written }
    : unchanged;
}

/**
 * Keys of the file whose source text was edited in the project: it differs from the text last
 * imported. Keys hidden, by hand or by a sync, are left as the file has them.
 */
async function loadEditedSourceTexts(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
}): Promise<Map<string, { sourceText: string; importedSourceText: string }>> {
  const rows = await db
    .select({
      key: schema.projectTranslationKeys.key,
      sourceText: schema.projectTranslationKeys.sourceText,
      importedSourceText: schema.projectTranslationKeys.importedSourceText,
    })
    .from(schema.projectTranslationKeys)
    .innerJoin(
      schema.repositorySourceFiles,
      eq(schema.repositorySourceFiles.id, schema.projectTranslationKeys.repositorySourceFileId),
    )
    .where(
      and(
        eq(schema.projectTranslationKeys.organizationId, input.organizationId),
        eq(schema.projectTranslationKeys.projectId, input.projectId),
        eq(schema.repositorySourceFiles.sourcePath, input.sourcePath),
        eq(schema.projectTranslationKeys.isHidden, false),
        isNotNull(schema.projectTranslationKeys.importedSourceText),
        ne(
          schema.projectTranslationKeys.sourceText,
          sql`${schema.projectTranslationKeys.importedSourceText}`,
        ),
      ),
    );
  return new Map(
    rows.map((row) => [
      row.key,
      { sourceText: row.sourceText, importedSourceText: row.importedSourceText ?? "" },
    ]),
  );
}
