"use client";

import { useEffect, useMemo, useState } from "react";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TypographyP } from "@/components/ui/typography";

import { ProjectFilesTree } from "../files/_components/project-files-tree";

function FilePickerIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      className={className}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </svg>
  );
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.54 2.87 8.39 6.84 9.75.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.21-3.37-1.21-.45-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.12 2.91.85.09-.66.35-1.12.63-1.37-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.35 9.35 0 0 1 12 7.01c.85 0 1.71.12 2.51.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.07.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.18 10.18 0 0 0 22 12.26C22 6.58 17.52 2 12 2z" />
    </svg>
  );
}

export function CatFileTreePicker({
  files,
  selectedSourcePath,
  onSelectFile,
}: {
  files: ProjectFileRecord[];
  selectedSourcePath: string;
  onSelectFile: (sourcePath: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dialogSourcePath, setDialogSourcePath] = useState(selectedSourcePath);
  const selectedFile = useMemo(
    () => files.find((file) => file.sourcePath === dialogSourcePath) ?? null,
    [dialogSourcePath, files],
  );

  useEffect(() => {
    if (open) {
      setDialogSourcePath(selectedSourcePath);
    }
  }, [open, selectedSourcePath]);

  const handleOpenSelectedFile = () => {
    if (!selectedFile) {
      return;
    }

    onSelectFile(selectedFile.sourcePath);
    setOpen(false);
  };

  const handleActivateFile = (sourcePath: string) => {
    onSelectFile(sourcePath);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-8 min-w-0 flex-1 basis-40 justify-start font-mono text-xs sm:max-w-xs"
            aria-label="Source file"
          />
        }
      >
        <FilePickerIcon className="size-4 text-muted-foreground" />
        <span className="min-w-0 truncate">{selectedSourcePath}</span>
      </DialogTrigger>
      <DialogContent className="max-h-[min(720px,calc(100svh-2rem))] gap-4 overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choose source file</DialogTitle>
          <DialogDescription>
            Browse the project file tree. Select a file, then open it in the CAT workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 rounded-lg border border-border bg-background">
          <ProjectFilesTree
            files={files}
            selectedSourcePath={dialogSourcePath}
            onSelectFile={setDialogSourcePath}
            onActivateFile={handleActivateFile}
            ariaLabel="Source files"
          />
        </div>

        <div className="rounded-lg border border-border bg-background px-4 py-3">
          <TypographyP className="truncate font-mono text-xs text-foreground">
            {selectedFile?.sourcePath ?? "No file selected"}
          </TypographyP>
          <TypographyP className="text-xs text-muted-foreground">
            Double-click a file in the tree, or use Open file.
          </TypographyP>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleOpenSelectedFile} disabled={!selectedFile}>
            Open file
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CatRepositorySelect({
  repositoryFullNames,
  selectedRepositoryFullName,
  onRepositoryChange,
}: {
  repositoryFullNames: string[];
  selectedRepositoryFullName: string | null;
  onRepositoryChange: (repositoryFullName: string) => void;
}) {
  const handleValueChange = (repositoryFullName: string | null) => {
    if (repositoryFullName) {
      onRepositoryChange(repositoryFullName);
    }
  };

  return (
    <Select value={selectedRepositoryFullName ?? ""} onValueChange={handleValueChange}>
      <SelectTrigger
        className="h-8 min-w-0 flex-1 basis-40 font-mono text-xs sm:max-w-xs"
        aria-label="GitHub repository"
      >
        <GitHubMark className="size-4 text-muted-foreground" />
        <SelectValue placeholder="GitHub repo" />
      </SelectTrigger>
      <SelectContent>
        {repositoryFullNames.map((repositoryFullName) => (
          <SelectItem key={repositoryFullName} value={repositoryFullName}>
            <GitHubMark className="size-4 text-muted-foreground" />
            {repositoryFullName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
