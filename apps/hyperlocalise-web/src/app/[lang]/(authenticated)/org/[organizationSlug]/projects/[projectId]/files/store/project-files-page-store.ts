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
import { makeAutoObservable } from "mobx";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";

export const PROJECT_FILES_MAX_UPLOAD = 10;

export type ProjectFileDialogAction =
  | "translate"
  | "import"
  | "download"
  | "segmentation"
  | "messageFormat";

export type ProjectFileDialogRequest = {
  file: ProjectFileRecord;
  action: ProjectFileDialogAction;
};

export function sourcePathForFile(file: File) {
  const fileWithPath = file as File & { webkitRelativePath?: string };
  return fileWithPath.webkitRelativePath || file.name;
}

export function fileKey(file: File) {
  return `${sourcePathForFile(file)}:${file.size}:${file.lastModified}`;
}

export class ProjectFilesPageStore {
  readonly organizationSlug: string;
  readonly projectId: string;
  selectedFiles: File[] = [];
  loadedFiles: ProjectFileRecord[] = [];
  dialogRequest: ProjectFileDialogRequest | null = null;

  constructor(organizationSlug: string, projectId: string) {
    this.organizationSlug = organizationSlug;
    this.projectId = projectId;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get hasSelectedFiles() {
    return this.selectedFiles.length > 0;
  }

  get isDialogOpen() {
    return this.dialogRequest !== null;
  }

  isActionOpen(action: ProjectFileDialogAction) {
    return this.dialogRequest?.action === action;
  }

  addSelectedFiles(nextFiles: File[]) {
    const existing = new Set(this.selectedFiles.map(fileKey));
    const uniqueNext: File[] = [];
    for (const file of nextFiles) {
      const key = fileKey(file);
      if (existing.has(key)) {
        continue;
      }
      existing.add(key);
      uniqueNext.push(file);
    }
    this.selectedFiles = [...this.selectedFiles, ...uniqueNext].slice(0, PROJECT_FILES_MAX_UPLOAD);
  }

  removeSelectedFile(file: File) {
    this.selectedFiles = this.selectedFiles.filter((item) => item !== file);
  }

  clearSelectedFiles() {
    this.selectedFiles = [];
  }

  setLoadedFiles(loadedFiles: ProjectFileRecord[]) {
    this.loadedFiles = loadedFiles;
  }

  openAction(file: ProjectFileRecord, action: ProjectFileDialogAction) {
    this.dialogRequest = { file, action };
  }

  closeAll() {
    this.dialogRequest = null;
  }
}
