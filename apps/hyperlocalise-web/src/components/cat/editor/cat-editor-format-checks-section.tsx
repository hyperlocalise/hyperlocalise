"use client";

import { FormattedMessage } from "react-intl";

import { Skeleton } from "@/components/ui/skeleton";

import { catEditorPanelMessages } from "@/components/cat/shared/cat.messages";
import type { CatFormatCheck } from "@/components/cat/shared/types";

import { CatFormatChecks } from "./cat-format-checks";

export function CatEditorFormatChecksSection({
  formatChecks,
  isLoading,
}: {
  formatChecks: CatFormatCheck[];
  isLoading: boolean;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-medium text-muted-foreground">
        <FormattedMessage {...catEditorPanelMessages.formatQaChecks} />
      </h3>
      {isLoading ? (
        <div className="space-y-0 divide-y divide-foreground/8 rounded-xl border border-foreground/8 bg-foreground/2">
          {[0, 1, 2].map((item) => (
            <div key={item} className="flex items-start gap-3 px-3 py-3">
              <Skeleton className="size-4 shrink-0 rounded-full bg-foreground/8" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-4 w-36 rounded-full bg-foreground/8" />
                  <Skeleton className="h-3 w-12 rounded-full bg-foreground/8" />
                </div>
                <Skeleton className="h-3 w-10/12 rounded-full bg-foreground/8" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <CatFormatChecks checks={formatChecks} />
      )}
    </section>
  );
}
