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
import { FormattedMessage } from "react-intl";

import { ContentEditorSegmentKeyMeta } from "@/components/content-editor/segment/content-editor-segment-key-meta";
import { contentEditorEditorPanelMessages } from "@/components/content-editor/shared/content-editor.messages";

import { ContentEditorMessagePreview } from "./content-editor-target-editor";

export function ContentEditorEditorSourceSection({
  sourceText,
  sourceLocale,
  segmentKey,
  sourcePath,
}: {
  sourceText: string;
  sourceLocale: string;
  segmentKey: string;
  sourcePath?: string | null;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <ContentEditorSegmentKeyMeta segmentKey={segmentKey} sourcePath={sourcePath} />
        <h3 className="text-xs font-medium text-muted-foreground">
          <FormattedMessage
            {...contentEditorEditorPanelMessages.sourceHeading}
            values={{ locale: sourceLocale }}
          />
        </h3>
      </div>
      <p className="text-pretty text-base leading-relaxed text-foreground lg:text-lg">
        <ContentEditorMessagePreview message={sourceText} />
      </p>
    </section>
  );
}
