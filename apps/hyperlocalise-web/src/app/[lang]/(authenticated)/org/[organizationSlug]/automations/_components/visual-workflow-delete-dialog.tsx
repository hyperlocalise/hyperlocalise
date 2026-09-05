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
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { visualWorkflowsPageMessages } from "./visual-workflows-page.messages";

export function VisualWorkflowDeleteDialog({
  open,
  workflowName,
  isDeleting,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  workflowName: string;
  isDeleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const intl = useIntl();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isDeleting) {
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <FormattedMessage {...visualWorkflowsPageMessages.deleteTitle} />
          </AlertDialogTitle>
          <AlertDialogDescription>
            {intl.formatMessage(visualWorkflowsPageMessages.deleteDescription, { workflowName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            <FormattedMessage {...visualWorkflowsPageMessages.deleteCancel} />
          </AlertDialogCancel>
          <Button variant="destructive" disabled={isDeleting} onClick={onConfirm}>
            {isDeleting ? (
              <Spinner />
            ) : (
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
            )}
            {isDeleting ? (
              <FormattedMessage {...visualWorkflowsPageMessages.deleting} />
            ) : (
              <FormattedMessage {...visualWorkflowsPageMessages.deleteConfirm} />
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
