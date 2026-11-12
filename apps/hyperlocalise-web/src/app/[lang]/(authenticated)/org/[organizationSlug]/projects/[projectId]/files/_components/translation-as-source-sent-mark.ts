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
import type { FileTreeRowDecoration } from "@pierre/trees";
import type { IntlShape } from "react-intl";

import { readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { formatLocaleDisplayName } from "@/lib/i18n/locale-display-names.messages";
import {
  DEFAULT_PROJECT_BRANCH_NAME,
  resolvedProjectBranchName,
} from "@/lib/projects/branches/project-branch-name";
import { parseProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

import { translationAsSourceSentMarkMessages as messages } from "./translation-as-source-sent-mark.messages";

const CHANGED_COLOR = "var(--ds-amber-900)";

/** Longer project names are cut in the row's mark; the tooltip has the whole name. */
const MARK_PROJECT_NAME_MAX_LENGTH = 24;

/**
 * Whether the Files page marks sent and received files: in projects that store their own files,
 * on the default branch only, since sends go between default branches.
 */
export function showsTranslationSourceMarks(projectId: string, branch: string | null): boolean {
  return (
    !parseProviderProjectId(projectId) &&
    resolvedProjectBranchName(branch) === DEFAULT_PROJECT_BRANCH_NAME
  );
}

/** The last send of a file to one project, as the Files page lists it. */
export type TranslationAsSourceSend = {
  sourcePath: string;
  destinationProjectId: string;
  destinationProjectName: string;
  locale: string;
  sentAt: string;
  changedSinceSent: boolean;
  /** A file added there since replaced this send. */
  replacedInDestination: boolean;
};

/** A file of this project whose newest version was sent here from another project. */
export type TranslationAsSourceReceipt = {
  sourcePath: string;
  /** Null when this person cannot open the project it came from. */
  fromProjectName: string | null;
  locale: string;
  receivedAt: string;
  /** The version this send replaced, when it did not come from the same file. */
  replaced: { addedAt: string; addedBy: string | null } | null;
};

export function translationAsSourceReceiptsQueryKey(organizationSlug: string, projectId: string) {
  return ["project-translation-source-received", organizationSlug, projectId] as const;
}

/** The project's files sent here from another project, by path. */
export async function fetchTranslationAsSourceReceipts(
  organizationSlug: string,
  projectId: string,
): Promise<Map<string, TranslationAsSourceReceipt>> {
  const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].files[
    "translation-source"
  ].received.$get({ param: { organizationSlug, projectId } });
  if (response.status !== 200) {
    throw await readApiResponseError(response, "Failed to load received files");
  }
  const body = await response.json();
  return new Map(body.received.map((receipt) => [receipt.sourcePath, receipt]));
}

export function translationAsSourceSendsQueryKey(organizationSlug: string, projectId: string) {
  return ["project-translation-source-sends", organizationSlug, projectId] as const;
}

/** The project's files that were sent to another project, by path. */
export async function fetchTranslationAsSourceSends(
  organizationSlug: string,
  projectId: string,
): Promise<Map<string, TranslationAsSourceSend[]>> {
  const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].files[
    "translation-source"
  ].sent.$get({ param: { organizationSlug, projectId } });
  if (response.status !== 200) {
    throw await readApiResponseError(response, "Failed to load sent files");
  }
  const body = await response.json();
  const sendsByPath = new Map<string, TranslationAsSourceSend[]>();
  for (const send of body.sends) {
    sendsByPath.set(send.sourcePath, [...(sendsByPath.get(send.sourcePath) ?? []), send]);
  }
  return sendsByPath;
}

/**
 * Row mark for a file sent here from another project ("From …") or sent to other projects:
 * "Sent", or "Changed since sent" while any of those projects has an older version than a send
 * now would give. The marks follow the file's latest job status when it has one. The tooltip
 * says where the file came from and names each project it was sent to, after the file's own
 * `metadata` line.
 */
export function buildTranslationAsSourceSentDecoration(
  sends: readonly TranslationAsSourceSend[],
  file: { jobStatus: string | null; metadata: string },
  intl: IntlShape,
  receipt?: TranslationAsSourceReceipt,
): FileTreeRowDecoration {
  const changed = sends.some((send) => send.changedSinceSent);
  const replacedIn = sends.find((send) => send.replacedInDestination);
  const title = [
    file.metadata,
    receipt ? receivedLine(receipt, intl) : null,
    ...sends.map((send) => sentLine(send, intl)),
  ]
    .filter(Boolean)
    .join("\n");
  const marks: { text: string; color?: string }[] = [];
  if (file.jobStatus) {
    marks.push({ text: file.jobStatus });
  }
  if (receipt) {
    marks.push({ text: receivedMark(receipt, intl) });
  }
  if (replacedIn) {
    marks.push({
      text: intl.formatMessage(messages.replacedIn, {
        project: shortProjectName(replacedIn.destinationProjectName),
      }),
      color: CHANGED_COLOR,
    });
  } else if (sends.length > 0) {
    marks.push(
      changed
        ? { text: intl.formatMessage(messages.changedSinceSent), color: CHANGED_COLOR }
        : { text: intl.formatMessage(messages.sent) },
    );
  }
  const parts = marks.map((mark, index) =>
    index < marks.length - 1 ? { ...mark, text: `${mark.text} · ` } : mark,
  );
  return { text: parts.map((part) => part.text).join(""), title, parts };
}

function shortProjectName(name: string) {
  return name.length > MARK_PROJECT_NAME_MAX_LENGTH
    ? `${name.slice(0, MARK_PROJECT_NAME_MAX_LENGTH - 1)}…`
    : name;
}

function receivedMark(receipt: TranslationAsSourceReceipt, intl: IntlShape) {
  return receipt.fromProjectName === null
    ? intl.formatMessage(messages.fromAnotherProject)
    : intl.formatMessage(messages.fromProject, {
        project: shortProjectName(receipt.fromProjectName),
      });
}

/** Where the file's newest version came from, and when. */
export function receivedLine(receipt: TranslationAsSourceReceipt, intl: IntlShape) {
  const date = intl.formatDate(receipt.receivedAt, { dateStyle: "medium", timeStyle: "short" });
  const line =
    receipt.fromProjectName === null
      ? intl.formatMessage(messages.sentHereFromAnotherProject, { date })
      : intl.formatMessage(messages.sentHereFrom, { project: receipt.fromProjectName, date });
  if (!receipt.replaced) {
    return line;
  }
  const replacedDate = intl.formatDate(receipt.replaced.addedAt, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const replaced = receipt.replaced.addedBy
    ? intl.formatMessage(messages.replacedUploadedBy, {
        person: receipt.replaced.addedBy,
        date: replacedDate,
      })
    : intl.formatMessage(messages.replacedAdded, { date: replacedDate });
  return `${line} ${replaced}`;
}

/** When the file was last sent to the project, and whether it has changed since. */
export function sentLine(send: TranslationAsSourceSend, intl: IntlShape) {
  const message = send.replacedInDestination
    ? messages.sentToReplaced
    : send.changedSinceSent
      ? messages.sentToChanged
      : messages.sentTo;
  return intl.formatMessage(message, {
    project: send.destinationProjectName,
    date: intl.formatDate(send.sentAt, { dateStyle: "medium", timeStyle: "short" }),
    language: formatLocaleDisplayName(intl, send.locale),
  });
}
