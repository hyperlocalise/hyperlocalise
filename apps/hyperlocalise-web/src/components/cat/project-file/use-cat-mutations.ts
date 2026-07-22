"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useMutation } from "@tanstack/react-query";
import { useIntl, type IntlShape } from "react-intl";

import type {
  ProjectFileCatComment,
  ProjectFileCatQueueFile,
  ProjectFileCatTranslation,
} from "@/api/routes/project/project.schema";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

import type { CrowdinIssueType } from "@/components/cat/shared/types";

import { requireProviderExternalResourceId } from "./project-file-cat-mapper";
import { isCatAllFilesSourcePath } from "@/lib/projects/cat-all-files";
import { useInvalidateCatSegmentComments } from "./use-cat-segment-comments";
import {
  useInvalidateCatSegmentTarget,
  useSyncCatSegmentTargetAfterSave,
} from "./use-cat-segment-target";
import { useCatMutationsMessages } from "./use-cat-mutations.messages";

function resolveCatMutationFileIdentity(
  input: {
    sourcePath: string;
    catFile: ProjectFileCatQueueFile | null | undefined;
  },
  externalStringId: string,
  intl: IntlShape,
) {
  const segment = input.catFile?.segments.find(
    (entry) => entry.externalStringId === externalStringId,
  );
  const sourcePath =
    segment?.sourcePath?.trim() ||
    (isCatAllFilesSourcePath(input.sourcePath) ? "" : input.sourcePath);

  if (!sourcePath) {
    throw new Error(intl.formatMessage(useCatMutationsMessages.missingSegmentSourceFile));
  }

  const externalResourceId = segment?.externalResourceId
    ? segment.externalResourceId
    : input.catFile?.provider
      ? requireProviderExternalResourceId(input.catFile, intl)
      : undefined;
  const resourceType = segment?.resourceType ?? input.catFile?.provider?.resourceType;

  return { sourcePath, externalResourceId, resourceType };
}

export function useCatMutations(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  catFile: ProjectFileCatQueueFile | null | undefined;
  invalidateQueue: () => Promise<void>;
  onTranslationSaved?: (segmentId: string, targetText: string, isApproved: boolean) => void;
}) {
  const intl = useIntl();
  const invalidateSegmentTarget = useInvalidateCatSegmentTarget();
  const syncSegmentTargetAfterSave = useSyncCatSegmentTargetAfterSave();
  const invalidateSegmentComments = useInvalidateCatSegmentComments();

  const saveMutation = useMutation({
    mutationFn: async (mutationInput: {
      externalStringId: string;
      text: string;
      approve?: boolean;
    }) => {
      const { sourcePath, externalResourceId } = resolveCatMutationFileIdentity(
        input,
        mutationInput.externalStringId,
        intl,
      );

      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.cat.translations.$post({
        param: {
          organizationSlug: input.organizationSlug,
          projectId: input.projectId,
        },
        json: {
          sourcePath,
          targetLocale: input.targetLocale,
          externalStringId: mutationInput.externalStringId,
          externalResourceId,
          text: mutationInput.text,
          approve: mutationInput.approve,
        },
      });

      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            intl.formatMessage(useCatMutationsMessages.failedToSaveTranslation),
          ),
        );
      }

      const body = (await response.json()) as { translation: ProjectFileCatTranslation };
      return body.translation;
    },
    onSuccess: async (translation, variables) => {
      input.onTranslationSaved?.(
        variables.externalStringId,
        variables.text,
        translation.isApproved,
      );
      const { sourcePath, externalResourceId, resourceType } = resolveCatMutationFileIdentity(
        input,
        variables.externalStringId,
        intl,
      );

      const segmentTargetInput = {
        organizationSlug: input.organizationSlug,
        projectId: input.projectId,
        sourcePath,
        externalResourceId,
        resourceType,
        targetLocale: input.targetLocale,
        externalStringId: variables.externalStringId,
      };

      await Promise.all([
        input.invalidateQueue(),
        syncSegmentTargetAfterSave(segmentTargetInput, translation),
      ]);
    },
  });

  const commentMutation = useMutation({
    mutationFn: async (mutationInput: {
      externalStringId: string;
      text: string;
      type?: "comment" | "issue";
      issueType?: CrowdinIssueType;
    }) => {
      const { sourcePath, externalResourceId } = resolveCatMutationFileIdentity(
        input,
        mutationInput.externalStringId,
        intl,
      );

      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.cat.comments.$post({
        param: {
          organizationSlug: input.organizationSlug,
          projectId: input.projectId,
        },
        json: {
          sourcePath,
          targetLocale: input.targetLocale,
          externalStringId: mutationInput.externalStringId,
          externalResourceId,
          text: mutationInput.text,
          type: mutationInput.type,
          issueType: mutationInput.issueType,
        },
      });

      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            intl.formatMessage(useCatMutationsMessages.failedToPostComment),
          ),
        );
      }

      const body = (await response.json()) as { comment: ProjectFileCatComment };
      return body.comment;
    },
    onSuccess: async (_data, variables) => {
      const { sourcePath, externalResourceId, resourceType } = resolveCatMutationFileIdentity(
        input,
        variables.externalStringId,
        intl,
      );

      await Promise.all([
        input.invalidateQueue(),
        invalidateSegmentTarget({
          organizationSlug: input.organizationSlug,
          projectId: input.projectId,
          sourcePath,
          externalResourceId,
          resourceType,
          targetLocale: input.targetLocale,
          externalStringId: variables.externalStringId,
        }),
        invalidateSegmentComments({
          organizationSlug: input.organizationSlug,
          projectId: input.projectId,
          sourcePath,
          externalResourceId,
          resourceType,
          targetLocale: input.targetLocale,
          externalStringId: variables.externalStringId,
        }),
      ]);
    },
  });

  const resolveCommentMutation = useMutation({
    mutationFn: async (mutationInput: { externalStringId: string; externalCommentId: string }) => {
      const { sourcePath, externalResourceId } = resolveCatMutationFileIdentity(
        input,
        mutationInput.externalStringId,
        intl,
      );

      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.cat.comments[":commentId"].resolve.$patch({
        param: {
          organizationSlug: input.organizationSlug,
          projectId: input.projectId,
          commentId: mutationInput.externalCommentId,
        },
        json: {
          sourcePath,
          externalResourceId,
        },
      });

      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            intl.formatMessage(useCatMutationsMessages.failedToResolveIssue),
          ),
        );
      }

      const body = (await response.json()) as { comment: ProjectFileCatComment };
      return body.comment;
    },
    onSuccess: async (_data, variables) => {
      const { sourcePath, externalResourceId, resourceType } = resolveCatMutationFileIdentity(
        input,
        variables.externalStringId,
        intl,
      );

      await Promise.all([
        input.invalidateQueue(),
        invalidateSegmentTarget({
          organizationSlug: input.organizationSlug,
          projectId: input.projectId,
          sourcePath,
          externalResourceId,
          resourceType,
          targetLocale: input.targetLocale,
          externalStringId: variables.externalStringId,
        }),
        invalidateSegmentComments({
          organizationSlug: input.organizationSlug,
          projectId: input.projectId,
          sourcePath,
          externalResourceId,
          resourceType,
          targetLocale: input.targetLocale,
          externalStringId: variables.externalStringId,
        }),
      ]);
    },
  });

  async function invalidateAfterImageChange(externalStringId: string) {
    const { sourcePath, externalResourceId, resourceType } = resolveCatMutationFileIdentity(
      input,
      externalStringId,
      intl,
    );

    await Promise.all([
      input.invalidateQueue(),
      invalidateSegmentTarget({
        organizationSlug: input.organizationSlug,
        projectId: input.projectId,
        sourcePath,
        externalResourceId,
        resourceType,
        targetLocale: input.targetLocale,
        externalStringId,
      }),
    ]);
  }

  const regenerateImageMutation = useMutation({
    mutationFn: async (mutationInput: {
      externalStringId: string;
      instructions?: string;
      force?: boolean;
    }) => {
      const { sourcePath } = resolveCatMutationFileIdentity(
        input,
        mutationInput.externalStringId,
        intl,
      );
      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.cat.images.regenerate.$post({
        param: {
          organizationSlug: input.organizationSlug,
          projectId: input.projectId,
        },
        json: {
          sourcePath,
          targetLocale: input.targetLocale,
          externalStringId: mutationInput.externalStringId,
          instructions: mutationInput.instructions,
          force: mutationInput.force,
        },
      });

      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            intl.formatMessage(useCatMutationsMessages.failedToRegenerateImage),
          ),
        );
      }

      return response.json();
    },
    onSuccess: async (_data, variables) => {
      await invalidateAfterImageChange(variables.externalStringId);
    },
  });

  const uploadImageMutation = useMutation({
    mutationFn: async (mutationInput: {
      externalStringId: string;
      file: File;
      force?: boolean;
    }) => {
      const { sourcePath } = resolveCatMutationFileIdentity(
        input,
        mutationInput.externalStringId,
        intl,
      );
      const formData = new FormData();
      formData.set("sourcePath", sourcePath);
      formData.set("targetLocale", input.targetLocale);
      formData.set("externalStringId", mutationInput.externalStringId);
      if (mutationInput.force) {
        formData.set("force", "true");
      }
      if (input.catFile?.provider) {
        formData.set("externalResourceId", requireProviderExternalResourceId(input.catFile, intl));
      }
      formData.set("file", mutationInput.file);

      const response = await fetch(
        `/api/orgs/${encodeURIComponent(input.organizationSlug)}/projects/${encodeURIComponent(input.projectId)}/files/detail/cat/images/upload`,
        {
          method: "POST",
          body: formData,
        },
      );

      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            intl.formatMessage(useCatMutationsMessages.failedToUploadImage),
          ),
        );
      }

      return response.json();
    },
    onSuccess: async (_data, variables) => {
      await invalidateAfterImageChange(variables.externalStringId);
    },
  });

  const treatAsImageMutation = useMutation({
    mutationFn: async (mutationInput: { externalStringId: string; treatAsImage: boolean }) => {
      const { sourcePath, externalResourceId } = resolveCatMutationFileIdentity(
        input,
        mutationInput.externalStringId,
        intl,
      );

      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.cat.segments[":externalStringId"]["treat-as-image"].$post({
        param: {
          organizationSlug: input.organizationSlug,
          projectId: input.projectId,
          externalStringId: mutationInput.externalStringId,
        },
        json: {
          sourcePath,
          targetLocale: input.targetLocale,
          externalStringId: mutationInput.externalStringId,
          externalResourceId,
          treatAsImage: mutationInput.treatAsImage,
        },
      });

      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            intl.formatMessage(useCatMutationsMessages.failedToUpdateImageMode),
          ),
        );
      }

      return response.json();
    },
    onSuccess: async (_data, variables) => {
      await invalidateAfterImageChange(variables.externalStringId);
    },
  });

  return {
    saveMutation,
    saveTranslation: saveMutation.mutateAsync,
    commentMutation,
    postComment: commentMutation.mutateAsync,
    resolveCommentMutation,
    resolveComment: resolveCommentMutation.mutateAsync,
    regenerateImageMutation,
    regenerateImage: regenerateImageMutation.mutateAsync,
    uploadImageMutation,
    uploadImage: uploadImageMutation.mutateAsync,
    treatAsImageMutation,
    treatAsImage: treatAsImageMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    isPostingComment: commentMutation.isPending,
    isResolvingComment: resolveCommentMutation.isPending,
    isImageBusy:
      regenerateImageMutation.isPending ||
      uploadImageMutation.isPending ||
      treatAsImageMutation.isPending,
  };
}
