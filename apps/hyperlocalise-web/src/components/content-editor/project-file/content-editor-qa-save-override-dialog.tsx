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
import { useCallback, useEffect, useRef, useState } from "react";
import { FormattedMessage } from "react-intl";

import type { ContentEditorFormatCheck } from "@/components/content-editor/shared/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { contentEditorQaSaveOverrideDialogMessages as messages } from "./content-editor-qa-save-override-dialog.messages";

export function ContentEditorQaSaveOverrideDialog({
  checks,
  open,
  onSettle,
}: {
  checks: readonly ContentEditorFormatCheck[];
  open: boolean;
  onSettle: (confirmed: boolean) => void;
}) {
  const uniqueChecks = [
    ...new Map(checks.map((check) => [`${check.label}\u0000${check.message}`, check])).values(),
  ];
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onSettle(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <FormattedMessage {...messages.title} />
          </AlertDialogTitle>
          <AlertDialogDescription>
            <FormattedMessage {...messages.description} />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="grid max-h-60 gap-2 overflow-y-auto text-sm">
          {uniqueChecks.map((check) => (
            <li key={`${check.id}-${check.message}`} className="grid gap-0.5">
              <span className="font-medium">{check.label}</span>
              {check.message ? (
                <span className="text-muted-foreground">{check.message}</span>
              ) : null}
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <FormattedMessage {...messages.cancel} />
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => onSettle(true)}>
            <FormattedMessage {...messages.confirm} />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type PendingOverride = {
  checks: readonly ContentEditorFormatCheck[];
};

/** Asks the translator to confirm a save that failing QA error checks would otherwise block. */
export function useContentEditorQaSaveOverride() {
  const [pending, setPending] = useState<PendingOverride | null>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  // One dialog at a time: later requests wait for the open one to settle.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const settle = useCallback((confirmed: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setPending(null);
    resolve?.(confirmed);
  }, []);

  useEffect(() => () => resolveRef.current?.(false), []);

  const confirmQaSaveOverride = useCallback((checks: readonly ContentEditorFormatCheck[]) => {
    const request = queueRef.current.then(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRef.current = resolve;
          setPending({ checks });
        }),
    );
    queueRef.current = request;
    return request;
  }, []);

  const qaSaveOverrideDialog = (
    <ContentEditorQaSaveOverrideDialog
      checks={pending?.checks ?? []}
      open={pending !== null}
      onSettle={settle}
    />
  );

  return { confirmQaSaveOverride, qaSaveOverrideDialog };
}
