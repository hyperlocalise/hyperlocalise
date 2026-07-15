"use client";

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
