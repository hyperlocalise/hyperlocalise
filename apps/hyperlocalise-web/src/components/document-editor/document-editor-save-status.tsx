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
import { CheckIcon, WarningIcon } from "@phosphor-icons/react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import type { DocumentAutosaveStatus } from "./document-editor-autosave";
import { documentEditorMessages as messages } from "./document-editor.messages";

export function DocumentSaveStatus({
  status,
  onRetry,
}: {
  status: DocumentAutosaveStatus;
  onRetry: () => void;
}) {
  const intl = useIntl();
  if (status.kind === "error") {
    return (
      <span role="alert" className="inline-flex items-center gap-1.5 text-xs text-destructive">
        <WarningIcon className="size-3.5" />
        {intl.formatMessage(messages.statusFailed)}
        <Button size="xs" variant="outline" onClick={onRetry}>
          {intl.formatMessage(messages.retry)}
        </Button>
      </span>
    );
  }
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {status.kind === "saving" ? (
        <>
          <Spinner className="size-3" />
          {intl.formatMessage(messages.statusSaving)}
        </>
      ) : status.kind === "dirty" ? (
        <>
          <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
          {intl.formatMessage(messages.statusUnsaved)}
        </>
      ) : status.kind === "saved" ? (
        <>
          <CheckIcon className="size-3.5" />
          {intl.formatMessage(messages.statusSavedAt, {
            time: intl.formatTime(status.at, { hour: "numeric", minute: "2-digit" }),
          })}
        </>
      ) : (
        <>
          <CheckIcon className="size-3.5" />
          {intl.formatMessage(messages.statusSaved)}
        </>
      )}
    </span>
  );
}
