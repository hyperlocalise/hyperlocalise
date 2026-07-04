"use client";

import { useMutation } from "@tanstack/react-query";

import type {
  ProjectFileCatComment,
  ProjectFileCatResponse,
  ProjectFileCatTranslation,
} from "@/api/routes/project/project.schema";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

import type { CrowdinIssueType } from "@/components/cat/shared/types";

import { requireProviderExternalResourceId } from "./project-file-cat-mapper";
import { useInvalidateCatSegmentComments } from "./use-cat-segment-comments";
import { useInvalidateCatSegmentDetail } from "./use-cat-segment-detail";

export function useCatMutations(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  repositoryFullName?: string | null;
  catFile: ProjectFileCatResponse["catFile"] | null | undefined;
  invalidateQueue: () => Promise<void>;
  onTranslationSaved?: (segmentId: string, targetText: string, isApproved: boolean) => void;
}) {
  const invalidateSegmentDetail = useInvalidateCatSegmentDetail();
  const invalidateSegmentComments = useInvalidateCatSegmentComments();
  const repositoryFullName = input.repositoryFullName ?? null;

  const saveMutation = useMutation({
    mutationFn: async (mutationInput: {
      externalStringId: string;
      text: string;
      approve?: boolean;
    }) => {
      const externalResourceId = input.catFile?.provider
        ? requireProviderExternalResourceId(input.catFile)
        : undefined;

      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.cat.translations.$post({
        param: {
          organizationSlug: input.organizationSlug,
          projectId: input.projectId,
        },
        json: {
          sourcePath: input.sourcePath,
          targetLocale: input.targetLocale,
          externalStringId: mutationInput.externalStringId,
          externalResourceId,
          text: mutationInput.text,
          approve: mutationInput.approve,
        },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Failed to save translation"));
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
      await input.invalidateQueue();
    },
  });

  const commentMutation = useMutation({
    mutationFn: async (mutationInput: {
      externalStringId: string;
      text: string;
      type?: "comment" | "issue";
      issueType?: CrowdinIssueType;
    }) => {
      const externalResourceId = input.catFile?.provider
        ? requireProviderExternalResourceId(input.catFile)
        : undefined;

      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.cat.comments.$post({
        param: {
          organizationSlug: input.organizationSlug,
          projectId: input.projectId,
        },
        json: {
          sourcePath: input.sourcePath,
          targetLocale: input.targetLocale,
          externalStringId: mutationInput.externalStringId,
          externalResourceId,
          text: mutationInput.text,
          type: mutationInput.type,
          issueType: mutationInput.issueType,
        },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Failed to post comment"));
      }

      const body = (await response.json()) as { comment: ProjectFileCatComment };
      return body.comment;
    },
    onSuccess: async (_data, variables) => {
      const externalResourceId = input.catFile?.provider
        ? requireProviderExternalResourceId(input.catFile)
        : undefined;
      const resourceType = input.catFile?.provider?.resourceType;

      await Promise.all([
        input.invalidateQueue(),
        invalidateSegmentDetail({
          organizationSlug: input.organizationSlug,
          projectId: input.projectId,
          sourcePath: input.sourcePath,
          externalResourceId,
          resourceType,
          targetLocale: input.targetLocale,
          externalStringId: variables.externalStringId,
          repositoryFullName,
        }),
        invalidateSegmentComments({
          organizationSlug: input.organizationSlug,
          projectId: input.projectId,
          sourcePath: input.sourcePath,
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
      const externalResourceId = input.catFile?.provider
        ? requireProviderExternalResourceId(input.catFile)
        : undefined;

      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.cat.comments[":commentId"].resolve.$patch({
        param: {
          organizationSlug: input.organizationSlug,
          projectId: input.projectId,
          commentId: mutationInput.externalCommentId,
        },
        json: {
          sourcePath: input.sourcePath,
          externalResourceId,
        },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Failed to resolve issue"));
      }

      const body = (await response.json()) as { comment: ProjectFileCatComment };
      return body.comment;
    },
    onSuccess: async (_data, variables) => {
      const externalResourceId = input.catFile?.provider
        ? requireProviderExternalResourceId(input.catFile)
        : undefined;
      const resourceType = input.catFile?.provider?.resourceType;

      await Promise.all([
        input.invalidateQueue(),
        invalidateSegmentDetail({
          organizationSlug: input.organizationSlug,
          projectId: input.projectId,
          sourcePath: input.sourcePath,
          externalResourceId,
          resourceType,
          targetLocale: input.targetLocale,
          externalStringId: variables.externalStringId,
          repositoryFullName,
        }),
        invalidateSegmentComments({
          organizationSlug: input.organizationSlug,
          projectId: input.projectId,
          sourcePath: input.sourcePath,
          externalResourceId,
          resourceType,
          targetLocale: input.targetLocale,
          externalStringId: variables.externalStringId,
        }),
      ]);
    },
  });

  return {
    saveMutation,
    saveTranslation: saveMutation.mutateAsync,
    commentMutation,
    postComment: commentMutation.mutateAsync,
    resolveCommentMutation,
    resolveComment: resolveCommentMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    isPostingComment: commentMutation.isPending,
    isResolvingComment: resolveCommentMutation.isPending,
  };
}
