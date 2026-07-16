"use client";

import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  cliDocsUrl,
  docsUrl,
  githubActionUrl,
  githubRepoUrl,
} from "@/components/marketing/marketing-page-content";
import { productFooterLinks } from "@/components/marketing/product/product-page-content";
import { productPageMessages } from "@/components/marketing/product/product-page-content.messages";
import type { ProductMessageKey } from "@/components/marketing/product/product-page-content.messages";
import { useCaseFooterLinks } from "@/components/marketing/use-case/use-case-page-content";
import { useCasePageMessages } from "@/components/marketing/use-case/use-case-page-content.messages";
import type { UseCaseMessageKey } from "@/components/marketing/use-case/use-case-page-content.messages";
import { env } from "@/lib/env";
import { cn } from "@/lib/primitives/cn";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import Image from "next/image";
import Link from "next/link";
import { FormattedMessage, useIntl } from "react-intl";

import LocaleToggle from "@/components/locale-toggle/locale-toggle";
import ThemeToggle from "@/components/theme-toggle/theme-toggle";

import { navbarMessages } from "./navbar.messages";

const signInHref = "/auth/sign-in";
const dashboardHref = "/dashboard";

type NavbarMessageKey = keyof typeof navbarMessages;

type NavLink =
  | {
      href: string;
      kind: "navbar";
      labelKey: NavbarMessageKey;
      external?: boolean;
    }
  | {
      href: string;
      kind: "product";
      labelKey: ProductMessageKey;
      external?: boolean;
    }
  | {
      href: string;
      kind: "useCase";
      labelKey: UseCaseMessageKey;
      external?: boolean;
    };

const productLinks: NavLink[] = productFooterLinks.map((link) => ({
  href: link.href,
  kind: "product" as const,
  labelKey: link.productLabelKey,
}));

const useCaseLinks: NavLink[] = useCaseFooterLinks.map((link) => ({
  href: link.href,
  kind: "useCase" as const,
  labelKey: link.useCaseLabelKey,
}));

const resourceLinks: NavLink[] = [
  { href: docsUrl, kind: "navbar", labelKey: "navDocumentation", external: true },
  { href: cliDocsUrl, kind: "navbar", labelKey: "navCliDocs", external: true },
  { href: "/blog", kind: "navbar", labelKey: "navBlog" },
  { href: githubActionUrl, kind: "navbar", labelKey: "navGitHubAction", external: true },
  { href: githubRepoUrl, kind: "navbar", labelKey: "navGitHub", external: true },
];

const companyLinks: NavLink[] = [
  { href: "mailto:minh@hyperlocalise.com", kind: "navbar", labelKey: "navContact", external: true },
  { href: "/trust-center", kind: "navbar", labelKey: "navTrustCenter" },
  { href: "/privacy", kind: "navbar", labelKey: "navPrivacy" },
  { href: "/terms", kind: "navbar", labelKey: "navTerms" },
];

const mobileNavLinkClassName =
  "flex min-h-11 items-center rounded-3xl px-4 py-3 text-base font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[active=true]:bg-muted data-[active=true]:text-foreground";

const megaMenuLinkClassName =
  "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus:bg-muted";

const megaMenuHeadingClassName =
  "px-3 pb-2 text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase";

function NavLinkLabel({ link }: { link: NavLink }) {
  if (link.kind === "product") {
    return <FormattedMessage {...productPageMessages[link.labelKey]} />;
  }

  if (link.kind === "useCase") {
    return <FormattedMessage {...useCasePageMessages[link.labelKey]} />;
  }

  return <FormattedMessage {...navbarMessages[link.labelKey]} />;
}

function ExternalLinkIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5 shrink-0 text-muted-foreground"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4.5 11.5 11.5 4.5M6.5 4.5h5v5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MegaMenuLink({ link }: { link: NavLink }) {
  const intl = useIntl();

  if (link.external) {
    return (
      <NavigationMenuLink
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className={megaMenuLinkClassName}
      >
        <span>
          <NavLinkLabel link={link} />
        </span>
        <span className="sr-only">{intl.formatMessage(navbarMessages.externalLinkAriaLabel)}</span>
        <ExternalLinkIcon />
      </NavigationMenuLink>
    );
  }

  return (
    <NavigationMenuLink href={link.href} className={megaMenuLinkClassName}>
      <NavLinkLabel link={link} />
    </NavigationMenuLink>
  );
}

function MegaMenuColumn({ headingKey, links }: { headingKey: NavbarMessageKey; links: NavLink[] }) {
  return (
    <div className="min-w-[11.5rem]">
      <div className={megaMenuHeadingClassName}>
        <FormattedMessage {...navbarMessages[headingKey]} />
      </div>
      <ul className="grid gap-0.5">
        {links.map((link) => (
          <li key={`${link.kind}-${link.href}`}>
            <MegaMenuLink link={link} />
          </li>
        ))}
      </ul>
    </div>
  );
}

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

export type NavbarAuthState = {
  loading: boolean;
  isAuthenticated: boolean;
};

function AuthActions({ auth }: { auth: NavbarAuthState }) {
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
      <Button variant="outline" nativeButton={false} render={<Link href={dashboardHref} />}>
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
      <Button nativeButton={false} render={<a href={env.NEXT_PUBLIC_WAITLIST_URL} />}>
        <FormattedMessage {...navbarMessages.joinWaitlist} />
      </Button>
    </>
  );
}

function MobileNavSection({
  headingKey,
  links,
}: {
  headingKey: NavbarMessageKey;
  links: NavLink[];
}) {
  const intl = useIntl();

  return (
    <div className="space-y-1.5">
      <div className="px-4 pt-3 pb-1 text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
        <FormattedMessage {...navbarMessages[headingKey]} />
      </div>
      {links.map((link) => {
        const content = (
          <>
            <NavLinkLabel link={link} />
            {link.external ? (
              <>
                <span className="sr-only">
                  {intl.formatMessage(navbarMessages.externalLinkAriaLabel)}
                </span>
                <ExternalLinkIcon />
              </>
            ) : null}
          </>
        );

        if (link.external) {
          return (
            <SheetClose
              key={`${link.kind}-${link.href}`}
              render={<a href={link.href} target="_blank" rel="noopener noreferrer" />}
              className={cn(mobileNavLinkClassName, "justify-between gap-3")}
            >
              {content}
            </SheetClose>
          );
        }

        return (
          <SheetClose
            key={`${link.kind}-${link.href}`}
            render={<a href={link.href} />}
            className={mobileNavLinkClassName}
          >
            {content}
          </SheetClose>
        );
      })}
    </div>
  );
}

function MobileAuthFooter({ auth }: { auth: NavbarAuthState }) {
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
      <SheetClose render={<a href={env.NEXT_PUBLIC_WAITLIST_URL} />} className="w-full">
        <Button size="lg" className="w-full" nativeButton={false} render={<span />}>
          <FormattedMessage {...navbarMessages.joinWaitlist} />
        </Button>
      </SheetClose>
    </>
  );
}

function MobileNavigation({ auth }: { auth: NavbarAuthState }) {
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
        <div className="flex flex-1 flex-col overflow-y-auto px-3 py-2">
          <nav
            aria-label={intl.formatMessage(navbarMessages.mobileNavAriaLabel)}
            className="flex flex-col gap-2 pb-4"
          >
            <MobileNavSection headingKey="navPlatformHeading" links={productLinks} />
            <MobileNavSection headingKey="navUseCasesHeading" links={useCaseLinks} />
            <MobileNavSection headingKey="navResourcesHeading" links={resourceLinks} />
            <MobileNavSection headingKey="navCompanyHeading" links={companyLinks} />
          </nav>
        </div>
        <SheetFooter className="gap-2 border-t border-border px-5 py-5">
          <MobileAuthFooter auth={auth} />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function DesktopNavigation() {
  return (
    <NavigationMenu className="mx-auto hidden max-w-none md:flex">
      <NavigationMenuList className="gap-1">
        <NavigationMenuItem>
          <NavigationMenuTrigger className="px-3 py-2 font-medium text-muted-foreground hover:text-foreground data-popup-open:text-foreground data-open:text-foreground">
            <FormattedMessage {...navbarMessages.navProduct} />
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <div className="grid w-max grid-cols-2 gap-6 p-3 pe-4">
              <MegaMenuColumn headingKey="navPlatformHeading" links={productLinks} />
              <MegaMenuColumn headingKey="navUseCasesHeading" links={useCaseLinks} />
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger className="px-3 py-2 font-medium text-muted-foreground hover:text-foreground data-popup-open:text-foreground data-open:text-foreground">
            <FormattedMessage {...navbarMessages.navResources} />
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <div className="grid w-max grid-cols-2 gap-6 p-3 pe-4">
              <MegaMenuColumn headingKey="navResourcesHeading" links={resourceLinks} />
              <MegaMenuColumn headingKey="navCompanyHeading" links={companyLinks} />
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}

export function NavbarView({ auth }: { auth: NavbarAuthState }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 lg:gap-8">
          <Logo />
          <DesktopNavigation />
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <AuthActions auth={auth} />
          <LocaleToggle />
          <ThemeToggle />
        </div>

        <div className="flex items-center gap-2 md:hidden">
          {auth.loading ? (
            <Skeleton className="h-9 w-24 rounded-md" aria-hidden="true" />
          ) : auth.isAuthenticated ? (
            <Button
              className="px-3.5"
              variant="outline"
              nativeButton={false}
              render={<Link href={dashboardHref} />}
            >
              <FormattedMessage {...navbarMessages.dashboard} />
            </Button>
          ) : (
            <Button
              className="px-3.5"
              nativeButton={false}
              render={<a href={env.NEXT_PUBLIC_WAITLIST_URL} />}
            >
              <FormattedMessage {...navbarMessages.joinWaitlist} />
            </Button>
          )}
          <MobileNavigation auth={auth} />
          <LocaleToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export default function Navbar() {
  const { user, loading } = useAuth();

  return (
    <NavbarView
      auth={{
        loading,
        isAuthenticated: Boolean(user),
      }}
    />
  );
}
