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
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { db, schema } from "@/lib/database/client";
import { resolveProjectSpellcheckWords } from "@/lib/spellcheck-dictionary/resolve-words";

import { getOwnedProject, projectNotFoundResponse } from "../project/project.shared";
import {
  attachProjectDictionaryBodySchema,
  resolvedDictionaryQuerySchema,
} from "./dictionary.schema";
import {
  dictionaryNotFoundResponse,
  forbiddenResponse,
  getOwnedDictionary,
  invalidDictionaryPayloadResponse,
  isDictionaryMutationAllowed,
  projectSpellcheckDictionaryOrderBy,
  resolveAttachmentPriority,
  toDictionaryRecord,
} from "./dictionary.shared";

const validateResolvedQuery = validator("query", (value, c) => {
  const parsed = resolvedDictionaryQuerySchema.safeParse(value);
  if (!parsed.success) {
    return invalidDictionaryPayloadResponse(c);
  }
  return parsed.data;
});

const validateAttachBody = validator("json", (value, c) => {
  const parsed = attachProjectDictionaryBodySchema.safeParse(value);
  if (!parsed.success) {
    return invalidDictionaryPayloadResponse(c);
  }
  return parsed.data;
});

export function createProjectDictionaryRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/resolved", validateResolvedQuery, async (c) => {
      const projectId = c.req.param("projectId");
      if (!projectId) {
        return projectNotFoundResponse(c);
      }

      const project = await getOwnedProject(c.var.auth, projectId);
      if (!project) {
        return projectNotFoundResponse(c);
      }

      const { locale } = c.req.valid("query");
      const resolved = await resolveProjectSpellcheckWords({
        organizationId: c.var.auth.organization.localOrganizationId,
        projectId: project.id,
        locale,
      });

      return c.json({
        locale,
        words: resolved.words,
        wordsVersion: resolved.wordsVersion,
        dictionaryIds: resolved.dictionaryIds,
      });
    })
    .get("/", async (c) => {
      const projectId = c.req.param("projectId");
      if (!projectId) {
        return projectNotFoundResponse(c);
      }

      const project = await getOwnedProject(c.var.auth, projectId);
      if (!project) {
        return projectNotFoundResponse(c);
      }

      const attachments = await db
        .select({
          dictionary: schema.spellcheckDictionaries,
          priority: schema.projectSpellcheckDictionaries.priority,
        })
        .from(schema.projectSpellcheckDictionaries)
        .innerJoin(
          schema.spellcheckDictionaries,
          eq(schema.spellcheckDictionaries.id, schema.projectSpellcheckDictionaries.dictionaryId),
        )
        .where(
          and(
            eq(schema.projectSpellcheckDictionaries.projectId, project.id),
            eq(
              schema.projectSpellcheckDictionaries.organizationId,
              c.var.auth.organization.localOrganizationId,
            ),
          ),
        )
        .orderBy(...projectSpellcheckDictionaryOrderBy);

      return c.json({
        dictionaries: attachments.map((row) => ({
          ...toDictionaryRecord(row.dictionary),
          priority: row.priority,
        })),
      });
    })
    .post("/", validateAttachBody, async (c) => {
      if (!isDictionaryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const projectId = c.req.param("projectId");
      if (!projectId) {
        return projectNotFoundResponse(c);
      }

      const project = await getOwnedProject(c.var.auth, projectId);
      if (!project) {
        return projectNotFoundResponse(c);
      }

      const payload = c.req.valid("json");
      const dictionary = await getOwnedDictionary(c.var.auth, payload.dictionaryId);
      if (!dictionary) {
        return dictionaryNotFoundResponse(c);
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

      return c.json({ attached: true }, 200);
    })
    .delete("/:dictionaryId", async (c) => {
      if (!isDictionaryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const projectId = c.req.param("projectId");
      const dictionaryId = c.req.param("dictionaryId");
      if (!projectId || !dictionaryId) {
        return projectNotFoundResponse(c);
      }

      const project = await getOwnedProject(c.var.auth, projectId);
      if (!project) {
        return projectNotFoundResponse(c);
      }

      await db
        .delete(schema.projectSpellcheckDictionaries)
        .where(
          and(
            eq(schema.projectSpellcheckDictionaries.projectId, project.id),
            eq(schema.projectSpellcheckDictionaries.dictionaryId, dictionaryId),
            eq(
              schema.projectSpellcheckDictionaries.organizationId,
              c.var.auth.organization.localOrganizationId,
            ),
          ),
        );
      return c.body(null, 204);
    });
}
