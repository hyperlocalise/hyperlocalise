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
import { useId, type ReactNode } from "react";
import { FormattedMessage } from "react-intl";
import type { Icon } from "@phosphor-icons/react";

import { AgentPulse } from "@/components/ai-elements/agent-pulse";
import { cn } from "@/lib/primitives/cn";

import { workspaceEmptyStateMessages as messages } from "./workspace-empty-state.messages";

/** Delay between sketch rows; matches the unicorn's hop in `empty-state-unicorn`. */
const ROW_STAGGER_SECONDS = 0.6;

type WorkspaceEmptyStateFeature = {
  icon: Icon;
  title: ReactNode;
  description: ReactNode;
};

/**
 * A first-run explainer for an empty workspace list: what the feature is for,
 * how Hyperlocalise uses it, and one action to create the first item. The copy
 * sits beside an animated sketch, with the points in a row below.
 */
export function WorkspaceEmptyState({
  title,
  description,
  features,
  preview,
  action,
  secondaryAction,
  className,
}: {
  title: ReactNode;
  description: ReactNode;
  /** What the feature does and how Hyperlocalise uses it; three reads best. */
  features: readonly WorkspaceEmptyStateFeature[];
  /** A decorative sketch beside the copy; `WorkspaceEmptyStateSheet` is its usual frame. */
  preview: ReactNode;
  action: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "flex w-full flex-col gap-10 py-4 animate-in duration-500 fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none",
        className,
      )}
    >
      <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
        <div className="flex flex-col items-start">
          <p className="text-xs font-medium text-muted-foreground">
            <FormattedMessage {...messages.eyebrow} />
          </p>
          <h2
            id={titleId}
            className="mt-2 text-2xl leading-tight font-semibold tracking-tight text-balance text-foreground"
          >
            {title}
          </h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-pretty text-muted-foreground">
            {description}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {action}
            {secondaryAction}
          </div>
        </div>
        <div
          aria-hidden="true"
          className="relative flex aspect-[5/3] items-center justify-center overflow-hidden rounded-3xl bg-linear-to-br from-primary/20 via-accent/60 to-transparent"
        >
          {preview}
        </div>
      </div>
      <ul className="grid gap-6 border-t border-border pt-8 sm:grid-cols-3">
        {features.map(
          ({ icon: FeatureIcon, title: featureTitle, description: featureDescription }, index) => (
            <li key={index} className="flex flex-col gap-3">
              <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-foreground">
                <FeatureIcon className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{featureTitle}</p>
                <p className="mt-1 text-sm leading-6 text-pretty text-muted-foreground">
                  {featureDescription}
                </p>
              </div>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

/** The floating sheet a `WorkspaceEmptyState` preview sketches its content on. */
export function WorkspaceEmptyStateSheet({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "empty-state-float flex w-[min(18rem,80%)] flex-col gap-2 rounded-xl bg-popover p-3 shadow-xl ring-1 ring-border",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Four sketch rows the unicorn works through: it hops down one row at a time,
 * and `renderRow` finishes each row as it lands (pass `delay` to the row's
 * animated parts). Rows are a fixed height so the hops line up.
 */
export function WorkspaceEmptyStateRows<Row>({
  rows,
  renderRow,
}: {
  rows: readonly Row[];
  renderRow: (row: Row, delay: { animationDelay: string }) => ReactNode;
}) {
  return (
    <div className="relative flex flex-col gap-1.5">
      <span className="empty-state-unicorn absolute inset-x-0 top-0 flex h-6 items-center justify-end rounded-md bg-primary/10">
        <AgentPulse className="m-0 -me-10 size-8 rtl:-scale-x-100" />
      </span>
      {rows.map((row, index) => (
        <div key={index} className="relative flex h-6 items-center gap-2 px-2">
          {renderRow(row, { animationDelay: `${index * ROW_STAGGER_SECONDS}s` })}
        </div>
      ))}
    </div>
  );
}
