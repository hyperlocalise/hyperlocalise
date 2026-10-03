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
import { Row } from "@/components/ui/layout/row";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { ContentEditorFormatCheckStatusIcon } from "@/components/content-editor/editor/content-editor-format-check-status-icon";
import {
  formatCheckRowBackgroundClass,
  formatCheckStatusClass,
} from "@/components/content-editor/segment/content-editor-tone";
import { contentEditorSideBySidePanelMessages } from "@/components/content-editor/shared/content-editor.messages";
import type { ContentEditorFormatCheck } from "@/components/content-editor/shared/types";
import { useContentEditorWorkspace } from "@/components/content-editor/workspace/content-editor-workspace-context";

import {
  actionableFormatChecks,
  applyQaSuggestion,
  presentQaIssue,
  qaProblemTokenMatches,
  replacesQaTermAsWholeWord,
} from "./content-editor-side-by-side-qa";

export function ContentEditorSideBySideInlineQa({
  formatChecks,
  isLoading = false,
  targetText,
  onFix,
}: {
  formatChecks: ContentEditorFormatCheck[];
  isLoading?: boolean;
  targetText: string;
  onFix?: (nextText: string) => void;
}) {
  const intl = useIntl();
  const workspace = useContentEditorWorkspace();
  const issues = actionableFormatChecks(formatChecks);
  const firstIssue = issues[0];

  if (isLoading) {
    return (
      <Row
        spacing="0.5u"
        alignY="center"
        role="status"
        aria-label={intl.formatMessage(contentEditorSideBySidePanelMessages.formatCheckLoading)}
      >
        <Spinner className="size-3" />
        <Text size="xsmall" tone="subtle">
          <FormattedMessage {...contentEditorSideBySidePanelMessages.formatCheckLoading} />
        </Text>
      </Row>
    );
  }

  if (!firstIssue) {
    return null;
  }

  const presented = presentQaIssue(firstIssue);
  const moreCount = issues.length - 1;
  const wholeTerm = replacesQaTermAsWholeWord(firstIssue);
  const canFix = Boolean(
    presented.problemToken &&
    presented.suggestion &&
    qaProblemTokenMatches(targetText, presented.problemToken, wholeTerm) &&
    onFix,
  );

  const actions =
    canFix || moreCount > 0 ? (
      <Row spacing="0.5u" alignY="center">
        {canFix ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              onFix?.(
                applyQaSuggestion(targetText, presented.problemToken!, presented.suggestion!, {
                  wholeTerm,
                }),
              );
            }}
          >
            <FormattedMessage {...contentEditorSideBySidePanelMessages.qaIssueFix} />
          </Button>
        ) : null}
        {moreCount > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => workspace.ui.revealQaDetails()}
          >
            <FormattedMessage
              {...contentEditorSideBySidePanelMessages.qaIssueMore}
              values={{ count: moreCount }}
            />
          </Button>
        ) : null}
      </Row>
    ) : null;

  return (
    <div className={cn("rounded-md px-2.5 py-2", formatCheckRowBackgroundClass(presented.status))}>
      <div className="flex items-start gap-2">
        <ContentEditorFormatCheckStatusIcon
          status={presented.status}
          className="mt-0.5 size-3.5 shrink-0"
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          <Text
            size="xsmall"
            weight="medium"
            lineClamp={1}
            className={formatCheckStatusClass(presented.status)}
          >
            {presented.label}
          </Text>
          <Text size="xsmall" wrapStyle="pretty" lineClamp={2} className="text-foreground/85">
            {presented.message}
            {presented.suggestion ? (
              <>
                {" · "}
                <FormattedMessage
                  {...contentEditorSideBySidePanelMessages.qaIssueSuggested}
                  values={{ suggestion: presented.suggestion }}
                />
              </>
            ) : null}
          </Text>
        </div>
        {actions ? <div className="-my-0.5 shrink-0">{actions}</div> : null}
      </div>
    </div>
  );
}
