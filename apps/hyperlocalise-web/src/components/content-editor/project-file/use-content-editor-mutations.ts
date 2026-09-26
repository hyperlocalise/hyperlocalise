"use client";

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
import { useEffect, useRef, type MutableRefObject } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useIntl, type IntlShape } from "react-intl";

import {
  maxCatLockedStringBatch,
  maxNativeContentEditorHiddenStringBatch,
  type ProjectFileContentEditorQueueFile,
} from "@/api/routes/project/project.schema";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import { goSvcErrorMessage, isCatDeferredToApp } from "@/lib/go-svc/go-svc-error";

import type {
  ContentEditorIssueType,
  ContentEditorQueueSegment,
} from "@/components/content-editor/shared/types";

import { requireProviderExternalResourceId } from "./project-file-content-editor-mapper";
import { isContentEditorAllFilesSourcePath } from "@/lib/projects/content-editor-all-files";
import {
  projectFileCatSegmentCommentsQueryKey,
  useInvalidateCatSegmentComments,
} from "./use-content-editor-segment-comments";
import {
  useInvalidateCatSegmentTarget,
  useSyncCatSegmentTargetAfterSave,
} from "./use-content-editor-segment-target";
import { useContentEditorMutationsMessages } from "./use-content-editor-mutations.messages";

const INLINE_QUEUE_REFRESH_DELAY_MS = 750;

export type ContentEditorSegmentFileIdentity = Pick<
  ContentEditorQueueSegment,
  "sourcePath" | "externalResourceId" | "resourceType"
>;

/**
 * Reads identity for segments the workspace still holds after their queue page was
 * evicted from the bounded page window, so mutations on a retained selection resolve
 * a real source file instead of the aggregate "all files" path.
 */
export type ContentEditorSegmentFileIdentityLookupRef = MutableRefObject<
  ((externalStringId: string) => ContentEditorSegmentFileIdentity | undefined) | null
>;

function resolveCatMutationFileIdentity(
  input: {
    sourcePath: string;
    contentEditorFile: ProjectFileContentEditorQueueFile | null | undefined;
    retainedSegmentIdentityRef?: ContentEditorSegmentFileIdentityLookupRef;
  },
  externalStringId: string,
  intl: IntlShape,
) {
  const segment: ContentEditorSegmentFileIdentity | undefined =
    input.contentEditorFile?.segments.find(
      (entry) => entry.externalStringId === externalStringId,
    ) ?? input.retainedSegmentIdentityRef?.current?.(externalStringId);
  const sourcePath =
    segment?.sourcePath?.trim() ||
    (isContentEditorAllFilesSourcePath(input.sourcePath) ? "" : input.sourcePath);

  if (!sourcePath) {
    throw new Error(intl.formatMessage(useContentEditorMutationsMessages.missingSegmentSourceFile));
  }

  const externalResourceId = segment?.externalResourceId
    ? segment.externalResourceId
    : input.contentEditorFile?.provider
      ? requireProviderExternalResourceId(input.contentEditorFile, intl)
      : undefined;
  const resourceType = segment?.resourceType ?? input.contentEditorFile?.provider?.resourceType;

  return { sourcePath, externalResourceId, resourceType };
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function prefersGoSvcCat(input: {
  goSvcClient?: GoSvcClient;
  contentEditorFile: ProjectFileContentEditorQueueFile | null | undefined;
}) {
  return Boolean(input.goSvcClient) && !input.contentEditorFile?.provider;
}

async function captureNativeCatTranslationReportingViaApp(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  externalStringId: string;
  text: string;
  approve?: boolean;
}) {
  try {
    await apiClient.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.translations["reporting-capture"].$post({
      param: {
        organizationSlug: input.organizationSlug,
        projectId: input.projectId,
      },
      json: {
        sourcePath: input.sourcePath,
        targetLocale: input.targetLocale,
        externalStringId: input.externalStringId,
        text: input.text,
        approve: input.approve,
      },
    });
  } catch {
    // Reporting capture is best-effort and must not block CAT saves.
  }
}

async function runNativeCat<T>(
  preferGoSvc: boolean,
  goSvc: () => Promise<T>,
  app: () => Promise<T>,
  fallback: string,
): Promise<T> {
  if (!preferGoSvc) {
    return app();
  }

  try {
    return await goSvc();
  } catch (error) {
    if (isCatDeferredToApp(error)) {
      return app();
    }
    throw new Error(goSvcErrorMessage(error, fallback));
  }
}

export function useContentEditorMutations(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  contentEditorFile: ProjectFileContentEditorQueueFile | null | undefined;
  retainedSegmentIdentityRef?: ContentEditorSegmentFileIdentityLookupRef;
  invalidateQueue: () => Promise<void>;
  onTranslationSaved?: (segmentId: string, targetText: string, isApproved: boolean) => void;
  goSvcClient?: GoSvcClient;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const invalidateSegmentTarget = useInvalidateCatSegmentTarget();
  const syncSegmentTargetAfterSave = useSyncCatSegmentTargetAfterSave();
  const invalidateSegmentComments = useInvalidateCatSegmentComments();

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRefreshes = useRef(new Set<() => Promise<void>>());
  const flushQueueRefreshes = () => {
    refreshTimer.current = null;
    for (const refresh of pendingRefreshes.current) void refresh().catch(() => undefined);
    pendingRefreshes.current.clear();
  };
  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      for (const refresh of pendingRefreshes.current) void refresh().catch(() => undefined);
      pendingRefreshes.current.clear();
    },
    [],
  );

  const saveMutation = useMutation({
    mutationFn: async (mutationInput: {
      externalStringId: string;
      text: string;
      approve?: boolean;
      deferQueueRefresh?: boolean;
      targetLocale?: string;
      coalesceQueueRefresh?: boolean;
    }) => {
      const segment = input.contentEditorFile?.segments.find(
        (entry) => entry.externalStringId === mutationInput.externalStringId,
      );
      // Hidden is informational (hidden-string ADRs). Only an explicit lock blocks saves.
      if (segment?.isLocked) {
        throw new Error(
          intl.formatMessage(useContentEditorMutationsMessages.cannotEditLockedStringTranslation),
        );
      }

      const { sourcePath, externalResourceId } = resolveCatMutationFileIdentity(
        input,
        mutationInput.externalStringId,
        intl,
      );
      const fallback = intl.formatMessage(
        useContentEditorMutationsMessages.failedToSaveTranslation,
      );

      return runNativeCat(
        prefersGoSvcCat(input),
        async () => {
          const body = await input.goSvcClient!.cat.saveTranslation(
            input.organizationSlug,
            input.projectId,
            {
              sourcePath,
              targetLocale: mutationInput.targetLocale ?? input.targetLocale,
              externalStringId: mutationInput.externalStringId,
              text: mutationInput.text,
              approve: mutationInput.approve,
            },
          );
          await captureNativeCatTranslationReportingViaApp({
            organizationSlug: input.organizationSlug,
            projectId: input.projectId,
            sourcePath,
            targetLocale: mutationInput.targetLocale ?? input.targetLocale,
            externalStringId: mutationInput.externalStringId,
            text: mutationInput.text,
            approve: mutationInput.approve,
          });
          return body.translation;
        },
        async () => {
          const response = await apiClient.api.orgs[":organizationSlug"].projects[
            ":projectId"
          ].files.detail.cat.translations.$post({
            param: {
              organizationSlug: input.organizationSlug,
              projectId: input.projectId,
            },
            json: {
              sourcePath,
              targetLocale: mutationInput.targetLocale ?? input.targetLocale,
              externalStringId: mutationInput.externalStringId,
              externalResourceId,
              text: mutationInput.text,
              approve: mutationInput.approve,
            },
          });

          if (response.status !== 200) {
            throw new Error(await readApiError(response, fallback));
          }

          const body = await response.json();
          return body.translation;
        },
        fallback,
      );
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
        targetLocale: variables.targetLocale ?? input.targetLocale,
        externalStringId: variables.externalStringId,
      };

      // Reconcile the saved target before releasing the mutation, but never wait for
      // unrelated reads. Bulk operations refresh the queue once when complete.
      await syncSegmentTargetAfterSave(segmentTargetInput, translation);
      if (variables.coalesceQueueRefresh) {
        pendingRefreshes.current.add(input.invalidateQueue);
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(flushQueueRefreshes, INLINE_QUEUE_REFRESH_DELAY_MS);
      } else if (!variables.deferQueueRefresh) {
        void input.invalidateQueue().catch(() => undefined);
      }
    },
  });

  const commentMutation = useMutation({
    mutationFn: async (mutationInput: {
      externalStringId: string;
      text: string;
      type?: "comment" | "issue";
      issueType?: ContentEditorIssueType;
    }) => {
      const { sourcePath, externalResourceId } = resolveCatMutationFileIdentity(
        input,
        mutationInput.externalStringId,
        intl,
      );
      const fallback = intl.formatMessage(useContentEditorMutationsMessages.failedToPostComment);

      return runNativeCat(
        prefersGoSvcCat(input),
        async () => {
          const body = await input.goSvcClient!.cat.saveComment(
            input.organizationSlug,
            input.projectId,
            {
              sourcePath,
              targetLocale: input.targetLocale,
              externalStringId: mutationInput.externalStringId,
              text: mutationInput.text,
              type: mutationInput.type,
              issueType: mutationInput.issueType,
            },
          );
          return body.comment;
        },
        async () => {
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

          if (response.status !== 200) {
            throw new Error(await readApiError(response, fallback));
          }

          const body = await response.json();
          return body.comment;
        },
        fallback,
      );
    },
    onSuccess: async (comment, variables) => {
      const { sourcePath, externalResourceId, resourceType } = resolveCatMutationFileIdentity(
        input,
        variables.externalStringId,
        intl,
      );

      const commentKey = projectFileCatSegmentCommentsQueryKey({
        organizationSlug: input.organizationSlug,
        projectId: input.projectId,
        sourcePath,
        externalResourceId,
        resourceType,
        targetLocale: input.targetLocale,
        externalStringId: variables.externalStringId,
      });
      await queryClient.cancelQueries({ queryKey: commentKey });
      // Do not fabricate a complete collection when the comments have not loaded.
      queryClient.setQueryData<Array<typeof comment>>(commentKey, (previous) =>
        previous
          ? previous.some((entry) => entry.externalCommentId === comment.externalCommentId)
            ? previous.map((entry) =>
                entry.externalCommentId === comment.externalCommentId ? comment : entry,
              )
            : [...previous, comment]
          : previous,
      );
      void Promise.allSettled([
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
      const fallback = intl.formatMessage(useContentEditorMutationsMessages.failedToResolveIssue);

      return runNativeCat(
        prefersGoSvcCat(input),
        async () => {
          const body = await input.goSvcClient!.cat.resolveComment(
            input.organizationSlug,
            input.projectId,
            mutationInput.externalCommentId,
            { sourcePath, externalResourceId },
          );
          return body.comment;
        },
        async () => {
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

          if (response.status !== 200) {
            throw new Error(await readApiError(response, fallback));
          }

          const body = await response.json();
          return body.comment;
        },
        fallback,
      );
    },
    onSuccess: async (comment, variables) => {
      const { sourcePath, externalResourceId, resourceType } = resolveCatMutationFileIdentity(
        input,
        variables.externalStringId,
        intl,
      );

      const commentKey = projectFileCatSegmentCommentsQueryKey({
        organizationSlug: input.organizationSlug,
        projectId: input.projectId,
        sourcePath,
        externalResourceId,
        resourceType,
        targetLocale: input.targetLocale,
        externalStringId: variables.externalStringId,
      });
      await queryClient.cancelQueries({ queryKey: commentKey });
      // Do not fabricate a complete collection when the comments have not loaded.
      queryClient.setQueryData<Array<typeof comment>>(commentKey, (previous) =>
        previous
          ? previous.some((entry) => entry.externalCommentId === comment.externalCommentId)
            ? previous.map((entry) =>
                entry.externalCommentId === comment.externalCommentId ? comment : entry,
              )
            : [...previous, comment]
          : previous,
      );
      void Promise.allSettled([
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

      if (response.status !== 200) {
        throw new Error(
          await readApiError(
            response,
            intl.formatMessage(useContentEditorMutationsMessages.failedToRegenerateImage),
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
      const { sourcePath, externalResourceId } = resolveCatMutationFileIdentity(
        input,
        mutationInput.externalStringId,
        intl,
      );
      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.cat.images.upload.$post({
        param: {
          organizationSlug: input.organizationSlug,
          projectId: input.projectId,
        },
        form: {
          sourcePath,
          targetLocale: input.targetLocale,
          externalStringId: mutationInput.externalStringId,
          file: mutationInput.file,
          ...(mutationInput.force ? { force: "true" } : {}),
          ...(externalResourceId ? { externalResourceId } : {}),
        },
      } as never);

      if (response.status !== 200) {
        throw new Error(
          await readApiError(
            response,
            intl.formatMessage(useContentEditorMutationsMessages.failedToUploadImage),
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
      const fallback = intl.formatMessage(
        useContentEditorMutationsMessages.failedToUpdateImageMode,
      );

      return runNativeCat(
        prefersGoSvcCat(input),
        () =>
          input.goSvcClient!.cat.treatAsImage(
            input.organizationSlug,
            input.projectId,
            mutationInput.externalStringId,
            {
              sourcePath,
              targetLocale: input.targetLocale,
              externalStringId: mutationInput.externalStringId,
              externalResourceId,
              treatAsImage: mutationInput.treatAsImage,
            },
          ),
        async () => {
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

          if (response.status !== 200) {
            throw new Error(await readApiError(response, fallback));
          }

          return response.json();
        },
        fallback,
      );
    },
    onSuccess: async (_data, variables) => {
      await invalidateAfterImageChange(variables.externalStringId);
    },
  });

  const treatAsVideoMutation = useMutation({
    mutationFn: async (mutationInput: { externalStringId: string; treatAsVideo: boolean }) => {
      const { sourcePath } = resolveCatMutationFileIdentity(
        input,
        mutationInput.externalStringId,
        intl,
      );
      const fallback = intl.formatMessage(
        useContentEditorMutationsMessages.failedToUpdateVideoMode,
      );

      return runNativeCat(
        prefersGoSvcCat(input),
        () =>
          input.goSvcClient!.cat.treatAsVideo(
            input.organizationSlug,
            input.projectId,
            mutationInput.externalStringId,
            {
              sourcePath,
              targetLocale: input.targetLocale,
              externalStringId: mutationInput.externalStringId,
              treatAsVideo: mutationInput.treatAsVideo,
            },
          ),
        async () => {
          const response = await apiClient.api.orgs[":organizationSlug"].projects[
            ":projectId"
          ].files.detail.cat.segments[":externalStringId"]["treat-as-video"].$post({
            param: {
              organizationSlug: input.organizationSlug,
              projectId: input.projectId,
              externalStringId: mutationInput.externalStringId,
            },
            json: {
              sourcePath,
              targetLocale: input.targetLocale,
              externalStringId: mutationInput.externalStringId,
              treatAsVideo: mutationInput.treatAsVideo,
            },
          });

          if (response.status !== 200) {
            throw new Error(await readApiError(response, fallback));
          }

          return response.json();
        },
        fallback,
      );
    },
    onSuccess: async (_data, variables) => {
      await invalidateAfterImageChange(variables.externalStringId);
    },
  });

  const hiddenStringsMutation = useMutation({
    mutationFn: async (mutationInput: { externalStringIds: string[]; isHidden: boolean }) => {
      const uniqueIds = [...new Set(mutationInput.externalStringIds)];
      const chunks = chunkItems(uniqueIds, maxNativeContentEditorHiddenStringBatch);
      let updatedCount = 0;
      const fallback = intl.formatMessage(
        useContentEditorMutationsMessages.failedToUpdateHiddenStrings,
      );

      for (const externalStringIds of chunks) {
        const body = {
          sourcePath: input.sourcePath,
          externalStringIds,
          isHidden: mutationInput.isHidden,
        };
        const saved = await runNativeCat(
          prefersGoSvcCat(input),
          () => input.goSvcClient!.cat.setHidden(input.organizationSlug, input.projectId, body),
          async () => {
            const response = await apiClient.api.orgs[":organizationSlug"].projects[
              ":projectId"
            ].files.detail.cat.strings.hidden.$post({
              param: {
                organizationSlug: input.organizationSlug,
                projectId: input.projectId,
              },
              json: body,
            });

            if (response.status !== 200) {
              throw new Error(await readApiError(response, fallback));
            }

            return response.json();
          },
          fallback,
        );
        updatedCount += saved.updatedCount;
      }

      return { updatedCount, isHidden: mutationInput.isHidden };
    },
    onSuccess: async () => {
      await input.invalidateQueue();
    },
  });

  const lockedStringsMutation = useMutation({
    mutationFn: async (mutationInput: { externalStringIds: string[]; isLocked: boolean }) => {
      const uniqueIds = [...new Set(mutationInput.externalStringIds)];
      const chunks = chunkItems(uniqueIds, maxCatLockedStringBatch);
      let updatedCount = 0;
      const fallback = intl.formatMessage(
        useContentEditorMutationsMessages.failedToUpdateLockedStrings,
      );

      for (const externalStringIds of chunks) {
        const body = {
          sourcePath: input.sourcePath,
          targetLocale: input.targetLocale,
          externalStringIds,
          isLocked: mutationInput.isLocked,
        };
        const saved = await runNativeCat(
          prefersGoSvcCat(input),
          () => input.goSvcClient!.cat.setLocked(input.organizationSlug, input.projectId, body),
          async () => {
            const response = await apiClient.api.orgs[":organizationSlug"].projects[
              ":projectId"
            ].files.detail.cat.strings.locked.$post({
              param: {
                organizationSlug: input.organizationSlug,
                projectId: input.projectId,
              },
              json: body,
            });

            if (response.status !== 200) {
              throw new Error(await readApiError(response, fallback));
            }

            return response.json();
          },
          fallback,
        );
        updatedCount += saved.contentEditorSegmentLock.updatedCount;
      }

      return { updatedCount, isLocked: mutationInput.isLocked };
    },
    onSuccess: async () => {
      await input.invalidateQueue();
    },
  });

  const maxLengthMutation = useMutation({
    mutationFn: async (mutationInput: { externalStringId: string; maxLength: number | null }) => {
      const { sourcePath } = resolveCatMutationFileIdentity(
        input,
        mutationInput.externalStringId,
        intl,
      );
      const fallback = intl.formatMessage(
        useContentEditorMutationsMessages.failedToUpdateMaxLength,
      );

      return runNativeCat(
        prefersGoSvcCat(input),
        () =>
          input.goSvcClient!.cat.setMaxLength(
            input.organizationSlug,
            input.projectId,
            mutationInput.externalStringId,
            {
              sourcePath,
              externalStringId: mutationInput.externalStringId,
              maxLength: mutationInput.maxLength,
            },
          ),
        async () => {
          const response = await apiClient.api.orgs[":organizationSlug"].projects[
            ":projectId"
          ].files.detail.cat.segments[":externalStringId"]["max-length"].$post({
            param: {
              organizationSlug: input.organizationSlug,
              projectId: input.projectId,
              externalStringId: mutationInput.externalStringId,
            },
            json: {
              sourcePath,
              externalStringId: mutationInput.externalStringId,
              maxLength: mutationInput.maxLength,
            },
          });

          if (response.status !== 200) {
            throw new Error(await readApiError(response, fallback));
          }

          return response.json();
        },
        fallback,
      );
    },
    onSuccess: async () => {
      await input.invalidateQueue();
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
    treatAsVideoMutation,
    treatAsVideo: treatAsVideoMutation.mutateAsync,
    setStringsHidden: hiddenStringsMutation.mutateAsync,
    setStringsLocked: lockedStringsMutation.mutateAsync,
    setMaxLength: maxLengthMutation.mutateAsync,
    isSavingMaxLength: maxLengthMutation.isPending,
    isSaving: saveMutation.isPending,
    isPostingComment: commentMutation.isPending,
    isResolvingComment: resolveCommentMutation.isPending,
    isImageBusy:
      regenerateImageMutation.isPending ||
      uploadImageMutation.isPending ||
      treatAsImageMutation.isPending ||
      treatAsVideoMutation.isPending,
  };
}
