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
import { Hono } from "hono";
import { validator } from "hono/validator";

import type { AuthVariables } from "@/api/auth/workos";
import {
  badRequestResponse,
  conflictResponse,
  internalErrorResponse,
  notFoundResponse,
} from "@/api/response.schema";
import type { FileStorageAdapter } from "@/lib/file-storage/types";
import { isErr } from "@/lib/primitives/result/results";
import {
  isTranslationSourceDestination,
  sendTranslationAsSource,
  type TranslationAsSourceError,
} from "@/lib/projects/files/translation-as-source";
import {
  getTranslationAsSourceDestinationFile,
  translationAsSourceDestinationPath,
} from "@/lib/projects/files/translation-as-source-destination";
import { listOrganizationProjects } from "@/lib/projects/organization/organization-project-service";
import { getRepositorySourceFileByPath } from "@/lib/projects/translations/project-translation-service";

import { projectIdParamsSchema } from "./project.schema";
import {
  sendTranslationAsSourceBodySchema,
  translationAsSourceDestinationFileQuerySchema,
} from "./translation-as-source.schema";
import {
  getOwnedProjectRecord,
  isProjectMutationAllowed,
  projectForbiddenResponse,
  projectNotFoundResponse,
} from "./project.shared";

const validateParams = validator("param", (value, c) => {
  const parsed = projectIdParamsSchema.safeParse(value);
  if (!parsed.success) {
    return projectNotFoundResponse(c);
  }
  return parsed.data;
});

const validateSendBody = validator("json", (value, c) => {
  const parsed = sendTranslationAsSourceBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_translation_as_source_payload");
  }
  return parsed.data;
});

const validateDestinationFileQuery = validator("query", (value, c) => {
  const parsed = translationAsSourceDestinationFileQuerySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_translation_as_source_payload");
  }
  return parsed.data;
});

type CreateTranslationAsSourceRoutesOptions = {
  fileStorageAdapter?: FileStorageAdapter;
  deferAfterResponse?: (task: () => Promise<unknown>) => void;
};

const REFUSAL_MESSAGES: Record<
  Exclude<
    TranslationAsSourceError["code"],
    | "translations_not_approved"
    | "source_file_not_found"
    | "file_build_failed"
    | "upload_failed"
    | "destination_file_replaced"
  >,
  string
> = {
  unsupported_file_format: "Only Word and Excel files can be used as another project's source.",
  same_project: "Choose a different project.",
  project_not_native: "Both projects must store their files in the workspace.",
  locale_not_a_target: "The other project's source language is not a language of this project.",
  destination_source_locale_mismatch:
    "The other project's source language is not a language of this project.",
  source_file_not_ready: "The file is still being read. Try again in a moment.",
  source_file_read_failed:
    "The file's newest upload could not be read. Upload the file again, then send it.",
  no_strings: "This file has no strings to send.",
  file_cannot_be_written: "This file could not be written in that language, so it was not sent.",
  file_reads_differently:
    "This file was not sent, because the other project would not read it as the same strings.",
};

export function createTranslationAsSourceRoutes(
  options: CreateTranslationAsSourceRoutesOptions = {},
) {
  return new Hono<{ Variables: AuthVariables }>()
    .get("/destinations", validateParams, async (c) => {
      const project = await getOwnedProjectRecord(c.var.auth, c.req.valid("param").projectId);
      if (!project) {
        return projectNotFoundResponse(c);
      }

      const projects = await listOrganizationProjects(c.var.auth, { source: "native" });
      const destinations = projects
        .filter((candidate) => isTranslationSourceDestination(project, candidate))
        .map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          sourceLocale: candidate.sourceLocale as string,
          keepsApprovedOnSourceChange:
            candidate.approvedTranslationsOnSourceChange !== "needs_review",
        }));

      return c.json({ destinations }, 200);
    })
    .get("/destination-file", validateParams, validateDestinationFileQuery, async (c) => {
      const query = c.req.valid("query");
      const [sourceProject, destinationProject] = await Promise.all([
        getOwnedProjectRecord(c.var.auth, c.req.valid("param").projectId),
        getOwnedProjectRecord(c.var.auth, query.destinationProjectId),
      ]);
      if (!sourceProject) {
        return projectNotFoundResponse(c);
      }
      if (!destinationProject) {
        return notFoundResponse(c, "destination_project_not_found", "Project not found");
      }
      const organizationId = c.var.auth.organization.localOrganizationId;
      const sourceFile = await getRepositorySourceFileByPath({
        organizationId,
        projectId: sourceProject.id,
        sourcePath: query.sourcePath,
      });
      if (!sourceFile) {
        return notFoundResponse(c, "source_file_not_found", "Source file not found");
      }

      // What a send would replace there, so the person sees it before sending.
      const path = translationAsSourceDestinationPath(sourceFile.sourcePath);
      const file = await getTranslationAsSourceDestinationFile({
        organizationId,
        destinationProjectId: destinationProject.id,
        destinationPath: path,
        repositorySourceFileId: sourceFile.id,
      });
      if (file.state === "empty" || file.state === "sent_from_here") {
        return c.json({ destinationFile: { state: file.state, path, addedAt: null } }, 200);
      }
      if (file.state === "from_sync") {
        return c.json(
          {
            destinationFile: {
              state: file.state,
              path,
              addedAt: file.addedAt.toISOString(),
              versionId: file.versionId,
            },
          },
          200,
        );
      }
      // Another project is named only to someone who can open it.
      const sentFromProject = file.sentFrom
        ? file.sentFrom.projectId === sourceProject.id
          ? sourceProject
          : await getOwnedProjectRecord(c.var.auth, file.sentFrom.projectId)
        : null;
      return c.json(
        {
          destinationFile: {
            state: file.state,
            path,
            addedAt: file.addedAt.toISOString(),
            versionId: file.versionId,
            addedBy: file.addedBy,
            sentFrom: file.sentFrom
              ? {
                  thisProject: file.sentFrom.projectId === sourceProject.id,
                  projectName: sentFromProject?.name ?? null,
                  sourcePath: file.sentFrom.sourcePath,
                }
              : null,
          },
        },
        200,
      );
    })
    .post("/", validateParams, validateSendBody, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return projectForbiddenResponse(c);
      }

      const body = c.req.valid("json");
      const [sourceProject, destinationProject] = await Promise.all([
        getOwnedProjectRecord(c.var.auth, c.req.valid("param").projectId),
        getOwnedProjectRecord(c.var.auth, body.destinationProjectId),
      ]);
      if (!sourceProject) {
        return projectNotFoundResponse(c);
      }
      if (!destinationProject) {
        return notFoundResponse(c, "destination_project_not_found", "Project not found");
      }
      if (!destinationProject.sourceLocale) {
        return badRequestResponse(
          c,
          "destination_source_locale_mismatch",
          REFUSAL_MESSAGES.destination_source_locale_mismatch,
        );
      }

      const sent = await sendTranslationAsSource({
        organizationId: c.var.auth.organization.localOrganizationId,
        sourceProject,
        destinationProject,
        sourcePath: body.sourcePath,
        locale: destinationProject.sourceLocale,
        actorUserId: c.var.auth.user.localUserId,
        replaceVersionId: body.replaceVersionId,
        deferAfterResponse: options.deferAfterResponse,
        fileStorageAdapter: options.fileStorageAdapter,
      });
      if (isErr(sent)) {
        const { error } = sent;
        switch (error.code) {
          case "translations_not_approved":
            return conflictResponse(
              c,
              error.code,
              "Some strings have no approved translation in this language yet.",
              {
                missingCount: error.missingCount,
                totalCount: error.totalCount,
                missingStrings: error.missingStrings,
              },
            );
          case "source_file_not_found":
            return notFoundResponse(c, error.code, "Source file not found");
          case "destination_file_replaced":
            return conflictResponse(
              c,
              error.code,
              "The other project has a file at this path that this file did not send. Check what it is, then confirm to replace it.",
            );
          case "file_build_failed":
          case "upload_failed":
            return internalErrorResponse(c, error.code, "Could not send the file. Try again.");
          default:
            return badRequestResponse(c, error.code, REFUSAL_MESSAGES[error.code]);
        }
      }

      return c.json({ file: sent.value }, 201);
    });
}
