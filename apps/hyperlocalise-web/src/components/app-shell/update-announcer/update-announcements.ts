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
};

/** The announcement shown to everyone who hasn't dismissed it. Set to `null` to show nothing. */
export const CURRENT_UPDATE_ANNOUNCEMENT: UpdateAnnouncement | null = {
  id: "2026-10-qa-overview",
  title: updateAnnouncerMessages.qaOverviewTitle,
  description: updateAnnouncerMessages.qaOverviewDescription,
  imageSrc: "/images/mesh/mesh-gradient-1788785848827.jpg",
  Preview: QaOverviewPreview,
  buildHref: (organizationSlug) => `/org/${organizationSlug}/qa`,
};

const DISMISSED_STORAGE_KEY_PREFIX = "hl-update-announcement-dismissed:v1:";

export function getUpdateAnnouncementStorageKey(announcementId: string): string {
  return `${DISMISSED_STORAGE_KEY_PREFIX}${announcementId}`;
}
