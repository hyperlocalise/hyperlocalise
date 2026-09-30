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
import { useQuery } from "@tanstack/react-query";
import { observer } from "mobx-react-lite";
import { FormattedMessage, useIntl } from "react-intl";

import { useContentEditorWorkspace } from "@/components/content-editor/workspace/content-editor-workspace-context";
import { contentEditorLottieContextPanelMessages } from "@/components/content-editor/shared/content-editor.messages";
import {
  buildLottiePreviewValuesFromSegments,
  loadLottiePreviewPayload,
  lottiePreviewValuesFingerprint,
} from "@/lib/translation/lottie/lottie-preview-load";

import { ContentEditorLottiePlayer } from "./content-editor-lottie-player";

function ContentEditorLottieContextPanelContent({
  lottieSourceUrl,
  sourcePath,
  sourceLocale,
  targetLocale,
  activeSegmentKey,
  previewSegments,
}: {
  lottieSourceUrl: string;
  sourcePath: string;
  sourceLocale: string;
  targetLocale: string;
  activeSegmentKey?: string;
  previewSegments: ReadonlyArray<{ key: string; sourceText: string; targetText: string }>;
}) {
  const intl = useIntl();

  const sourceValues = buildLottiePreviewValuesFromSegments(previewSegments, "source");
  const targetValues = buildLottiePreviewValuesFromSegments(previewSegments, "target");
  const sourceFingerprint = lottiePreviewValuesFingerprint(sourceValues);
  const targetFingerprint = lottiePreviewValuesFingerprint(targetValues);

  const sourceQuery = useQuery({
    queryKey: [
      "cat-lottie-preview",
      lottieSourceUrl,
      "source",
      sourceFingerprint,
      activeSegmentKey,
    ],
    queryFn: () =>
      loadLottiePreviewPayload({
        sourceUrl: lottieSourceUrl,
        sourcePath,
        values: sourceValues,
        activeSegmentKey,
      }),
    staleTime: 60_000,
  });

  const targetQuery = useQuery({
    queryKey: [
      "cat-lottie-preview",
      lottieSourceUrl,
      "target",
      targetFingerprint,
      activeSegmentKey,
    ],
    queryFn: () =>
      loadLottiePreviewPayload({
        sourceUrl: lottieSourceUrl,
        sourcePath,
        values: targetValues,
        activeSegmentKey,
      }),
    staleTime: 10_000,
  });

  const emptyLabel = intl.formatMessage(contentEditorLottieContextPanelMessages.previewUnavailable);

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xs font-medium text-muted-foreground">
          <FormattedMessage {...contentEditorLottieContextPanelMessages.title} />
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          <FormattedMessage {...contentEditorLottieContextPanelMessages.description} />
        </p>
      </div>

      <div className="space-y-4">
        <figure className="space-y-2">
          <figcaption className="text-xs font-medium text-muted-foreground">
            <FormattedMessage
              {...contentEditorLottieContextPanelMessages.sourcePreview}
              values={{ locale: sourceLocale }}
            />
          </figcaption>
          <ContentEditorLottiePlayer
            animationData={sourceQuery.data ?? null}
            isLoading={sourceQuery.isLoading}
            emptyLabel={emptyLabel}
          />
        </figure>

        <figure className="space-y-2">
          <figcaption className="text-xs font-medium text-muted-foreground">
            <FormattedMessage
              {...contentEditorLottieContextPanelMessages.targetPreview}
              values={{ locale: targetLocale }}
            />
          </figcaption>
          <ContentEditorLottiePlayer
            animationData={targetQuery.data ?? null}
            isLoading={targetQuery.isLoading}
            emptyLabel={emptyLabel}
          />
        </figure>
      </div>
    </section>
  );
}

export const ContentEditorLottieContextPanel = observer(function ContentEditorLottieContextPanel({
  activeSegmentKey,
}: {
  activeSegmentKey?: string;
}) {
  const workspace = useContentEditorWorkspace();
  const lottieSourceUrl = workspace.fileContext.lottieSourceUrl;

  if (!lottieSourceUrl) {
    return null;
  }

  const previewSegments = workspace.getQueuePanelSegments("all", false).map((segment) => ({
    key: segment.key,
    sourceText: segment.sourceText,
    targetText: segment.targetText,
  }));

  return (
    <ContentEditorLottieContextPanelContent
      lottieSourceUrl={lottieSourceUrl}
      sourcePath={workspace.fileContext.sourcePath}
      sourceLocale={workspace.fileContext.sourceLocale}
      targetLocale={workspace.fileContext.targetLocale}
      activeSegmentKey={activeSegmentKey}
      previewSegments={previewSegments}
    />
  );
});
