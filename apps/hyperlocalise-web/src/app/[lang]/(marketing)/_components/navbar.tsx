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

import ThemeToggle from "@/components/theme-toggle/theme-toggle";

const navigationLinks: { href: string; label: string; active?: boolean }[] = [
  { href: "/product/agents-automation", label: "Agents" },
  { href: "/product/next-gen-cat-tool", label: "CAT Tool" },
  { href: "/product/self-evolving-knowledge", label: "Knowledge" },
  { href: "/blog", label: "Blog" },
];
const signInHref = "/auth/sign-in";

const mobileNavLinkClassName =
  "flex min-h-11 items-center rounded-3xl px-4 py-3 text-base font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[active=true]:bg-muted data-[active=true]:text-foreground";

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <Image
        src="/images/logo.png"
        className="size-8"
        width={32}
        height={32}
        alt="Hyperlocalise logo"
      />
      <span className="font-sans text-base font-semibold tracking-tight">Hyperlocalise</span>
    </Link>
  );
}

function MobileNavigation() {
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
        <span className="sr-only">Open navigation menu</span>
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
          <SheetTitle className="sr-only">Navigation menu</SheetTitle>
          <div className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
            Navigation
          </div>
          <div className="pr-10">
            <Logo />
          </div>
        </SheetHeader>
        <div className="flex flex-1 flex-col px-3 py-4">
          <nav aria-label="Mobile" className="flex flex-col gap-1.5">
            {navigationLinks.map((link) => (
              <SheetClose
                key={link.label}
                render={<a href={link.href} />}
                className={mobileNavLinkClassName}
                data-active={link.active}
              >
                {link.label}
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
              Sign in
            </Button>
          </SheetClose>
          <SheetClose render={<a href={env.NEXT_PUBLIC_WAITLIST_URL} />} className="w-full">
            <Button size="lg" className="w-full" nativeButton={false} render={<span />}>
              Join waitlist
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
                <NavigationMenuItem key={link.label}>
                  <NavigationMenuLink
                    active={link.active}
                    href={link.href}
                    className="px-3 py-2 font-medium text-muted-foreground hover:text-foreground"
                  >
                    {link.label}
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
            Sign in
          </Button>
          <Button nativeButton={false} render={<a href={env.NEXT_PUBLIC_WAITLIST_URL} />}>
            Join waitlist
          </Button>
          <ThemeToggle />
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <Button
            className="px-3.5"
            nativeButton={false}
            render={<a href={env.NEXT_PUBLIC_WAITLIST_URL} />}
          >
            Join waitlist
          </Button>
          <MobileNavigation />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
