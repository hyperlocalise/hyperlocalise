import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { validator } from "hono/validator";
import { z } from "zod";

import type { AuthVariables } from "@/api/auth/workos";
import { workosAuthMiddleware } from "@/api/auth/workos";
import type { FileStorageAdapter } from "@/lib/file-storage";
import { createStoredFile } from "@/lib/file-storage/records";
import { addInteractionMessage, createInteraction } from "@/lib/interactions";
import { inferSupportedTranslationFileFormat } from "@/lib/translation/file-formats";

const chatRequestBodySchema = z.object({
  text: z.string().trim().min(1).max(10000),
  projectId: z.string().optional(),
});

const validateChatRequestBody = validator("json", (value, c) => {
  const parsed = chatRequestBodySchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_chat_request" }, 400);
  }
  return parsed.data;
});

const maxChatUploadBytes = 25 * 1024 * 1024;
const maxChatUploadFiles = 5;

const multipartChatRequestSchema = z.object({
  text: z.string().trim().max(10000).default(""),
  projectId: z.string().trim().min(1).optional(),
});

type CreateChatRequestRoutesOptions = {
  fileStorageAdapter?: FileStorageAdapter;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asFiles(value: unknown) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.filter((item): item is File => item instanceof File && item.size > 0);
}

function invalidChatRequestResponse(c: { json(body: { error: string }, status: 400): Response }) {
  return c.json({ error: "invalid_chat_request" }, 400);
}

function unsupportedTranslationSourceFileResponse(
  c: {
    json(body: { error: string; filename: string }, status: 400): Response;
  },
  filename: string,
) {
  return c.json({ error: "unsupported_translation_source_file", filename }, 400);
}

function tooManyTranslationSourceFilesResponse(c: {
  json(body: { error: string; maxFiles: number }, status: 400): Response;
}) {
  return c.json({ error: "too_many_translation_source_files", maxFiles: maxChatUploadFiles }, 400);
}

export function createChatRequestRoutes(options: CreateChatRequestRoutesOptions = {}) {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .post(
      "/upload",
      bodyLimit({
        maxSize: maxChatUploadBytes,
        onError: (c) => c.json({ error: "chat_upload_too_large" }, 413),
      }),
      async (c) => {
        const body = await c.req.parseBody({ all: true });
        const parsed = multipartChatRequestSchema.safeParse({
          text: asString(body.text),
          projectId: asString(body.projectId),
        });

        if (!parsed.success) {
          return invalidChatRequestResponse(c);
        }

        const files = asFiles(body.files);
        if (files.length === 0) {
          return invalidChatRequestResponse(c);
        }

        if (files.length > maxChatUploadFiles) {
          return tooManyTranslationSourceFilesResponse(c);
        }

        for (const file of files) {
          if (!inferSupportedTranslationFileFormat(file.name)) {
            return unsupportedTranslationSourceFileResponse(c, file.name);
          }
        }

        const orgId = c.var.auth.activeOrganization.localOrganizationId;
        const messageText = parsed.data.text || "Please translate the attached source file.";
        const title = messageText.slice(0, 120);
        const conversation = await createInteraction({
          organizationId: orgId,
          source: "chat_ui",
          title,
          projectId: parsed.data.projectId,
        });

        const storedFiles = await Promise.all(
          files.map(async (file) =>
            createStoredFile({
              organizationId: orgId,
              projectId: parsed.data.projectId,
              createdByUserId: c.var.auth.user.localUserId,
              role: "source",
              sourceKind: "chat_upload",
              sourceInteractionId: conversation.id,
              filename: file.name,
              contentType: file.type || "application/octet-stream",
              content: await file.arrayBuffer(),
              metadata: {
                uploadSurface: "chat",
                translationSource: true,
              },
              adapter: options.fileStorageAdapter,
            }),
          ),
        );

        const organizationSlug =
          c.req.param("organizationSlug") ?? c.var.auth.activeOrganization.slug ?? "";

        await addInteractionMessage({
          interactionId: conversation.id,
          senderType: "user",
          text: messageText,
          attachments: storedFiles.map((file) => ({
            id: file.id,
            filename: file.filename,
            contentType: file.contentType,
            url: organizationSlug
              ? `/api/orgs/${organizationSlug}/files/${file.id}`
              : (file.downloadUrl ?? file.storageUrl),
          })),
        });

        // TODO: trigger agent processing here

        return c.json({ conversation, files: storedFiles }, 201);
      },
    )
    .post("/", validateChatRequestBody, async (c) => {
      const body = c.req.valid("json");
      const orgId = c.var.auth.activeOrganization.localOrganizationId;

      const title = body.text.slice(0, 120);
      const conversation = await createInteraction({
        organizationId: orgId,
        source: "chat_ui",
        title,
        projectId: body.projectId,
      });

      await addInteractionMessage({
        interactionId: conversation.id,
        senderType: "user",
        text: body.text,
      });

      // TODO: trigger agent processing here

      return c.json({ conversation }, 201);
    });
}
