import * as React from "react";
import { cn } from "@/lib/utils";

export type ColorTokenCssVariable =
  | "--color-gray-900"
  | "--color-gray-700"
  | "--color-gray-500"
  | "--color-gray-300"
  | "--color-gray-100"
  | "--color-gray-50"
  | "--color-grove-900"
  | "--color-grove-700"
  | "--color-grove-500"
  | "--color-grove-300"
  | "--color-grove-100"
  | "--color-bud-900"
  | "--color-bud-700"
  | "--color-bud-500"
  | "--color-bud-300"
  | "--color-bud-100"
  | "--color-spruce-900"
  | "--color-spruce-700"
  | "--color-spruce-500"
  | "--color-spruce-300"
  | "--color-spruce-100"
  | "--color-beam-900"
  | "--color-beam-700"
  | "--color-beam-500"
  | "--color-beam-100"
  | "--color-flame-900"
  | "--color-flame-700"
  | "--color-flame-500"
  | "--color-flame-100"
  | "--color-dew-900"
  | "--color-dew-700"
  | "--color-dew-500"
  | "--color-dew-100"
  | "--color-clay-900"
  | "--color-clay-700"
  | "--color-clay-500"
  | "--color-clay-100"
  | "--color-warning"
  | "--color-success"
  | "--color-error"
  | "--color-info"
  | "--color-neutral";

interface TypographyHeadingBlobOptions {
  colorToken?: ColorTokenCssVariable;
  className?: string;
}

interface TypographyHeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  floatingBlob?: boolean | TypographyHeadingBlobOptions;
}

function HeadingContent({
  children,
  floatingBlob,
}: Pick<TypographyHeadingProps, "children" | "floatingBlob">) {
  if (!floatingBlob) {
    return <>{children}</>;
  }

  const blobOptions = typeof floatingBlob === "object" ? floatingBlob : undefined;

  return (
    <span className="relative inline-block">
      <span className="relative z-10">{children}</span>
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-[-0.01em] right-[-0.1em] z-0 h-4 w-4 rounded-full",
          blobOptions?.className,
        )}
        style={{ backgroundColor: `var(${blobOptions?.colorToken ?? "--color-flame-500"})` }}
      />
    </span>
  );
}

export function TypographyH1({
  className,
  children,
  floatingBlob,
  ...props
}: TypographyHeadingProps) {
  return (
    <h1
      className={cn(
        "font-heading scroll-m-20 text-3xl md:text-6xl tracking-[-0.04em] text-balance font-semibold",
        className,
      )}
      {...props}
    >
      <HeadingContent floatingBlob={floatingBlob}>{children}</HeadingContent>
    </h1>
  );
}

export function TypographyH2({
  className,
  children,
  floatingBlob,
  ...props
}: TypographyHeadingProps) {
  return (
    <h2
      className={cn(
        "font-heading scroll-m-20 pb-2 text-2xl md:text-5xl first:mt-0 font-semibold",
        className,
      )}
      {...props}
    >
      <HeadingContent floatingBlob={floatingBlob}>{children}</HeadingContent>
    </h2>
  );
}

export function TypographyH3({
  className,
  children,
  floatingBlob,
  ...props
}: TypographyHeadingProps) {
  return (
    <h3
      className={cn(
        "scroll-m-20 font-sans text-xl md:text-3xl font-semibold tracking-wide",
        className,
      )}
      {...props}
    >
      <HeadingContent floatingBlob={floatingBlob}>{children}</HeadingContent>
    </h3>
  );
}

export function TypographyH4({
  className,
  children,
  floatingBlob,
  ...props
}: TypographyHeadingProps) {
  return (
    <h4
      className={cn("scroll-m-20 font-sans text-lg font-semibold tracking-wide", className)}
      {...props}
    >
      <HeadingContent floatingBlob={floatingBlob}>{children}</HeadingContent>
    </h4>
  );
}

export function TypographyP({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("font-sans leading-7 not-first:mt-2", className)} {...props} />;
}

export function TypographyBlockquote({
  className,
  ...props
}: React.HTMLAttributes<HTMLQuoteElement>) {
  return (
    <blockquote className={cn("mt-6 border-l-2 pl-6 font-sans italic", className)} {...props} />
  );
}

export function TypographyInlineCode({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <code
      className={cn(
        "bg-muted relative rounded px-[0.3rem] py-[0.2rem] font-mono text-sm font-normal",
        className,
      )}
      {...props}
    />
  );
}

export function TypographyLead({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-muted-foreground font-sans text-xl", className)} {...props} />;
}

export function TypographyLarge({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("font-sans text-lg font-semibold", className)} {...props} />;
}

export function TypographySmall({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("font-sans text-sm font-medium", className)} {...props} />;
}

export function TypographyMuted({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-muted-foreground font-sans text-sm", className)} {...props} />;
}
