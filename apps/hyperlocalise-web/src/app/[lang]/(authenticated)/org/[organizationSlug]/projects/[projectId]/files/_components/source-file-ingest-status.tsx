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
import { FormattedMessage } from "react-intl";

import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import {
  isSourceFileIngestFailed,
  isSourceFileIngestInProgress,
  type SourceFileIngestState,
} from "@/lib/projects/files/source-file-ingest-state";

import { projectFileDetailPanelMessages as messages } from "./project-file-detail-panel.messages";

export function SourceFileIngestStatus({
  ingestState,
  ingestError,
}: {
  ingestState?: SourceFileIngestState | null;
  ingestError?: string | null;
}) {
  if (isSourceFileIngestInProgress(ingestState)) {
    return (
      <div className="flex items-center gap-2">
        <Spinner />
        <TypographyP size="xsmall" tone="subtle">
          <FormattedMessage {...messages.extractingSegments} />
        </TypographyP>
      </div>
    );
  }

  if (!isSourceFileIngestFailed(ingestState)) {
    return null;
  }

  const error = ingestError?.trim();
  return (
    <TypographyP className="text-flame-100" size="xsmall">
      <FormattedMessage
        {...(error ? messages.ingestFailedWithReason : messages.ingestFailed)}
        values={error ? { error } : undefined}
      />
    </TypographyP>
  );
}
