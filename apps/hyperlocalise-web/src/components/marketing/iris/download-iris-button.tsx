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
import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { downloadIrisButtonMessages } from "./download-iris-button.messages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trackMarketingCtaClick } from "@/lib/analytics/marketing-cta";
import { rewriteAppLocalePath } from "@/lib/app-i18n/rewrite-app-locale-path";
import { useAppLocale } from "@/lib/app-i18n/use-app-locale";
import { cn } from "@/lib/primitives/cn";
import { irisMacDownloadUrl } from "@/lib/iris/iris-download";

const IRIS_PAGE_PATH = "/iris";

function subscribeToNothing() {
  return () => undefined;
}

// iPadOS reports itself as Macintosh, so touch support rules it out.
export function isMacDesktop(userAgent: string, maxTouchPoints: number) {
  return /Macintosh|Mac OS X/.test(userAgent) && maxTouchPoints <= 1;
}

export function useIsMacDesktop() {
  return useSyncExternalStore(
    subscribeToNothing,
    () => isMacDesktop(navigator.userAgent, navigator.maxTouchPoints),
    () => false,
  );
}

// A .dmg lands quietly in Downloads, so tell people what to do with it.
export function useIrisDownloadStartedNotice() {
  const intl = useIntl();

  return useCallback(() => {
    toast.success(intl.formatMessage(downloadIrisButtonMessages.downloadStartedTitle), {
      description: intl.formatMessage(downloadIrisButtonMessages.downloadStartedBody),
    });
  }, [intl]);
}

// Tracks the click and, when it starts a download, explains the next step.
export function useDownloadIrisClick(source: string) {
  const isMac = useIsMacDesktop();
  const notifyDownloadStarted = useIrisDownloadStartedNotice();

  return useCallback(() => {
    trackMarketingCtaClick("download_iris", source);
    if (isMac) {
      notifyDownloadStarted();
    }
  }, [isMac, notifyDownloadStarted, source]);
}

// Macs download the Apple Silicon build straight away. Everyone else lands on
// the Iris page, where the menu offers each Mac build.
export function useDownloadIrisLinkElement() {
  const locale = useAppLocale();
  const isMac = useIsMacDesktop();

  return isMac ? (
    <a download href={irisMacDownloadUrl("arm64")} />
  ) : (
    <Link href={rewriteAppLocalePath(IRIS_PAGE_PATH, locale)} />
  );
}

export function DownloadIrisLabel({ showBadge = true }: { showBadge?: boolean }) {
  return (
    <>
      <FormattedMessage {...downloadIrisButtonMessages.downloadIris} />
      {showBadge ? (
        <Badge className="h-4.5 bg-primary-foreground/20 px-1.5 text-[0.65rem] tracking-wide text-primary-foreground uppercase">
          <FormattedMessage {...downloadIrisButtonMessages.freeBadge} />
        </Badge>
      ) : null}
    </>
  );
}

type DownloadIrisButtonProps = {
  source: string;
  size?: "default" | "lg";
  showBadge?: boolean;
  className?: string;
};

export function DownloadIrisButton({
  source,
  size = "default",
  showBadge = true,
  className,
}: DownloadIrisButtonProps) {
  const linkElement = useDownloadIrisLinkElement();
  const handleClick = useDownloadIrisClick(source);

  return (
    <Button
      className={cn("gap-2", className)}
      size={size}
      nativeButton={false}
      render={linkElement}
      onClick={handleClick}
    >
      <DownloadIrisLabel showBadge={showBadge} />
    </Button>
  );
}

// Sets expectations next to a download button: what is free and who can run it.
export function IrisAvailabilityNote({ className }: { className?: string }) {
  const locale = useAppLocale();

  return (
    <p className={cn("text-xs text-current/70", className)}>
      <FormattedMessage {...downloadIrisButtonMessages.availabilityNote} />{" "}
      <Link
        className="rounded-sm font-medium text-current underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
        href={rewriteAppLocalePath("/pricing", locale)}
      >
        <FormattedMessage {...downloadIrisButtonMessages.seePricing} />
      </Link>
    </p>
  );
}
