"use client";

import { MessageResponse } from "@/components/ai-elements/message";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import type { ProjectSourceStringEntry } from "@/api/routes/project/project.schema";

export function ProjectFileStringContextDialog({
  open,
  onOpenChange,
  entry,
  repositoryFullName,
  isLoading,
  summary,
  errorMessage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: ProjectSourceStringEntry | null;
  repositoryFullName: string | null;
  isLoading: boolean;
  summary: string | null;
  errorMessage: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(32rem,85vh)] flex-col gap-4 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Repository context</DialogTitle>
          <DialogDescription>
            {entry ? (
              <>
                <span className="font-mono text-foreground/72">{entry.key}</span>
                {repositoryFullName ? (
                  <>
                    {" "}
                    in <span className="font-mono text-foreground/72">{repositoryFullName}</span>
                  </>
                ) : null}
              </>
            ) : (
              "Localization context from your connected repository."
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 py-6">
            <Spinner />
            <TypographyP className="text-sm text-foreground/52">
              Searching the repository…
            </TypographyP>
          </div>
        ) : errorMessage ? (
          <TypographyP className="text-sm text-flame-100">{errorMessage}</TypographyP>
        ) : summary ? (
          <div className="min-h-0 overflow-auto rounded-md border border-foreground/8 bg-background/60 p-3">
            <MessageResponse>{summary}</MessageResponse>
          </div>
        ) : (
          <TypographyP className="text-sm text-foreground/52">No context returned.</TypographyP>
        )}
      </DialogContent>
    </Dialog>
  );
}
