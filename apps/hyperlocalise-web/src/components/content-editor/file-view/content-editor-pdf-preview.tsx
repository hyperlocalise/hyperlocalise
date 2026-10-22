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

type ContentEditorPdfPreviewProps = {
  url: string | null;
  title: string;
};

export function ContentEditorPdfPreview({ url, title }: ContentEditorPdfPreviewProps) {
  if (!url) {
    return (
      <div className="flex min-h-56 items-center justify-center border border-dashed border-border text-sm text-muted-foreground">
        {title}
      </div>
    );
  }

  return (
    <iframe
      title={title}
      src={url}
      className="h-[min(70vh,720px)] w-full rounded-md border border-border bg-muted/20"
    />
  );
}
