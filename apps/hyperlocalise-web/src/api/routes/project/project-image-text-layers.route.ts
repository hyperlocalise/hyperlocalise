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
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { bodyLimit } from "hono/body-limit";
import { canAccessStoredFile } from "@/api/auth/team-access";
import { isAiActionAllowed, isWriteBackTranslationAllowed } from "@/api/auth/capability-guards";
import type { AuthVariables } from "@/api/auth/workos";
import { rejectIfAiFeaturesUnavailable } from "@/api/billing/ai-features-response";
import { badRequestResponse } from "@/api/response.schema";
import { db, schema } from "@/lib/database/client";
import { getFileStorageAdapter } from "@/lib/file-storage/get-file-storage-adapter";
import type { FileStorageAdapter } from "@/lib/file-storage/types";
import { extractImageText } from "@/lib/agents/image-text-extraction";
import { readBoundedResponseBody } from "@/lib/security/public-http-fetch";
import { readImageTextLayers, type ImageTextLayers } from "@/lib/projects/files/image-text-layers";
import { fileNotFoundResponse } from "../file/file.shared";
import {
  getOwnedProject,
  projectNotFoundResponse,
  projectForbiddenResponse,
} from "./project.shared";
import {
  projectImageTextLayersParamsSchema,
  updateProjectImageTextLayersSchema,
} from "./project-image-text-layers.schema";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_LAYER_BODY_BYTES = 2 * 1024 * 1024;

export function createProjectImageTextLayerRoutes(
  options: { fileStorageAdapter?: FileStorageAdapter } = {},
) {
  return new Hono<{
    Variables: AuthVariables & { imageFile: typeof schema.storedFiles.$inferSelect };
  }>()
    .use("/:fileId/text-layers", async (c, next) => {
      const parsed = projectImageTextLayersParamsSchema.safeParse(c.req.param());
      if (!parsed.success) return fileNotFoundResponse(c);
      const params = parsed.data;
      if (!(await getOwnedProject(c.var.auth, params.projectId))) return projectNotFoundResponse(c);
      const [file] = await db
        .select()
        .from(schema.storedFiles)
        .where(
          and(
            eq(schema.storedFiles.id, params.fileId),
            eq(schema.storedFiles.organizationId, c.var.auth.organization.localOrganizationId),
            eq(schema.storedFiles.projectId, params.projectId),
          ),
        )
        .limit(1);
      if (!file || !(await canAccessStoredFile(c.var.auth, file))) return fileNotFoundResponse(c);
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.contentType)) {
        return badRequestResponse(
          c,
          "unsupported_image_type",
          "Text extraction supports PNG, JPEG, and WebP images.",
        );
      }
      c.set("imageFile", file);
      c.header("Cache-Control", "private, no-store");
      await next();
    })
    .get("/:fileId/text-layers", (c) => {
      const file = c.var.imageFile;
      return c.json({ textLayers: readImageTextLayers(file.metadata, file.sha256) });
    })
    .post("/:fileId/text-layers", async (c) => {
      if (
        !isAiActionAllowed(c.var.auth.membership.role) ||
        !isWriteBackTranslationAllowed(c.var.auth.membership.role)
      )
        return projectForbiddenResponse(c);
      const file = c.var.imageFile;
      const existing = readImageTextLayers(file.metadata, file.sha256);
      if (existing) return c.json({ textLayers: existing });
      const denied = await rejectIfAiFeaturesUnavailable(c, file.organizationId);
      if (denied) return denied;
      if (file.byteSize > MAX_IMAGE_BYTES)
        return badRequestResponse(
          c,
          "image_too_large",
          "Text extraction supports images up to 20 MB.",
        );
      const stored = await (options.fileStorageAdapter ?? getFileStorageAdapter()).get({
        keyOrUrl: file.storageKey,
      });
      if (!stored) return fileNotFoundResponse(c);
      let content: Uint8Array;
      try {
        content = await readBoundedResponseBody(new Response(stored.body), MAX_IMAGE_BYTES);
      } catch {
        return badRequestResponse(
          c,
          "image_bytes_unavailable",
          "Could not read this image within the 20 MB limit.",
        );
      }
      if (content.byteLength > MAX_IMAGE_BYTES) return badRequestResponse(c, "image_too_large");
      const extracted = await extractImageText({
        content,
        contentType: file.contentType,
        organizationId: file.organizationId,
        fileId: file.id,
        signal: c.req.raw.signal,
      });
      if (!extracted.ok)
        return c.json(
          { error: extracted.error.code, message: "Could not extract text. Please try again." },
          502,
        );
      const textLayers: ImageTextLayers = {
        version: 1,
        sourceHash: file.sha256,
        revision: crypto.randomUUID(),
        extractedAt: new Date().toISOString(),
        regions: extracted.value,
      };
      const [updated] = await db
        .update(schema.storedFiles)
        .set({
          metadata: sql`jsonb_set(${schema.storedFiles.metadata}, '{imageTextLayers}', ${JSON.stringify(textLayers)}::jsonb)`,
        })
        .where(
          and(
            eq(schema.storedFiles.id, file.id),
            eq(schema.storedFiles.organizationId, file.organizationId),
            eq(schema.storedFiles.sha256, file.sha256),
            sql`coalesce(${schema.storedFiles.metadata}->'imageTextLayers', 'null'::jsonb) IS NOT DISTINCT FROM ${JSON.stringify(file.metadata.imageTextLayers ?? null)}::jsonb`,
          ),
        )
        .returning({ id: schema.storedFiles.id });
      if (!updated)
        return c.json(
          {
            error: "text_layers_conflict",
            message: "Text layers changed. Reload before trying again.",
          },
          409,
        );
      return c.json({ textLayers });
    })
    .patch(
      "/:fileId/text-layers",
      bodyLimit({
        maxSize: MAX_LAYER_BODY_BYTES,
        onError: (c) => c.json({ error: "payload_too_large" }, 413),
      }),
      validator("json", (value, c) => {
        const parsed = updateProjectImageTextLayersSchema.safeParse(value);
        return parsed.success ? parsed.data : badRequestResponse(c, "invalid_text_layers");
      }),
      async (c) => {
        if (!isWriteBackTranslationAllowed(c.var.auth.membership.role))
          return projectForbiddenResponse(c);
        const file = c.var.imageFile;
        const input = c.req.valid("json");
        const existing = readImageTextLayers(file.metadata, file.sha256);
        if (!existing || input.sourceHash !== file.sha256 || input.revision !== existing.revision)
          return c.json(
            {
              error: "text_layers_conflict",
              message: "The source or its text layers changed. Reload before saving.",
            },
            409,
          );
        const textLayers = {
          ...input,
          extractedAt: existing.extractedAt,
          revision: crypto.randomUUID(),
        };
        const [updated] = await db
          .update(schema.storedFiles)
          .set({
            metadata: sql`jsonb_set(${schema.storedFiles.metadata}, '{imageTextLayers}', ${JSON.stringify(textLayers)}::jsonb)`,
          })
          .where(
            and(
              eq(schema.storedFiles.id, file.id),
              eq(schema.storedFiles.organizationId, file.organizationId),
              eq(schema.storedFiles.sha256, input.sourceHash),
              sql`${schema.storedFiles.metadata}->'imageTextLayers'->>'revision' = ${input.revision}`,
            ),
          )
          .returning({ id: schema.storedFiles.id });
        if (!updated)
          return c.json(
            {
              error: "text_layers_conflict",
              message: "Text layers changed. Reload before saving.",
            },
            409,
          );
        return c.json({ textLayers });
      },
    );
}
