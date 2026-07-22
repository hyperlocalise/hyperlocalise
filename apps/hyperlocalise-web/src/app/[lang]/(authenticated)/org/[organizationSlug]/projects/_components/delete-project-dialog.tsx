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

import { Spinner } from "@/components/ui/spinner";
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

import { deleteProjectDialogMessages } from "./delete-project-dialog.messages";
import type { ProjectListRow } from "./project-list";

export function DeleteProjectDialog({
  project,
  isDeleting,
  onOpenChange,
  onDelete,
}: {
  project: ProjectListRow | null;
  isDeleting: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (projectId: string) => void;
}) {
  const intl = useIntl();

  return (
    <AlertDialog open={project !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <FormattedMessage {...deleteProjectDialogMessages.title} />
          </AlertDialogTitle>
          <AlertDialogDescription>
            {project
              ? intl.formatMessage(deleteProjectDialogMessages.descriptionWithName, {
                  projectName: project.name,
                })
              : intl.formatMessage(deleteProjectDialogMessages.descriptionWithoutName)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            <FormattedMessage {...deleteProjectDialogMessages.cancel} />
          </AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={isDeleting || !project}
            onClick={() => {
              if (project) {
                onDelete(project.id);
              }
            }}
          >
            {isDeleting ? <Spinner /> : <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />}
            {isDeleting ? (
              <FormattedMessage {...deleteProjectDialogMessages.deleting} />
            ) : (
              <FormattedMessage {...deleteProjectDialogMessages.delete} />
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
