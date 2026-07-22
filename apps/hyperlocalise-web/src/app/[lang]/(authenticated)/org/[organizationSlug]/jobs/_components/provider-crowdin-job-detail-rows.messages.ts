"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const providerCrowdinJobDetailRowsMessages = defineMessages({
  taskType: {
    defaultMessage: "Task type",
    id: "mC64PC89AZ",
    description: "Detail row label for the job or Crowdin task type",
  },
  language: {
    defaultMessage: "Language",
    id: "A4xm05eQSM",
    description: "Detail row label for the Crowdin task language",
  },
  project: {
    defaultMessage: "Project",
    id: "JpCXnGpMeh",
    description: "Detail row label for the job project name",
  },
  targetLocales: {
    defaultMessage: "Target locales",
    id: "kp53zYBeIw",
    description: "Detail row label for target locales",
  },
  description: {
    defaultMessage: "Description",
    id: "FuoKPzKv08",
    description: "Detail row label for the Crowdin task description",
  },
  progress: {
    defaultMessage: "Progress",
    id: "Ty0GwUvHBg",
    description: "Detail row label for translation and approval progress",
  },
  wordsToDo: {
    defaultMessage: "Words to do",
    id: "fIcVSh09FH",
    description: "Detail row label for remaining words to translate",
  },
  dueDate: {
    defaultMessage: "Due date",
    id: "NP2wAmeM1j",
    description: "Detail row label for the job due date",
  },
  externalJobId: {
    defaultMessage: "External job ID",
    id: "YUmBaBzXHy",
    description: "Detail row label for the provider job identifier",
  },
  providerLink: {
    defaultMessage: "Provider link",
    id: "thAleOBSL6",
    description: "Detail row label for the external provider URL",
  },
  openInProvider: {
    defaultMessage: "Open in {provider}",
    id: "VwQyWH3M7V",
    description: "Link text to open the job in the external TMS provider",
  },
  workspaceFallback: {
    defaultMessage: "Workspace",
    id: "0bdrX6gjre",
    description: "Fallback project name when a job has no project",
  },
  loadingProgress: {
    defaultMessage: "Loading progress...",
    id: "PapSWiA4OI",
    description: "Placeholder while Crowdin locale readiness is loading",
  },
  translatedPercent: {
    defaultMessage: "{percent}% translated",
    id: "WX/L/z1wMm",
    description: "Crowdin readiness when only translation progress is available",
  },
  approvedPercent: {
    defaultMessage: "{percent}% approved",
    id: "cndt0P/SRd",
    description: "Crowdin readiness when only approval progress is available",
  },
  translatedAndApprovedPercent: {
    defaultMessage: "{translatedPercent}% translated · {approvedPercent}% approved",
    id: "T+85xLIwTA",
    description: "Crowdin readiness with both translation and approval progress",
  },
  wordsLeftOfTotal: {
    defaultMessage: "{remaining} words left of {total}",
    id: "2rqS6tRROV",
    description: "Crowdin words remaining versus total words for a task",
  },
  crowdinTypeTranslateOwn: {
    defaultMessage: "Translate by own translators",
    id: "VylAO2QrNw",
    description: "Crowdin task type label for in-house translation",
  },
  crowdinTypeProofreadOwn: {
    defaultMessage: "Proofread by own proofreaders",
    id: "WkiVAJgo82",
    description: "Crowdin task type label for in-house proofreading",
  },
  crowdinTypeTranslateVendor: {
    defaultMessage: "Translate by vendor",
    id: "a0yFgx40Tg",
    description: "Crowdin task type label for vendor translation",
  },
  crowdinTypeProofreadVendor: {
    defaultMessage: "Proofread by vendor",
    id: "Mq9r073tq8",
    description: "Crowdin task type label for vendor proofreading",
  },
  emptyValue: {
    defaultMessage: "—",
    id: "HCHtNgw+mH",
    description: "Placeholder shown when a job detail field has no value",
  },
});
