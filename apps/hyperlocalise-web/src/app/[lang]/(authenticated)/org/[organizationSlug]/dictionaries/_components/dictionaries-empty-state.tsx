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
import { CheckIcon, FolderSimpleIcon, PlusIcon, TextTIcon } from "@phosphor-icons/react";
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import {
  WorkspaceEmptyState,
  WorkspaceEmptyStateRows,
  WorkspaceEmptyStateSheet,
} from "../../_components/workspace-empty-state";
import { dictionariesEmptyStateMessages as messages } from "./dictionaries-empty-state.messages";
import { dictionariesPageViewMessages } from "./dictionaries-page-view.messages";

const DICTIONARY_SKETCH = [
  { words: ["w-10", "w-16", "w-8"], flagged: 1 },
  { words: ["w-14", "w-8", "w-12"], flagged: -1 },
  { words: ["w-8", "w-12", "w-14"], flagged: 2 },
  { words: ["w-12", "w-10", "w-10"], flagged: -1 },
] as const;

/** Decorative sketch: the unicorn clears each flagged word's squiggle once the dictionary allows it. */
function DictionaryPreview() {
  return (
    <WorkspaceEmptyStateSheet>
      <WorkspaceEmptyStateRows
        rows={DICTIONARY_SKETCH}
        renderRow={({ words, flagged }, delay) => (
          <>
            {words.map((width, index) => (
              <span
                key={index}
                className={cn(
                  "relative h-1.5 shrink-0 rounded-full",
                  width,
                  index === flagged ? "bg-foreground/60" : "bg-muted-foreground/40",
                )}
              >
                {index === flagged ? (
                  <span
                    className="empty-state-unflag absolute inset-x-0 -bottom-1.5 border-b-2 border-dotted border-destructive"
                    style={delay}
                  />
                ) : null}
              </span>
            ))}
            {flagged >= 0 ? (
              <span className="empty-state-pop ms-auto flex" style={delay}>
                <CheckIcon weight="bold" className="size-3 text-foreground" />
              </span>
            ) : null}
          </>
        )}
      />
    </WorkspaceEmptyStateSheet>
  );
}

export function DictionariesEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <WorkspaceEmptyState
      title={<FormattedMessage {...messages.title} />}
      description={<FormattedMessage {...messages.description} />}
      preview={<DictionaryPreview />}
      features={[
        {
          icon: TextTIcon,
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
        <Button type="button" onClick={onCreate}>
          <PlusIcon data-icon="inline-start" />
          <FormattedMessage {...dictionariesPageViewMessages.createDictionary} />
        </Button>
      }
    />
  );
}
