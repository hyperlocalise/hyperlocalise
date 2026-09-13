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
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { conflictResponse } from "@/api/response.schema";
import { db, schema, type DatabaseClient } from "@/lib/database/client";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import {
  chunkItems,
  normalizeSpellcheckWord,
  parseSpellcheckWordFile,
  selectSpellcheckWordsToImport,
  serializeSpellcheckWordFile,
  SPELLCHECK_MAX_LIBRARY_WORDS,
  SPELLCHECK_WORD_INSERT_CHUNK_SIZE,
} from "@/lib/spellcheck-dictionary/normalize-word";

import { getOwnedProject, projectNotFoundResponse } from "../project/project.shared";
import {
  attachDictionaryProjectBodySchema,
  createDictionaryBodySchema,
  createDictionaryWordBodySchema,
  dictionaryIdParamsSchema,
  dictionaryProjectParamsSchema,
  dictionaryWordIdParamsSchema,
  exportDictionaryWordsQuerySchema,
  importDictionaryWordsBodySchema,
  listDictionaryQuerySchema,
  listDictionaryWordsQuerySchema,
  updateDictionaryBodySchema,
} from "./dictionary.schema";
import {
  dictionaryNotFoundResponse,
  dictionaryProjectAttachmentOrderBy,
  forbiddenResponse,
  getOwnedDictionary,
  invalidDictionaryPayloadResponse,
  isDictionaryMutationAllowed,
  lockSpellcheckDictionaryWords,
  resolveAttachmentPriority,
  toDictionaryRecord,
} from "./dictionary.shared";

const validateDictionaryParams = validator("param", (value, c) => {
  const parsed = dictionaryIdParamsSchema.safeParse(value);
  if (!parsed.success) {
    return dictionaryNotFoundResponse(c);
  }
  return parsed.data;
});

const validateDictionaryWordParams = validator("param", (value, c) => {
  const parsed = dictionaryWordIdParamsSchema.safeParse(value);
  if (!parsed.success) {
    return dictionaryNotFoundResponse(c);
  }
  return parsed.data;
});

const validateDictionaryProjectParams = validator("param", (value, c) => {
  const parsed = dictionaryProjectParamsSchema.safeParse(value);
  if (!parsed.success) {
    return dictionaryNotFoundResponse(c);
  }
  return parsed.data;
});

const validateCreateDictionaryBody = validator("json", (value, c) => {
  const parsed = createDictionaryBodySchema.safeParse(value);
  if (!parsed.success) {
    return invalidDictionaryPayloadResponse(c);
  }
  return parsed.data;
});

const validateUpdateDictionaryBody = validator("json", (value, c) => {
  const parsed = updateDictionaryBodySchema.safeParse(value);
  if (!parsed.success) {
    return invalidDictionaryPayloadResponse(c);
  }
  return parsed.data;
});

const validateCreateDictionaryWordBody = validator("json", (value, c) => {
  const parsed = createDictionaryWordBodySchema.safeParse(value);
  if (!parsed.success) {
    return invalidDictionaryPayloadResponse(c);
  }
  return parsed.data;
});

const validateImportDictionaryWordsBody = validator("json", (value, c) => {
  const parsed = importDictionaryWordsBodySchema.safeParse(value);
  if (!parsed.success) {
    return invalidDictionaryPayloadResponse(c);
  }
  return parsed.data;
});

const validateAttachDictionaryProjectBody = validator("json", (value, c) => {
  const parsed = attachDictionaryProjectBodySchema.safeParse(value);
  if (!parsed.success) {
    return invalidDictionaryPayloadResponse(c);
  }
  return parsed.data;
});

const validateListDictionaryQuery = validator("query", (value) => {
  const parsed = listDictionaryQuerySchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
});

const validateListDictionaryWordsQuery = validator("query", (value, c) => {
  const parsed = listDictionaryWordsQuerySchema.safeParse(value);
  if (!parsed.success) {
    return invalidDictionaryPayloadResponse(c);
  }
  return parsed.data;
});

const validateExportDictionaryWordsQuery = validator("query", (value, c) => {
  const parsed = exportDictionaryWordsQuerySchema.safeParse(value);
  if (!parsed.success) {
    return invalidDictionaryPayloadResponse(c);
  }
  return parsed.data;
});

async function dictionaryWordCount(client: DatabaseClient, dictionaryId: string) {
  const [row] = await client
    .select({ total: count() })
    .from(schema.spellcheckDictionaryWords)
    .where(eq(schema.spellcheckDictionaryWords.dictionaryId, dictionaryId));
  return Number(row?.total ?? 0);
}

async function bumpDictionaryWordsVersion(client: DatabaseClient, dictionaryId: string) {
  await client
    .update(schema.spellcheckDictionaries)
    .set({
      wordsVersion: sql`${schema.spellcheckDictionaries.wordsVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(schema.spellcheckDictionaries.id, dictionaryId));
}

export function createDictionaryRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", validateListDictionaryQuery, async (c) => {
      const query = c.req.valid("query");
      const organizationId = c.var.auth.organization.localOrganizationId;
      const limit = query?.limit ?? 50;
      const offset = query?.offset ?? 0;

      const projectFilter = query?.projectId
        ? db
            .select({ dictionaryId: schema.projectSpellcheckDictionaries.dictionaryId })
            .from(schema.projectSpellcheckDictionaries)
            .where(
              and(
                eq(schema.projectSpellcheckDictionaries.projectId, query.projectId),
                eq(schema.projectSpellcheckDictionaries.organizationId, organizationId),
              ),
            )
        : null;

      const where = projectFilter
        ? and(
            eq(schema.spellcheckDictionaries.organizationId, organizationId),
            inArray(schema.spellcheckDictionaries.id, projectFilter),
          )
        : eq(schema.spellcheckDictionaries.organizationId, organizationId);

      const [dictionaries, totalRow] = await Promise.all([
        db
          .select()
          .from(schema.spellcheckDictionaries)
          .where(where)
          .orderBy(desc(schema.spellcheckDictionaries.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(schema.spellcheckDictionaries).where(where),
      ]);

      const records = await mapWithConcurrency(dictionaries, 10, async (dictionary) =>
        toDictionaryRecord(dictionary, { wordCount: await dictionaryWordCount(db, dictionary.id) }),
      );

      return c.json({ dictionaries: records, total: Number(totalRow[0]?.total ?? 0) }, 200);
    })
    .post("/", validateCreateDictionaryBody, async (c) => {
      if (!isDictionaryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const payload = c.req.valid("json");
      const [dictionary] = await db
        .insert(schema.spellcheckDictionaries)
        .values({
          organizationId: c.var.auth.organization.localOrganizationId,
          createdByUserId: c.var.auth.user.localUserId,
          name: payload.name,
          description: payload.description ?? "",
        })
        .returning();

      return c.json({ dictionary: toDictionaryRecord(dictionary, { wordCount: 0 }) }, 201);
    })
    .get("/:dictionaryId", validateDictionaryParams, async (c) => {
      const dictionary = await getOwnedDictionary(c.var.auth, c.req.valid("param").dictionaryId);
      if (!dictionary) {
        return dictionaryNotFoundResponse(c);
      }

      return c.json({
        dictionary: toDictionaryRecord(dictionary, {
          wordCount: await dictionaryWordCount(db, dictionary.id),
        }),
      });
    })
    .patch("/:dictionaryId", validateDictionaryParams, validateUpdateDictionaryBody, async (c) => {
      if (!isDictionaryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const dictionary = await getOwnedDictionary(c.var.auth, c.req.valid("param").dictionaryId);
      if (!dictionary) {
        return dictionaryNotFoundResponse(c);
      }

      const payload = c.req.valid("json");
      const [updated] = await db
        .update(schema.spellcheckDictionaries)
        .set({
          ...(payload.name !== undefined ? { name: payload.name } : {}),
          ...(payload.description !== undefined ? { description: payload.description } : {}),
          ...(payload.status !== undefined ? { status: payload.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.spellcheckDictionaries.id, dictionary.id))
        .returning();

      return c.json({
        dictionary: toDictionaryRecord(updated, {
          wordCount: await dictionaryWordCount(db, updated.id),
        }),
      });
    })
    .delete("/:dictionaryId", validateDictionaryParams, async (c) => {
      if (!isDictionaryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const dictionary = await getOwnedDictionary(c.var.auth, c.req.valid("param").dictionaryId);
      if (!dictionary) {
        return dictionaryNotFoundResponse(c);
      }

      await db
        .delete(schema.spellcheckDictionaries)
        .where(eq(schema.spellcheckDictionaries.id, dictionary.id));
      return c.body(null, 204);
    })
    .get(
      "/:dictionaryId/words",
      validateDictionaryParams,
      validateListDictionaryWordsQuery,
      async (c) => {
        const dictionary = await getOwnedDictionary(c.var.auth, c.req.valid("param").dictionaryId);
        if (!dictionary) {
          return dictionaryNotFoundResponse(c);
        }

        const query = c.req.valid("query");
        const locale = query?.locale;
        const limit = query?.limit ?? 100;
        const offset = query?.offset ?? 0;
        const where = locale
          ? and(
              eq(schema.spellcheckDictionaryWords.dictionaryId, dictionary.id),
              eq(schema.spellcheckDictionaryWords.locale, locale),
            )
          : eq(schema.spellcheckDictionaryWords.dictionaryId, dictionary.id);

        const [words, totalRow] = await Promise.all([
          db
            .select()
            .from(schema.spellcheckDictionaryWords)
            .where(where)
            .orderBy(
              asc(schema.spellcheckDictionaryWords.locale),
              asc(schema.spellcheckDictionaryWords.word),
            )
            .limit(limit)
            .offset(offset),
          db.select({ total: count() }).from(schema.spellcheckDictionaryWords).where(where),
        ]);

        return c.json({
          words: words.map((word) => ({
            id: word.id,
            locale: word.locale,
            word: word.word,
            createdAt: word.createdAt.toISOString(),
          })),
          total: Number(totalRow[0]?.total ?? 0),
        });
      },
    )
    .post(
      "/:dictionaryId/words",
      validateDictionaryParams,
      validateCreateDictionaryWordBody,
      async (c) => {
        if (!isDictionaryMutationAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const dictionary = await getOwnedDictionary(c.var.auth, c.req.valid("param").dictionaryId);
        if (!dictionary) {
          return dictionaryNotFoundResponse(c);
        }

        const payload = c.req.valid("json");
        const parsed = normalizeSpellcheckWord(payload.word);
        if (!parsed) {
          return invalidDictionaryPayloadResponse(c);
        }

        try {
          const word = await db.transaction(async (tx) => {
            await lockSpellcheckDictionaryWords(tx, dictionary.id);
            const existingCount = await dictionaryWordCount(tx, dictionary.id);
            if (existingCount >= SPELLCHECK_MAX_LIBRARY_WORDS) {
              return null;
            }

            const [created] = await tx
              .insert(schema.spellcheckDictionaryWords)
              .values({
                dictionaryId: dictionary.id,
                locale: payload.locale,
                word: parsed.word,
                wordNormalized: parsed.wordNormalized,
                createdByUserId: c.var.auth.user.localUserId,
              })
              .returning();
            await bumpDictionaryWordsVersion(tx, dictionary.id);
            return created;
          });

          if (!word) {
            return invalidDictionaryPayloadResponse(c);
          }

          return c.json(
            {
              word: {
                id: word.id,
                locale: word.locale,
                word: word.word,
                createdAt: word.createdAt.toISOString(),
              },
            },
            201,
          );
        } catch {
          return conflictResponse(
            c,
            "dictionary_word_exists",
            "That word is already in this locale",
          );
        }
      },
    )
    .delete("/:dictionaryId/words/:wordId", validateDictionaryWordParams, async (c) => {
      if (!isDictionaryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const dictionary = await getOwnedDictionary(c.var.auth, params.dictionaryId);
      if (!dictionary) {
        return dictionaryNotFoundResponse(c);
      }

      const deleted = await db
        .delete(schema.spellcheckDictionaryWords)
        .where(
          and(
            eq(schema.spellcheckDictionaryWords.id, params.wordId),
            eq(schema.spellcheckDictionaryWords.dictionaryId, dictionary.id),
          ),
        )
        .returning({ id: schema.spellcheckDictionaryWords.id });

      if (deleted.length === 0) {
        return dictionaryNotFoundResponse(c);
      }

      await bumpDictionaryWordsVersion(db, dictionary.id);
      return c.body(null, 204);
    })
    .post(
      "/:dictionaryId/words/import",
      validateDictionaryParams,
      validateImportDictionaryWordsBody,
      async (c) => {
        if (!isDictionaryMutationAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const dictionary = await getOwnedDictionary(c.var.auth, c.req.valid("param").dictionaryId);
        if (!dictionary) {
          return dictionaryNotFoundResponse(c);
        }

        const payload = c.req.valid("json");
        const parsedWords = parseSpellcheckWordFile(payload.content);
        const imported = await db.transaction(async (tx) => {
          await lockSpellcheckDictionaryWords(tx, dictionary.id);
          const existingCount = await dictionaryWordCount(tx, dictionary.id);
          const existingRows = await tx
            .select({
              wordNormalized: schema.spellcheckDictionaryWords.wordNormalized,
            })
            .from(schema.spellcheckDictionaryWords)
            .where(
              and(
                eq(schema.spellcheckDictionaryWords.dictionaryId, dictionary.id),
                eq(schema.spellcheckDictionaryWords.locale, payload.locale),
              ),
            );
          const toInsert = selectSpellcheckWordsToImport({
            parsedWords,
            existingNormalized: new Set(existingRows.map((row) => row.wordNormalized)),
            remainingCapacity: SPELLCHECK_MAX_LIBRARY_WORDS - existingCount,
          });

          let insertedCount = 0;
          for (const batch of chunkItems(toInsert, SPELLCHECK_WORD_INSERT_CHUNK_SIZE)) {
            if (batch.length === 0) {
              continue;
            }
            const inserted = await tx
              .insert(schema.spellcheckDictionaryWords)
              .values(
                batch.map((word) => ({
                  dictionaryId: dictionary.id,
                  locale: payload.locale,
                  word: word.word,
                  wordNormalized: word.wordNormalized,
                  createdByUserId: c.var.auth.user.localUserId,
                })),
              )
              .onConflictDoNothing()
              .returning({ id: schema.spellcheckDictionaryWords.id });
            insertedCount += inserted.length;
          }

          if (insertedCount > 0) {
            await bumpDictionaryWordsVersion(tx, dictionary.id);
          }
          return insertedCount;
        });

        return c.json({
          import: {
            imported,
            skipped: parsedWords.length - imported,
          },
        });
      },
    )
    .get(
      "/:dictionaryId/words/export",
      validateDictionaryParams,
      validateExportDictionaryWordsQuery,
      async (c) => {
        const dictionary = await getOwnedDictionary(c.var.auth, c.req.valid("param").dictionaryId);
        if (!dictionary) {
          return dictionaryNotFoundResponse(c);
        }

        const { locale } = c.req.valid("query");
        const words = await db
          .select({ word: schema.spellcheckDictionaryWords.word })
          .from(schema.spellcheckDictionaryWords)
          .where(
            and(
              eq(schema.spellcheckDictionaryWords.dictionaryId, dictionary.id),
              eq(schema.spellcheckDictionaryWords.locale, locale),
            ),
          )
          .orderBy(asc(schema.spellcheckDictionaryWords.word));

        const body = serializeSpellcheckWordFile(words.map((row) => row.word));
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="${locale}.txt"`,
          },
        });
      },
    )
    .get("/:dictionaryId/projects", validateDictionaryParams, async (c) => {
      const dictionary = await getOwnedDictionary(c.var.auth, c.req.valid("param").dictionaryId);
      if (!dictionary) {
        return dictionaryNotFoundResponse(c);
      }

      const projects = await db
        .select({
          projectId: schema.projectSpellcheckDictionaries.projectId,
          projectName: schema.projects.name,
          priority: schema.projectSpellcheckDictionaries.priority,
        })
        .from(schema.projectSpellcheckDictionaries)
        .innerJoin(
          schema.projects,
          eq(schema.projects.id, schema.projectSpellcheckDictionaries.projectId),
        )
        .where(eq(schema.projectSpellcheckDictionaries.dictionaryId, dictionary.id))
        .orderBy(...dictionaryProjectAttachmentOrderBy);

      return c.json({ projects });
    })
    .post(
      "/:dictionaryId/projects",
      validateDictionaryParams,
      validateAttachDictionaryProjectBody,
      async (c) => {
        if (!isDictionaryMutationAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const dictionary = await getOwnedDictionary(c.var.auth, c.req.valid("param").dictionaryId);
        if (!dictionary) {
          return dictionaryNotFoundResponse(c);
        }

        const payload = c.req.valid("json");
        const project = await getOwnedProject(c.var.auth, payload.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        await db
          .insert(schema.projectSpellcheckDictionaries)
          .values({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: project.id,
            dictionaryId: dictionary.id,
            priority: await resolveAttachmentPriority(project.id, payload.priority),
          })
          .onConflictDoNothing();

        const projects = await db
          .select({
            projectId: schema.projectSpellcheckDictionaries.projectId,
            projectName: schema.projects.name,
            priority: schema.projectSpellcheckDictionaries.priority,
          })
          .from(schema.projectSpellcheckDictionaries)
          .innerJoin(
            schema.projects,
            eq(schema.projects.id, schema.projectSpellcheckDictionaries.projectId),
          )
          .where(eq(schema.projectSpellcheckDictionaries.dictionaryId, dictionary.id))
          .orderBy(...dictionaryProjectAttachmentOrderBy);

        return c.json({ projects });
      },
    )
    .delete("/:dictionaryId/projects/:projectId", validateDictionaryProjectParams, async (c) => {
      if (!isDictionaryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const dictionary = await getOwnedDictionary(c.var.auth, params.dictionaryId);
      if (!dictionary) {
        return dictionaryNotFoundResponse(c);
      }

      await db
        .delete(schema.projectSpellcheckDictionaries)
        .where(
          and(
            eq(schema.projectSpellcheckDictionaries.dictionaryId, dictionary.id),
            eq(schema.projectSpellcheckDictionaries.projectId, params.projectId),
          ),
        );
      return c.body(null, 204);
    });
}
