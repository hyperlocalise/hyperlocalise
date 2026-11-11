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

import * as React from "react";
import Image from "next/image";
import { TypographyH2, TypographyP } from "@/components/ui/typography";

import type { UseCasePageContent } from "./use-case-page-content";
import { useCasePageMessages, type UseCaseMessageKey } from "./use-case-page-content.messages";
import { FormattedMessage } from "react-intl";

function Message({ messageKey }: { messageKey: UseCaseMessageKey }) {
  return <FormattedMessage {...useCasePageMessages[messageKey]} />;
}

const sources = [
  {
    id: "github",
    name: "GitHub",
    logo: "/images/github-logo.svg",
    painIndex: 0,
  },
  {
    id: "slack",
    name: "Slack",
    logo: "/images/slack-logo.svg",
    painIndex: 1,
  },
  {
    id: "notion",
    name: "Notion",
    logo: "/images/notion.svg",
    painIndex: 2,
  },
  {
    id: "figma",
    name: "Figma",
    logo: "/images/figma-logo.svg",
    painIndex: 3,
  },
] as const;

export function ProductLocalisationShift({ content }: { content: UseCasePageContent }) {
  const [selected, setSelected] = React.useState(0);
  const activeSource = sources[selected];

  return (
    <div className="mt-12 overflow-hidden rounded-[1.5rem] border border-border bg-background shadow-[0_20px_48px_rgba(0,0,0,0.14)] sm:rounded-[2rem]">
      <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
        <div className="border-b border-border p-6 sm:p-8 lg:border-b-0 lg:border-r lg:p-10">
          <TypographyP className="text-[0.95rem] tracking-[-0.02em]" tone="subtle">
            <Message messageKey="problemPanelEyebrow" />
          </TypographyP>

          <TypographyH2 className="mt-8 max-w-xl text-3xl leading-[1.08] tracking-[-0.04em] sm:text-4xl">
            <Message messageKey={content.problem.titleKey} />
          </TypographyH2>

          <div className="mt-6 flex flex-wrap gap-2">
            {sources.map(({ id, name, logo }, index) => {
              const active = selected === index;

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelected(index)}
                  aria-label={name}
                  aria-pressed={active}
                  className={[
                    "flex size-14 cursor-pointer items-center justify-center rounded-xl border",
                    "transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    active
                      ? "border-pink-500 bg-pink-100 text-pink-700"
                      : "border-border bg-muted/30 text-foreground hover:bg-muted",
                  ].join(" ")}
                >
                  {logo ? (
                    <Image
                      src={logo}
                      alt=""
                      width={24}
                      height={24}
                      className="size-6 object-contain"
                    />
                  ) : (
                    <span className="text-xs font-medium">{name}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col justify-between p-4 sm:p-6 lg:p-10">
          <div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-muted-foreground">{activeSource.name}</p>

              <span className="text-xs text-muted-foreground">
                {String(selected + 1).padStart(2, "0")}
              </span>
            </div>

            <div aria-live="polite" aria-atomic="true" className="mt-10">
              <TypographyP
                className="max-w-xl text-xl leading-relaxed tracking-[-0.02em] sm:text-2xl"
                tone="content"
              >
                <Message messageKey={content.problem.painKeys[activeSource.painIndex]} />
              </TypographyP>
            </div>
          </div>

          {/* Selection indicator */}
          <div className="mt-12 flex gap-2">
            {sources.map((source, index) => (
              <button
                key={source.id}
                type="button"
                onClick={() => setSelected(index)}
                aria-label={source.name}
                aria-pressed={selected === index}
                className={[
                  "h-1.5 flex-1 cursor-pointer rounded-full transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  selected === index ? "bg-pink-500" : "bg-muted",
                ].join(" ")}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
