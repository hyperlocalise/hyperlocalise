"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { FormattedMessage } from "react-intl";

import { CatSegmentKeyMeta } from "@/components/cat/segment/cat-segment-key-meta";
import { catEditorPanelMessages } from "@/components/cat/shared/cat.messages";

import { CatMessagePreview } from "./cat-target-editor";

export function CatEditorSourceSection({
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
        <CatSegmentKeyMeta segmentKey={segmentKey} sourcePath={sourcePath} />
        <h3 className="text-xs font-medium text-muted-foreground">
          <FormattedMessage
            {...catEditorPanelMessages.sourceHeading}
            values={{ locale: sourceLocale }}
          />
        </h3>
      </div>
      <p className="text-pretty text-base leading-relaxed text-foreground lg:text-lg">
        <CatMessagePreview message={sourceText} />
      </p>
    </section>
  );
}
