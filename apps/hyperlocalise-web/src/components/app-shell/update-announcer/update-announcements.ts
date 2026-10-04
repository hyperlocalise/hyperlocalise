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
import type { ComponentType } from "react";
import type { MessageDescriptor } from "react-intl";

import { MergeStringsPreview } from "./merge-strings-preview";
import { QaOverviewPreview } from "./qa-overview-preview";
import { updateAnnouncerMessages } from "./update-announcer.messages";

export type UpdateAnnouncement = {
  /** Stable key for dismissal. Use a new id for every announcement so past dismissals don't hide it. */
  id: string;
  title: MessageDescriptor;
  description: MessageDescriptor;
  imageSrc: string;
  /** Optional decorative layer drawn over `imageSrc`. */
  Preview?: ComponentType;
  buildHref: (organizationSlug: string) => string;
  /** ISO 8601 timestamp; hidden before this instant. */
  startsAt: string;
  /** ISO 8601 timestamp; hidden from this instant on. Omit to run until removed. */
  endsAt?: string;
};

/** Ordered by priority: the first active, undismissed entry is shown. */
export const UPDATE_ANNOUNCEMENTS: readonly UpdateAnnouncement[] = [
  {
    id: "2026-10-merge-strings",
    title: updateAnnouncerMessages.mergeStringsTitle,
    description: updateAnnouncerMessages.mergeStringsDescription,
    imageSrc: "/images/mesh/mesh-gradient-1788785908604.jpg",
    Preview: MergeStringsPreview,
    buildHref: (organizationSlug) => `/org/${organizationSlug}/projects`,
    startsAt: "2026-10-04T00:00:00Z",
    endsAt: "2026-11-04T00:00:00Z",
  },
  {
    id: "2026-10-qa-overview",
    title: updateAnnouncerMessages.qaOverviewTitle,
    description: updateAnnouncerMessages.qaOverviewDescription,
    imageSrc: "/images/mesh/mesh-gradient-1788785848827.jpg",
    Preview: QaOverviewPreview,
    buildHref: (organizationSlug) => `/org/${organizationSlug}/qa`,
    startsAt: "2026-10-01T00:00:00Z",
    endsAt: "2026-11-01T00:00:00Z",
  },
];

export function isUpdateAnnouncementActive(announcement: UpdateAnnouncement, now: Date): boolean {
  const time = now.getTime();
  if (time < Date.parse(announcement.startsAt)) return false;
  return announcement.endsAt === undefined || time < Date.parse(announcement.endsAt);
}

export function selectUpdateAnnouncement(
  announcements: readonly UpdateAnnouncement[],
  {
    now,
    isDismissed,
  }: {
    now: Date;
    isDismissed: (announcementId: string) => boolean;
  },
): UpdateAnnouncement | null {
  return (
    announcements.find(
      (announcement) =>
        isUpdateAnnouncementActive(announcement, now) && !isDismissed(announcement.id),
    ) ?? null
  );
}

const DISMISSED_STORAGE_KEY_PREFIX = "hl-update-announcement-dismissed:v1:";

export function getUpdateAnnouncementStorageKey(announcementId: string): string {
  return `${DISMISSED_STORAGE_KEY_PREFIX}${announcementId}`;
}
