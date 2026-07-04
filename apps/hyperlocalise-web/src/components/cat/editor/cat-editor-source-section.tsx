"use client";

import { FormattedMessage } from "react-intl";

import { catEditorPanelMessages } from "@/components/cat/shared/cat.messages";

import { CatMessagePreview } from "./cat-target-editor";

export function CatEditorSourceSection({
  sourceText,
  sourceLocale,
  segmentKey,
}: {
  sourceText: string;
  sourceLocale: string;
  segmentKey: string;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <p
          className="truncate font-mono text-[11px] leading-5 text-muted-foreground"
          title={segmentKey}
        >
          {segmentKey}
        </p>
        <h3 className="text-xs font-medium text-muted-foreground">
          <FormattedMessage
            {...catEditorPanelMessages.sourceHeading}
            values={{ locale: sourceLocale }}
          />
        </h3>
      </div>
      <p className="text-pretty text-base leading-relaxed text-foreground/92 lg:text-lg">
        <CatMessagePreview message={sourceText} />
      </p>
    </section>
  );
}
