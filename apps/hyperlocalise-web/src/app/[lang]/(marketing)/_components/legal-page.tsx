import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { TypographyH1, TypographyH2, TypographyP } from "@/components/ui/typography";

type LegalPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

export function createLegalMetadata({
  title,
  description,
}: {
  title: string;
  description: string;
}): Metadata {
  return {
    title,
    description,
  };
}

export function LegalPage({ eyebrow, title, description, children }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="relative isolate overflow-hidden">
        <div className="absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(circle_at_top,rgba(79,180,141,0.16),transparent_58%)]" />
        <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-14 sm:px-8 lg:px-12 lg:py-18">
          <div className="flex flex-col gap-6">
            <Link
              href="/"
              className="w-fit text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
            >
              Back to home
            </Link>
            <div className="space-y-4">
              <TypographyP className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                {eyebrow}
              </TypographyP>
              <TypographyH1 className="font-heading text-4xl leading-tight font-semibold tracking-[-0.04em] text-balance sm:text-5xl md:text-5xl">
                {title}
              </TypographyH1>
              <TypographyP className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                {description}
              </TypographyP>
            </div>
          </div>
          <div className="mt-10 rounded-3xl border border-border bg-background/95 p-6 shadow-sm sm:p-8">
            <div className="space-y-8 text-base leading-7 text-foreground">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <TypographyH2 className="font-heading text-2xl font-semibold tracking-[-0.03em] text-foreground md:text-2xl">
        {title}
      </TypographyH2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-6 marker:text-muted-foreground">{children}</ul>;
}
