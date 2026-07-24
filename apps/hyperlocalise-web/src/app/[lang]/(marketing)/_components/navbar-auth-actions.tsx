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
import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { FormattedMessage } from "react-intl";

import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";

import { navbarMessages } from "./navbar.messages";

const signInHref = "/auth/sign-in";
const dashboardHref = "/dashboard";

export type NavbarAuthState = {
  loading: boolean;
  isAuthenticated: boolean;
};

export function NavbarDesktopAuthActions({ auth }: { auth: NavbarAuthState }) {
  if (auth.loading) {
    return (
      <div className="flex items-center gap-2" aria-hidden="true">
        <Skeleton className="h-9 w-20 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
    );
  }

  if (auth.isAuthenticated) {
    return (
      <Button nativeButton={false} render={<Link href={dashboardHref} />}>
        <FormattedMessage {...navbarMessages.dashboard} />
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        nativeButton={false}
        render={<Link href={signInHref} prefetch={false} />}
      >
        <FormattedMessage {...navbarMessages.signIn} />
      </Button>
      <Button
        nativeButton={false}
        render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
      >
        <FormattedMessage {...navbarMessages.joinWaitlist} />
      </Button>
    </>
  );
}

export function NavbarMobileAuthCta({ auth }: { auth: NavbarAuthState }) {
  if (auth.loading) {
    return <Skeleton className="h-9 w-24 rounded-md" aria-hidden="true" />;
  }

  if (auth.isAuthenticated) {
    return (
      <Button className="px-3.5" nativeButton={false} render={<Link href={dashboardHref} />}>
        <FormattedMessage {...navbarMessages.dashboard} />
      </Button>
    );
  }

  return (
    <Button
      className="px-3.5"
      nativeButton={false}
      render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
    >
      <FormattedMessage {...navbarMessages.joinWaitlist} />
    </Button>
  );
}

export function NavbarMobileAuthFooter({ auth }: { auth: NavbarAuthState }) {
  if (auth.loading) {
    return (
      <div className="flex w-full flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-11 w-full rounded-md" />
        <Skeleton className="h-11 w-full rounded-md" />
      </div>
    );
  }

  if (auth.isAuthenticated) {
    return (
      <SheetClose render={<Link href={dashboardHref} />} className="w-full">
        <Button size="lg" className="w-full" nativeButton={false} render={<span />}>
          <FormattedMessage {...navbarMessages.dashboard} />
        </Button>
      </SheetClose>
    );
  }

  return (
    <>
      <SheetClose render={<Link href={signInHref} prefetch={false} />} className="w-full">
        <Button variant="ghost" size="lg" className="w-full" nativeButton={false} render={<span />}>
          <FormattedMessage {...navbarMessages.signIn} />
        </Button>
      </SheetClose>
      <SheetClose
        render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
        className="w-full"
      >
        <Button size="lg" className="w-full" nativeButton={false} render={<span />}>
          <FormattedMessage {...navbarMessages.joinWaitlist} />
        </Button>
      </SheetClose>
    </>
  );
}
