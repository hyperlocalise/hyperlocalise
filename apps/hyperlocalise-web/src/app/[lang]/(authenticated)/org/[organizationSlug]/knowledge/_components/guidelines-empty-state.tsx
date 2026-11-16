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
import Link from "next/link";
import {
  BookOpenTextIcon,
  CheckIcon,
  FolderSimpleIcon,
  PaperclipIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import {
  WorkspaceEmptyState,
  WorkspaceEmptyStateRows,
  WorkspaceEmptyStateSheet,
} from "../../_components/workspace-empty-state";
import { guidelinesEmptyStateMessages as messages } from "./guidelines-empty-state.messages";

const GUIDELINE_SKETCH = [
  { width: "w-28", checked: false },
  { width: "w-20", checked: true },
  { width: "w-24", checked: false },
  { width: "w-16", checked: true },
] as const;

/** Decorative sketch: the unicorn reads a guideline document line by line, checking the rules it finds. */
function GuidelinePreview() {
  return (
    <WorkspaceEmptyStateSheet className="px-4 py-3.5">
      <div className="flex items-center gap-2 px-2">
        <BookOpenTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="h-2 w-20 rounded-full bg-foreground/60" />
      </div>
      <WorkspaceEmptyStateRows
        rows={GUIDELINE_SKETCH}
        renderRow={({ width, checked }, delay) => (
          <>
            <span className={cn("h-1.5 rounded-full bg-muted-foreground/40", width)} />
            {checked ? (
              <span
                className="empty-state-pop ms-auto flex items-center gap-1 rounded-full bg-accent px-1.5 py-0.5"
                style={delay}
              >
                <CheckIcon weight="bold" className="size-3 text-foreground" />
                <span className="h-1 w-6 rounded-full bg-foreground/50" />
              </span>
            ) : null}
          </>
        )}
      />
    </WorkspaceEmptyStateSheet>
  );
}

export function GuidelinesEmptyState({ uploadHref }: { uploadHref: string }) {
  return (
    <WorkspaceEmptyState
      title={<FormattedMessage {...messages.title} />}
      description={<FormattedMessage {...messages.description} />}
      preview={<GuidelinePreview />}
      features={[
        {
          icon: PaperclipIcon,
          title: <FormattedMessage {...messages.feature1Title} />,
          description: <FormattedMessage {...messages.feature1Description} />,
        },
        {
          icon: CheckIcon,
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
        <Button type="button" nativeButton={false} render={<Link href={uploadHref} />}>
          <PlusIcon data-icon="inline-start" />
          <FormattedMessage {...messages.action} />
        </Button>
      }
    />
  );
}
