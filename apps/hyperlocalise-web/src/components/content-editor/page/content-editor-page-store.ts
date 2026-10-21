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

import type {
  ProjectFileProgressRecord,
  ProjectFileRecord,
} from "@/api/routes/project/project.schema";

export type ContentEditorPageChromeSnapshot = {
  files: ProjectFileRecord[];
  selectedSourcePath: string | null;
  allFiles: boolean;
  canUseAllFiles: boolean;
  targetLocale: string;
  targetLocales: string[];
  repositoryFullNames: string[];
  selectedRepositoryFullName: string | null;
  activitySourcePath: string;
  organizationSlug: string;
  projectId: string;
  showFileSidebar: boolean;
  showActivityLog?: boolean;
};

const NO_FILE_PROGRESS: ProjectFileProgressRecord[] = [];

export class ContentEditorPageStore {
  files: ProjectFileRecord[] = [];
  /** Per-file progress for `targetLocale`; empty until loaded or when unsupported. */
  fileProgress: ProjectFileProgressRecord[] = NO_FILE_PROGRESS;
  selectedSourcePath: string | null = null;
  allFiles = false;
  canUseAllFiles = false;
  targetLocale = "";
  targetLocales: string[] = [];
  repositoryFullNames: string[] = [];
  selectedRepositoryFullName: string | null = null;
  activitySourcePath = "";
  organizationSlug = "";
  projectId = "";
  showFileSidebar = false;
  showActivityLog = true;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  applyChrome(chrome: ContentEditorPageChromeSnapshot) {
    this.files = chrome.files;
    this.selectedSourcePath = chrome.selectedSourcePath;
    this.allFiles = chrome.allFiles;
    this.canUseAllFiles = chrome.canUseAllFiles;
    this.targetLocale = chrome.targetLocale;
    this.targetLocales = chrome.targetLocales;
    this.repositoryFullNames = chrome.repositoryFullNames;
    this.selectedRepositoryFullName = chrome.selectedRepositoryFullName;
    this.activitySourcePath = chrome.activitySourcePath;
    this.organizationSlug = chrome.organizationSlug;
    this.projectId = chrome.projectId;
    this.showFileSidebar = chrome.showFileSidebar;
    this.showActivityLog = chrome.showActivityLog ?? true;
  }

  setFileProgress(fileProgress: ProjectFileProgressRecord[] | undefined) {
    this.fileProgress = fileProgress ?? NO_FILE_PROGRESS;
  }

  beginFileScopeChange(sourcePath: string, targetLocale: string) {
    this.selectedSourcePath = sourcePath;
    this.targetLocale = targetLocale;
    this.activitySourcePath = sourcePath;
  }
}
