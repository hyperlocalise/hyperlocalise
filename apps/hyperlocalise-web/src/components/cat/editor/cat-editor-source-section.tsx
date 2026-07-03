"use client";

import { FormattedMessage } from "react-intl";

import { catEditorPanelMessages } from "@/components/cat/shared/cat.messages";

import { CatMessagePreview } from "./cat-target-editor";

export function CatEditorSourceSection({
  sourceText,
  sourceLocale,
}: {
  sourceText: string;
  sourceLocale: string;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-medium text-muted-foreground">
        <FormattedMessage
          {...catEditorPanelMessages.sourceHeading}
          values={{ locale: sourceLocale }}
        />
      </h3>
      <p className="text-pretty text-base leading-relaxed text-foreground/92 lg:text-lg">
        <CatMessagePreview message={sourceText} />
      </p>
    </section>
  );
}
