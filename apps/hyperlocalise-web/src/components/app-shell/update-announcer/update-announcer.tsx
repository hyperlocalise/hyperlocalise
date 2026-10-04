"use client";

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
import { useEffect, useId, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { XIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  readBrowserLocalStorageItem,
  writeBrowserLocalStorageItem,
} from "@/lib/primitives/browser-local-storage/browser-local-storage";

import { updateAnnouncerMessages } from "./update-announcer.messages";
import {
  UPDATE_ANNOUNCEMENTS,
  getUpdateAnnouncementStorageKey,
  selectUpdateAnnouncement,
  type UpdateAnnouncement,
} from "./update-announcements";

type UpdateAnnouncerProps = {
  organizationSlug: string;
  announcements?: readonly UpdateAnnouncement[];
};

function isUpdateAnnouncementDismissed(announcementId: string): boolean {
  return readBrowserLocalStorageItem(getUpdateAnnouncementStorageKey(announcementId)) !== null;
}

/** Product update card anchored under the account menu button in the app shell header. */
export function UpdateAnnouncer({
  organizationSlug,
  announcements = UPDATE_ANNOUNCEMENTS,
}: UpdateAnnouncerProps) {
  const intl = useIntl();
  const titleId = useId();
  const [announcement, setAnnouncement] = useState<UpdateAnnouncement | null>(null);

  // Dismissals live in localStorage and the window depends on the client clock, so select after mount.
  useEffect(() => {
    setAnnouncement(
      organizationSlug
        ? selectUpdateAnnouncement(announcements, {
            now: new Date(),
            isDismissed: isUpdateAnnouncementDismissed,
          })
        : null,
    );
  }, [announcements, organizationSlug]);

  if (!announcement) {
    return null;
  }

  const { Preview } = announcement;
  const dismiss = () => {
    writeBrowserLocalStorageItem(
      getUpdateAnnouncementStorageKey(announcement.id),
      new Date().toISOString(),
    );
    setAnnouncement(null);
  };

  return (
    <aside
      aria-labelledby={titleId}
      className="fixed end-4 top-[calc(var(--app-shell-header-height)+0.5rem)] z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-3xl bg-popover text-popover-foreground shadow-2xl ring-1 ring-border animate-in duration-300 fade-in-0 slide-in-from-top-2 motion-reduce:animate-none sm:end-6 lg:end-8"
    >
      <div className="relative p-2 pb-0">
        <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-muted">
          <Image src={announcement.imageSrc} alt="" fill sizes="22rem" className="object-cover" />
          {Preview ? <Preview /> : null}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={dismiss}
          aria-label={intl.formatMessage(updateAnnouncerMessages.dismiss)}
          className="absolute top-4 end-4 rounded-full bg-background/80 backdrop-blur hover:bg-background"
        >
          <XIcon />
        </Button>
      </div>
      <div className="px-5 pt-4 pb-5">
        <h2 id={titleId} className="text-base leading-snug font-semibold text-balance">
          <FormattedMessage {...announcement.title} />
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-pretty text-muted-foreground">
          <FormattedMessage {...announcement.description} />
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={dismiss}>
            <FormattedMessage {...updateAnnouncerMessages.notNow} />
          </Button>
          <Link
            href={announcement.buildHref(organizationSlug)}
            onClick={dismiss}
            className={buttonVariants()}
          >
            <FormattedMessage {...updateAnnouncerMessages.tryNow} />
          </Link>
        </div>
      </div>
    </aside>
  );
}
