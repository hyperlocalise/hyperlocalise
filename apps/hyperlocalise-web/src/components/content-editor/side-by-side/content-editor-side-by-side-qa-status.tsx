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
import { useMemo } from "react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Box } from "@/components/ui/layout/box";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/typography";

import { ContentEditorFormatCheckStatusIcon } from "@/components/content-editor/editor/content-editor-format-check-status-icon";
import { contentEditorSideBySidePanelMessages } from "@/components/content-editor/shared/content-editor.messages";
import type { ContentEditorFormatCheck } from "@/components/content-editor/shared/types";

import {
  actionableFormatChecks,
  worstActionableFormatCheckStatus,
} from "./content-editor-side-by-side-qa";

export function ContentEditorSideBySideQaStatus({
  formatChecks,
  isLoading = false,
  onActivate,
}: {
  formatChecks: ContentEditorFormatCheck[];
  isLoading?: boolean;
  onActivate?: () => void;
}) {
  const intl = useIntl();
  const issues = useMemo(() => actionableFormatChecks(formatChecks), [formatChecks]);
  const status = worstActionableFormatCheckStatus(issues);

  if (isLoading) {
    return (
      <Box
        display="inline-flex"
        alignItems="center"
        justifyContent="center"
        role="status"
        aria-label={intl.formatMessage(contentEditorSideBySidePanelMessages.formatCheckLoading)}
      >
        <Spinner className="size-3" />
      </Box>
    );
  }

  if (formatChecks.length === 0) {
    return null;
  }

  const label = status
    ? intl.formatMessage(
        status === "fail"
          ? contentEditorSideBySidePanelMessages.formatCheckFail
          : contentEditorSideBySidePanelMessages.formatCheckWarn,
        { count: issues.length },
      )
    : intl.formatMessage(contentEditorSideBySidePanelMessages.qaStatusClear);

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      aria-label={label}
      title={label}
      data-status={status ?? "pass"}
      onClick={onActivate}
    >
      <Box display="inline-flex" alignItems="center" gap="0.5u">
        <ContentEditorFormatCheckStatusIcon status={status ?? "pass"} className="size-3" />
        {status ? (
          <Text size="xsmall" weight="medium" tagName="span">
            {issues.length}
          </Text>
        ) : null}
      </Box>
    </Button>
  );
}
