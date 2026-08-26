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
import type { ReactNode } from "react";
import { FormattedMessage, type MessageDescriptor } from "react-intl";

import { cn } from "@/lib/primitives/cn";

export type MarketingMockUseCase = {
  id: string;
  title: string;
  description: string;
};

export function MarketingMockUseCaseSelector({
  eyebrow,
  headline,
  useCases,
  activeId,
  onSelect,
  cta,
}: {
  eyebrow: MessageDescriptor;
  headline: MessageDescriptor;
  useCases: readonly MarketingMockUseCase[];
  activeId: string;
  onSelect: (id: string) => void;
  cta?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col justify-between px-6 py-5">
      <div>
        <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-primary uppercase">
          <FormattedMessage {...eyebrow} />
        </p>
        <h3 className="mb-6 font-heading text-xl leading-snug font-semibold tracking-normal text-foreground sm:text-2xl">
          <FormattedMessage {...headline} />
        </h3>
        <div className="flex flex-col gap-2">
          {useCases.map((useCase) => (
            <button
              key={useCase.id}
              type="button"
              onClick={() => onSelect(useCase.id)}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-sm border px-4 py-3.5 text-left transition-all duration-200",
                useCase.id === activeId
                  ? "border-primary/30 bg-primary/6"
                  : "border-transparent hover:border-border/60 hover:bg-muted/30",
              )}
            >
              <div
                className={cn(
                  "mt-1 w-0.5 self-stretch rounded-full transition-all duration-200",
                  useCase.id === activeId ? "bg-primary" : "bg-transparent",
                )}
              />
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm leading-snug font-semibold transition-colors",
                    useCase.id === activeId ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {useCase.title}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-xs leading-relaxed transition-colors",
                    useCase.id === activeId ? "text-muted-foreground" : "text-muted-foreground/50",
                  )}
                >
                  {useCase.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {cta ? <div className="mt-4 flex items-center">{cta}</div> : null}
    </div>
  );
}
