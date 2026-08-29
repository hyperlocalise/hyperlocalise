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
import { useIntl } from "react-intl";

import { ContentEditorVideoPreview } from "@/components/content-editor/editor/content-editor-video-preview";

import { contentEditorFileViewMessages } from "./content-editor-file-view.messages";

export const CAT_VIDEO_FILE_UPLOAD_ACCEPT = "video/mp4,.mp4";

export function ContentEditorVideoFileViewerPane({
  role,
  src,
  isLoading,
}: {
  role: "source" | "target";
  src?: string | null;
  isLoading?: boolean;
}) {
  const intl = useIntl();
  const emptyLabel =
    role === "source"
      ? intl.formatMessage(contentEditorFileViewMessages.sourceEmpty)
      : intl.formatMessage(contentEditorFileViewMessages.targetEmpty);

  if (isLoading) {
    return (
      <div className="flex min-h-56 items-center justify-center border border-dashed border-border text-sm text-muted-foreground">
        <span className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
      </div>
    );
  }

  return <ContentEditorVideoPreview src={src} emptyLabel={emptyLabel} className="min-h-56" />;
}
