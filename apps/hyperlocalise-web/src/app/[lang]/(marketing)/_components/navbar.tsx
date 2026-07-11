"use client";

import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { env } from "@/lib/env";
import Image from "next/image";
import Link from "next/link";
import { FormattedMessage, useIntl } from "react-intl";

import LocaleToggle from "@/components/locale-toggle/locale-toggle";
import ThemeToggle from "@/components/theme-toggle/theme-toggle";

import { navbarMessages } from "./navbar.messages";

const navigationLinks = [
  { href: "/product/agents-automation", labelKey: "navAgents" },
  { href: "/product/next-gen-cat-tool", labelKey: "navCatTool" },
  { href: "/product/self-evolving-knowledge", labelKey: "navKnowledge" },
  { href: "/blog", labelKey: "navBlog" },
] as const;

const signInHref = "/auth/sign-in";

const mobileNavLinkClassName =
  "flex min-h-11 items-center rounded-3xl px-4 py-3 text-base font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[active=true]:bg-muted data-[active=true]:text-foreground";

function Logo() {
  const intl = useIntl();

  return (
    <Link href="/" className="flex items-center gap-2.5">
      <Image
        src="/images/logo.png"
        className="size-8"
        width={32}
        height={32}
        alt={intl.formatMessage(navbarMessages.logoAlt)}
      />
      <span className="font-sans text-base font-semibold tracking-tight">Hyperlocalise</span>
    </Link>
  );
}

function MobileNavigation() {
  const intl = useIntl();

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            className="rounded-full border-border bg-background/80 backdrop-blur-sm"
          />
        }
      >
        <span className="sr-only">
          <FormattedMessage {...navbarMessages.openNavigationMenu} />
        </span>
        <svg
          aria-hidden="true"
          className="pointer-events-none"
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M4 7H20" />
          <path d="M4 12H20" />
          <path d="M4 17H20" />
        </svg>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[min(90vw,22rem)] border-s border-border bg-background/98 px-0"
      >
        <SheetHeader className="gap-4 border-b border-border px-5 pb-5 pt-6 text-left">
          <SheetTitle className="sr-only">
            <FormattedMessage {...navbarMessages.navigationMenuTitle} />
          </SheetTitle>
          <div className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
            <FormattedMessage {...navbarMessages.navigationHeading} />
          </div>
          <div className="pr-10">
            <Logo />
          </div>
        </SheetHeader>
        <div className="flex flex-1 flex-col px-3 py-4">
          <nav
            aria-label={intl.formatMessage(navbarMessages.mobileNavAriaLabel)}
            className="flex flex-col gap-1.5"
          >
            {navigationLinks.map((link) => (
              <SheetClose
                key={link.href}
                render={<a href={link.href} />}
                className={mobileNavLinkClassName}
              >
                <FormattedMessage {...navbarMessages[link.labelKey]} />
              </SheetClose>
            ))}
          </nav>
        </div>
        <SheetFooter className="gap-2 border-t border-border px-5 py-5">
          <SheetClose render={<Link href={signInHref} prefetch={false} />} className="w-full">
            <Button
              variant="ghost"
              size="lg"
              className="w-full"
              nativeButton={false}
              render={<span />}
            >
              <FormattedMessage {...navbarMessages.signIn} />
            </Button>
          </SheetClose>
          <SheetClose render={<a href={env.NEXT_PUBLIC_WAITLIST_URL} />} className="w-full">
            <Button size="lg" className="w-full" nativeButton={false} render={<span />}>
              <FormattedMessage {...navbarMessages.joinWaitlist} />
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 lg:gap-8">
          <Logo />
          <NavigationMenu className="mx-auto hidden max-w-none md:flex">
            <NavigationMenuList className="gap-1">
              {navigationLinks.map((link) => (
                <NavigationMenuItem key={link.href}>
                  <NavigationMenuLink
                    href={link.href}
                    className="px-3 py-2 font-medium text-muted-foreground hover:text-foreground"
                  >
                    <FormattedMessage {...navbarMessages[link.labelKey]} />
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href={signInHref} prefetch={false} />}
          >
            <FormattedMessage {...navbarMessages.signIn} />
          </Button>
          <Button nativeButton={false} render={<a href={env.NEXT_PUBLIC_WAITLIST_URL} />}>
            <FormattedMessage {...navbarMessages.joinWaitlist} />
          </Button>
          <LocaleToggle />
          <ThemeToggle />
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <Button
            className="px-3.5"
            nativeButton={false}
            render={<a href={env.NEXT_PUBLIC_WAITLIST_URL} />}
          >
            <FormattedMessage {...navbarMessages.joinWaitlist} />
          </Button>
          <MobileNavigation />
          <LocaleToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
