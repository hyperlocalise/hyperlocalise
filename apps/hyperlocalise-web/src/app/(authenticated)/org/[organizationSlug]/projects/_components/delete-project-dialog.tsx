import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

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
  return (
    <AlertDialog open={project !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete project?</AlertDialogTitle>
          <AlertDialogDescription>
            {project
              ? `${project.name} will be permanently deleted. Jobs, files, and shared context linked to it will lose their project association.`
              : "This project will be permanently deleted. Jobs, files, and shared context linked to it will lose their project association."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
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
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
