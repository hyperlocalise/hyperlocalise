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
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { useSpellcheckDictionaryContext } from "@/components/content-editor/project-file/spellcheck-dictionary-context";
import { cn } from "@/lib/primitives/cn";

import { formatCheckStatusClass } from "@/components/content-editor/segment/content-editor-tone";
import { contentEditorFormatChecksMessages } from "@/components/content-editor/shared/content-editor.messages";
import type { ContentEditorFormatCheck } from "@/components/content-editor/shared/types";

import { ContentEditorFormatCheckStatusIcon } from "./content-editor-format-check-status-icon";

function formatCheckStatusLabel(
  status: ContentEditorFormatCheck["status"],
  intl: ReturnType<typeof useIntl>,
) {
  switch (status) {
    case "pass":
      return intl.formatMessage(contentEditorFormatChecksMessages.statusPass);
    case "warn":
      return intl.formatMessage(contentEditorFormatChecksMessages.statusWarn);
    case "fail":
      return intl.formatMessage(contentEditorFormatChecksMessages.statusFail);
    default:
      return status;
  }
}

export function ContentEditorFormatChecks({ checks }: { checks: ContentEditorFormatCheck[] }) {
  const intl = useIntl();
  const dictionary = useSpellcheckDictionaryContext();

  if (checks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-subtle-foreground">
        <FormattedMessage {...contentEditorFormatChecksMessages.emptyChecks} />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <ul className="divide-y divide-border">
        {checks.map((check) => (
          <li key={check.id} className="flex items-start gap-3 bg-background px-3 py-3">
            <ContentEditorFormatCheckStatusIcon status={check.status} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{check.label}</p>
                <span
                  className={cn(
                    "shrink-0 text-xs font-medium",
                    formatCheckStatusClass(check.status),
                  )}
                >
                  {formatCheckStatusLabel(check.status, intl)}
                </span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-subtle-foreground">{check.message}</p>
              {check.category === "spelling" &&
              check.status !== "pass" &&
              dictionary.canAddWords &&
              check.relatedTokens?.[0] ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  disabled={dictionary.isAdding}
                  onClick={() => {
                    void dictionary.addWord(check.relatedTokens![0]);
                  }}
                >
                  {dictionary.isAdding ? (
                    <FormattedMessage {...contentEditorFormatChecksMessages.addingToDictionary} />
                  ) : (
                    <FormattedMessage {...contentEditorFormatChecksMessages.addToDictionary} />
                  )}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
