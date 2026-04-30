import { Archive01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

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

export function ArchiveProjectDialog({
  project,
  isArchiving,
  onOpenChange,
  onArchive,
}: {
  project: ProjectListRow | null;
  isArchiving: boolean;
  onOpenChange: (open: boolean) => void;
  onArchive: (projectId: string) => void;
}) {
  return (
    <AlertDialog open={project !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive project?</AlertDialogTitle>
          <AlertDialogDescription>
            {project
              ? `${project.name} will be removed from active projects.`
              : "This project will be removed from active projects."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isArchiving}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={isArchiving || !project}
            onClick={() => {
              if (project) {
                onArchive(project.id);
              }
            }}
          >
            <HugeiconsIcon icon={Archive01Icon} strokeWidth={1.8} />
            {isArchiving ? "Archiving..." : "Archive"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
