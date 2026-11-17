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
import {
  ArrowRightIcon,
  CheckIcon,
  FolderSimpleIcon,
  LockSimpleIcon,
  PlusIcon,
  RobotIcon,
  TranslateIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import {
  WorkspaceEmptyState,
  WorkspaceEmptyStateRows,
  WorkspaceEmptyStateSheet,
} from "../../_components/workspace-empty-state";
import { glossariesEmptyStateMessages as messages } from "./glossaries-empty-state.messages";
import { glossariesPageViewMessages } from "./glossaries-page-view.messages";

const GLOSSARY_SKETCH = [
  { source: "w-16", target: "w-16", kept: true },
  { source: "w-12", target: "w-20", kept: false },
  { source: "w-20", target: "w-14", kept: false },
  { source: "w-14", target: "w-16", kept: false },
] as const;

/** Decorative sketch: the unicorn fills in each term's approved translation, row by row. */
function GlossaryPreview() {
  return (
    <WorkspaceEmptyStateSheet>
      <WorkspaceEmptyStateRows
        rows={GLOSSARY_SKETCH}
        renderRow={({ source, target, kept }, delay) => (
          <>
            <span className={cn("h-1.5 shrink-0 rounded-full bg-foreground/60", source)} />
            <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground rtl:rotate-180" />
            <span
              className={cn(
                "empty-state-fill h-1.5 shrink-0 rounded-full",
                target,
                kept ? "bg-foreground/60" : "bg-primary/70",
              )}
              style={delay}
            />
            <span className="empty-state-pop ms-auto flex" style={delay}>
              {kept ? (
                <LockSimpleIcon className="size-3 text-muted-foreground" />
              ) : (
                <CheckIcon weight="bold" className="size-3 text-foreground" />
              )}
            </span>
          </>
        )}
      />
    </WorkspaceEmptyStateSheet>
  );
}

export function GlossariesEmptyState({
  onCreate,
  secondaryAction,
}: {
  onCreate: () => void;
  secondaryAction?: ReactNode;
}) {
  return (
    <WorkspaceEmptyState
      title={<FormattedMessage {...messages.title} />}
      description={<FormattedMessage {...messages.description} />}
      preview={<GlossaryPreview />}
      features={[
        {
          icon: TranslateIcon,
          title: <FormattedMessage {...messages.feature1Title} />,
          description: <FormattedMessage {...messages.feature1Description} />,
        },
        {
          icon: RobotIcon,
          title: <FormattedMessage {...messages.feature2Title} />,
          description: <FormattedMessage {...messages.feature2Description} />,
        },
        {
          icon: FolderSimpleIcon,
          title: <FormattedMessage {...messages.feature3Title} />,
          description: <FormattedMessage {...messages.feature3Description} />,
        },
      ]}
      action={
        <Button type="button" onClick={onCreate}>
          <PlusIcon data-icon="inline-start" />
          <FormattedMessage {...glossariesPageViewMessages.createGlossary} />
        </Button>
      }
      secondaryAction={secondaryAction}
    />
  );
}
