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

import { requireApiKeyPermission, type ApiKeyAuthVariables } from "@/api/auth/api-key";
import { isProjectMutationAllowed } from "@/api/auth/capability-guards";
import { publicApiAuthMiddleware } from "@/api/auth/workos-agent";
import {
  apiErrorResponse,
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  internalErrorResponse,
  notFoundResponse,
} from "@/api/response.schema";
import { projectIdParamsSchema } from "@/api/routes/project/project.schema";
import { getOwnedProjectRecord } from "@/api/routes/project/project.shared";
import { sendTranslationAsSourceBodySchema } from "@/api/routes/project/translation-as-source.schema";
import { db, schema } from "@/lib/database/client";
import type { FileStorageAdapter } from "@/lib/file-storage/types";
import { formatMemberDisplayName } from "@/lib/members/member-management";
import { isErr } from "@/lib/primitives/result/results";
import {
  sendTranslationAsSource,
  type TranslationAsSourceError,
} from "@/lib/projects/files/translation-as-source";
import {
  getTranslationAsSourceDestinationFile,
  translationAsSourceDestinationPath,
} from "@/lib/projects/files/translation-as-source-destination";
import { DEFAULT_PROJECT_BRANCH_NAME } from "@/lib/projects/branches/project-branch-name";
import { getRepositorySourceFileByPath } from "@/lib/projects/translations/project-translation-service";

import { projectNotFoundResponse } from "./public-files.shared";

const validateParams = validator("param", (value, c) => {
  const parsed = projectIdParamsSchema.safeParse(value);
  if (!parsed.success) {
    return projectNotFoundResponse(c);
  }
  return parsed.data;
});

const validateBody = validator("json", (value, c) => {
  const parsed = sendTranslationAsSourceBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_translation_as_source_payload");
  }
  return parsed.data;
});

/** Refusals over what the request names. */
const BAD_REQUEST_MESSAGES = {
  unsupported_file_format: "Only Word and Excel files can be used as another project's source.",
  same_project: "The destination must be a different project.",
  project_not_native: "Both projects must store their files in the workspace.",
  locale_not_a_target:
    "The destination's source language is not a target language of this project.",
  destination_source_locale_mismatch:
    "The destination's source language is not a target language of this project.",
} satisfies Partial<Record<TranslationAsSourceError["code"], string>>;

/** Refusals over the file itself, which sending again unchanged does not fix. */
const UNPROCESSABLE_MESSAGES = {
  source_file_read_failed:
    "The file's newest upload could not be read. Upload the file again, then send it.",
  no_strings: "This file has no strings to send.",
  file_cannot_be_written: "This file could not be written in that language, so it was not sent.",
  file_reads_differently:
    "This file was not sent, because the destination would not read it as the same strings.",
} satisfies Partial<Record<TranslationAsSourceError["code"], string>>;

type CreatePublicTranslationSourceRoutesOptions = {
  deferAfterResponse?: (task: () => Promise<unknown>) => void;
  fileStorageAdapter?: FileStorageAdapter;
};

/**
 * `POST /v1/projects/{projectId}/files/translation-source`: the Files page's **Use translation
 * as source** for scripts. A caller sees nothing before sending, so a file at that path that this
 * file did not send is replaced only when the request names its version, which a refusal gives.
 */
export function createPublicTranslationSourceRoutes(
  options: CreatePublicTranslationSourceRoutesOptions = {},
) {
  // Its own auth, not `use("*")`, which would also run on every other `/projects` route. The
  // translations group's `use("*")` runs here too, so this repeats it rather than relying on it.
  return new Hono<{ Variables: ApiKeyAuthVariables }>().post(
    "/:projectId/files/translation-source",
    publicApiAuthMiddleware,
    requireApiKeyPermission("files:write"),
    validateParams,
    validateBody,
    async (c) => {
      const access = c.var.auth.teamAccess;
      if (!isProjectMutationAllowed(access.membership.role)) {
        return forbiddenResponse(
          c,
          "forbidden",
          "Missing required role permission: projects:write",
        );
      }

      const body = c.req.valid("json");
      const [sourceProject, destinationProject] = await Promise.all([
        getOwnedProjectRecord(access, c.req.valid("param").projectId),
        getOwnedProjectRecord(access, body.destinationProjectId),
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
          BAD_REQUEST_MESSAGES.destination_source_locale_mismatch,
        );
      }

      const organizationId = access.organization.localOrganizationId;
      const sent = await sendTranslationAsSource({
        organizationId,
        sourceProject,
        destinationProject,
        sourcePath: body.sourcePath,
        locale: destinationProject.sourceLocale,
        actorUserId: access.user.localUserId,
        replaceVersionId: body.replaceVersionId,
        deferAfterResponse: options.deferAfterResponse,
        fileStorageAdapter: options.fileStorageAdapter,
      });
      if (!isErr(sent)) {
        return c.json({ file: sent.value }, 201);
      }

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
        case "destination_file_replaced": {
          const destinationFile = await describeDestinationFile({
            access,
            sourceProject,
            destinationProjectId: destinationProject.id,
            sourcePath: body.sourcePath,
          });
          return conflictResponse(
            c,
            error.code,
            destinationFile
              ? "The destination has a file at this path that this file did not send. Send again with its versionId as replaceVersionId to replace it."
              : "The destination's file at this path changed while sending. Send again.",
            { destinationFile },
          );
        }
        case "destination_branch_protected":
          return conflictResponse(
            c,
            error.code,
            "The destination's default branch is protected, so files cannot be sent to it.",
          );
        case "source_file_not_found":
          return notFoundResponse(c, error.code, "Source file not found");
        case "source_file_not_ready":
          return conflictResponse(
            c,
            error.code,
            "The file is still being read. Try again in a moment.",
          );
        case "source_file_read_failed":
        case "no_strings":
        case "file_cannot_be_written":
        case "file_reads_differently":
          return apiErrorResponse(c, 422, error.code, UNPROCESSABLE_MESSAGES[error.code]);
        case "file_build_failed":
        case "upload_failed":
          return internalErrorResponse(c, error.code, "Could not send the file. Try again.");
        default:
          return badRequestResponse(c, error.code, BAD_REQUEST_MESSAGES[error.code]);
      }
    },
  );
}

/**
 * What the destination has now at the path a send of `sourcePath` writes to, when a send would
 * need its version named; null when nothing there needs confirming any more.
 */
async function describeDestinationFile(input: {
  access: ApiKeyAuthVariables["auth"]["teamAccess"];
  sourceProject: { id: string; name: string };
  destinationProjectId: string;
  sourcePath: string;
}) {
  const organizationId = input.access.organization.localOrganizationId;
  const sourceFile = await getRepositorySourceFileByPath({
    organizationId,
    projectId: input.sourceProject.id,
    sourcePath: input.sourcePath,
    branchName: DEFAULT_PROJECT_BRANCH_NAME,
  });
  if (!sourceFile) {
    return null;
  }
  const path = translationAsSourceDestinationPath(sourceFile.sourcePath);
  const file = await getTranslationAsSourceDestinationFile({
    organizationId,
    destinationProjectId: input.destinationProjectId,
    destinationPath: path,
    repositorySourceFileId: sourceFile.id,
  });
  if (file.state === "empty" || file.state === "sent_from_here") {
    return null;
  }
  const other = file.state === "other" ? file : null;
  // An upload through the API records its key, which acts as the key's owner, not a person.
  const keyOwner =
    other && !other.addedBy ? await uploadingApiKeyOwner(organizationId, file.versionId) : null;
  return {
    path,
    versionId: file.versionId,
    addedAt: file.addedAt.toISOString(),
    addedBy: other?.addedBy ?? keyOwner?.name ?? null,
    addedThroughApi: keyOwner !== null,
    fromRepositorySync: file.state === "from_sync",
    sentFrom: other?.sentFrom
      ? await sentFromDetails(input.access, other.sentFrom, input.sourceProject)
      : null,
  };
}

/** The owner of the API key that uploaded `versionId`, if a key did; the key itself is not named. */
async function uploadingApiKeyOwner(
  organizationId: string,
  versionId: string,
): Promise<{ name: string | null } | null> {
  const [row] = await db
    .select({
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      email: schema.users.email,
    })
    .from(schema.repositorySourceFileVersions)
    .innerJoin(
      schema.organizationApiKeys,
      and(
        eq(schema.organizationApiKeys.id, schema.repositorySourceFileVersions.uploadedByApiKeyId),
        eq(schema.organizationApiKeys.organizationId, organizationId),
      ),
    )
    .leftJoin(schema.users, eq(schema.users.id, schema.organizationApiKeys.createdByUserId))
    .where(eq(schema.repositorySourceFileVersions.id, versionId))
    .limit(1);
  if (!row) {
    return null;
  }
  return {
    name: row.email
      ? formatMemberDisplayName({
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
        })
      : null,
  };
}

/** Where a file sent from elsewhere came from; another project is named only to someone who can open it. */
async function sentFromDetails(
  access: ApiKeyAuthVariables["auth"]["teamAccess"],
  sentFrom: { projectId: string; sourcePath: string },
  sourceProject: { id: string; name: string },
) {
  const project =
    sentFrom.projectId === sourceProject.id
      ? sourceProject
      : await getOwnedProjectRecord(access, sentFrom.projectId);
  return {
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    sourcePath: sentFrom.sourcePath,
  };
}
