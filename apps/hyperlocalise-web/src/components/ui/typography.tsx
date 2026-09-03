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
import * as React from "react";
import { cn } from "@/lib/primitives/cn";

export type ColorTokenCssVariable =
  | "--color-background-100"
  | "--color-background-200"
  | "--color-gray-50"
  | "--color-gray-100"
  | "--color-gray-200"
  | "--color-gray-300"
  | "--color-gray-400"
  | "--color-gray-500"
  | "--color-gray-600"
  | "--color-gray-700"
  | "--color-gray-800"
  | "--color-gray-900"
  | "--color-gray-1000"
  | "--color-blue-100"
  | "--color-blue-500"
  | "--color-blue-700"
  | "--color-blue-900"
  | "--color-red-500"
  | "--color-red-600"
  | "--color-red-800"
  | "--color-amber-500"
  | "--color-amber-700"
  | "--color-green-500"
  | "--color-green-600"
  | "--color-teal-500"
  | "--color-purple-500"
  | "--color-pink-500"
  | "--color-pink-700"
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
  | "--color-ink"
  | "--color-navy"
  | "--color-slate"
  | "--color-steel"
  | "--color-fog"
  | "--color-clay-900"
  | "--color-clay-700"
  | "--color-clay-500"
  | "--color-clay-100"
  | "--color-warning"
  | "--color-success"
  | "--color-error"
  | "--color-info"
  | "--color-neutral";

export const typographyAlignments = ["start", "center", "end", "inherit"] as const;
export type TypographyAlignment = (typeof typographyAlignments)[number];

export const typographyTones = [
  "content",
  "subtle",
  "subtlest",
  "critical",
  "info",
  "positive",
  "warn",
  "inherit",
] as const;
export type TypographyTone = (typeof typographyTones)[number];

export const typographyWeights = ["regular", "medium", "bold"] as const;
export type TypographyWeight = (typeof typographyWeights)[number];

export const typographyWrapStyles = ["unset", "balance", "pretty"] as const;
export type TypographyWrapStyle = (typeof typographyWrapStyles)[number];

export const typographyCapitalizations = ["default", "uppercase"] as const;
export type TypographyCapitalization = (typeof typographyCapitalizations)[number];

export const typographySizes = [
  "xxlarge",
  "xlarge",
  "large",
  "medium",
  "small",
  "xsmall",
  "xxsmall",
] as const;
export type TypographySize = (typeof typographySizes)[number];
export type TextTypographySize = Exclude<TypographySize, "xxsmall">;
export type TitleTypographySize = Exclude<TypographySize, "xxlarge">;

export type TextTagName = "p" | "div" | "span" | "li" | "blockquote";
export type TitleTagName = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | TextTagName;

type TypographyHtmlProps = Omit<React.HTMLAttributes<HTMLElement>, "color">;

export type SharedTypographyProps = TypographyHtmlProps & {
  alignment?: TypographyAlignment;
  capitalization?: TypographyCapitalization;
  lineClamp?: number;
  tone?: TypographyTone;
  wrapStyle?: TypographyWrapStyle;
};

export type TextProps = SharedTypographyProps & {
  size?: TextTypographySize;
  tagName?: TextTagName;
  weight?: TypographyWeight;
};

interface TypographyHeadingBlobOptions {
  colorToken?: ColorTokenCssVariable;
  className?: string;
}

export type TitleProps = SharedTypographyProps & {
  floatingBlob?: boolean | TypographyHeadingBlobOptions;
  size?: TitleTypographySize;
  tagName?: TitleTagName;
  weight?: TypographyWeight;
};

const textSizeClassNames = {
  xxlarge: "font-sans text-2xl leading-8",
  xlarge: "font-sans text-xl",
  large: "font-sans text-lg",
  medium: "font-sans leading-7",
  small: "font-sans text-sm",
  xsmall: "font-sans text-xs",
} as const satisfies Record<TextTypographySize, string>;

const titleSizeClassNames = {
  xlarge: "font-heading scroll-m-20 text-3xl tracking-[-0.04em] font-semibold md:text-6xl",
  large: "font-heading scroll-m-20 text-2xl font-semibold md:text-5xl",
  medium: "scroll-m-20 font-sans text-xl font-semibold tracking-wide md:text-3xl",
  small: "scroll-m-20 font-sans text-lg font-semibold tracking-wide",
  xsmall: "scroll-m-20 font-sans text-base font-semibold",
  xxsmall: "scroll-m-20 font-sans text-sm font-semibold",
} as const satisfies Record<TitleTypographySize, string>;

const weightClassNames = {
  regular: "font-normal",
  medium: "font-medium",
  bold: "font-semibold",
} as const satisfies Record<TypographyWeight, string>;

const alignmentClassNames = {
  start: "text-start",
  center: "text-center",
  end: "text-end",
  inherit: undefined,
} as const satisfies Record<TypographyAlignment, string | undefined>;

const toneClassNames = {
  content: "text-foreground",
  subtle: "text-muted-foreground",
  subtlest: "text-subtle-foreground",
  critical: "text-destructive",
  info: "text-info",
  positive: "text-success",
  warn: "text-warning",
  inherit: undefined,
} as const satisfies Record<TypographyTone, string | undefined>;

const wrapStyleClassNames = {
  unset: undefined,
  balance: "text-balance",
  pretty: "text-pretty",
} as const satisfies Record<TypographyWrapStyle, string | undefined>;

const lineClampClassNames = {
  1: "truncate",
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
  5: "line-clamp-5",
  6: "line-clamp-6",
} as const;

function defaultTitleTagName(size: TitleTypographySize): TitleTagName {
  switch (size) {
    case "xlarge":
      return "h1";
    case "large":
      return "h2";
    case "medium":
      return "h3";
    case "small":
      return "h4";
    case "xsmall":
      return "h5";
    case "xxsmall":
      return "h6";
  }
}

function lineClampClassName(lineClamp: number | undefined) {
  if (lineClamp == null || lineClamp < 1) {
    return undefined;
  }

  if (lineClamp in lineClampClassNames) {
    return lineClampClassNames[lineClamp as keyof typeof lineClampClassNames];
  }

  return "overflow-hidden";
}

function lineClampStyle(
  lineClamp: number | undefined,
  style: React.CSSProperties | undefined,
): React.CSSProperties | undefined {
  if (lineClamp == null || lineClamp <= 6) {
    return style;
  }

  return {
    ...style,
    display: "-webkit-box",
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: lineClamp,
  };
}

function typographyUtilityClassName({
  alignment,
  capitalization = "default",
  lineClamp,
  tone,
  wrapStyle,
}: Pick<
  SharedTypographyProps,
  "alignment" | "capitalization" | "lineClamp" | "tone" | "wrapStyle"
>) {
  return cn(
    alignment ? alignmentClassNames[alignment] : undefined,
    tone ? toneClassNames[tone] : undefined,
    wrapStyle ? wrapStyleClassNames[wrapStyle] : undefined,
    lineClampClassName(lineClamp),
    capitalization === "uppercase" ? "uppercase" : undefined,
  );
}

function HeadingContent({ children, floatingBlob }: Pick<TitleProps, "children" | "floatingBlob">) {
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
        style={{ backgroundColor: `var(${blobOptions?.colorToken ?? "--color-red-600"})` }}
      />
    </span>
  );
}

function Text({
  alignment,
  capitalization = "default",
  className,
  lineClamp,
  size = "medium",
  style,
  tagName = "p",
  tone,
  weight,
  wrapStyle,
  ...props
}: TextProps) {
  const Tag = tagName;

  return (
    <Tag
      data-slot="text"
      data-size={size}
      className={cn(
        textSizeClassNames[size],
        weight ? weightClassNames[weight] : undefined,
        typographyUtilityClassName({
          alignment,
          capitalization,
          lineClamp,
          tone,
          wrapStyle,
        }),
        className,
      )}
      style={lineClampStyle(lineClamp, style)}
      {...props}
    />
  );
}

function Title({
  alignment,
  capitalization = "default",
  children,
  className,
  floatingBlob,
  lineClamp,
  size = "medium",
  style,
  tagName,
  tone,
  weight,
  wrapStyle,
  ...props
}: TitleProps) {
  const Tag = tagName ?? defaultTitleTagName(size);
  const resolvedWrapStyle = wrapStyle ?? (size === "xlarge" ? "balance" : undefined);

  return (
    <Tag
      data-slot="title"
      data-size={size}
      className={cn(
        titleSizeClassNames[size],
        weight ? weightClassNames[weight] : undefined,
        typographyUtilityClassName({
          alignment,
          capitalization,
          lineClamp,
          tone,
          wrapStyle: resolvedWrapStyle,
        }),
        className,
      )}
      style={lineClampStyle(lineClamp, style)}
      {...props}
    >
      <HeadingContent floatingBlob={floatingBlob}>{children}</HeadingContent>
    </Tag>
  );
}

function TypographyH1({ size = "xlarge", tagName = "h1", ...props }: TitleProps) {
  return <Title size={size} tagName={tagName} {...props} />;
}

function TypographyH2({ className, size = "large", tagName = "h2", ...props }: TitleProps) {
  return (
    <Title size={size} tagName={tagName} className={cn("pb-2 first:mt-0", className)} {...props} />
  );
}

function TypographyH3({ size = "medium", tagName = "h3", ...props }: TitleProps) {
  return <Title size={size} tagName={tagName} {...props} />;
}

function TypographyH4({ size = "small", tagName = "h4", ...props }: TitleProps) {
  return <Title size={size} tagName={tagName} {...props} />;
}

function TypographyP(props: TextProps) {
  return <Text {...props} />;
}

function TypographyBlockquote({
  className,
  tagName = "blockquote",
  wrapStyle = "unset",
  ...props
}: TextProps) {
  return (
    <Text
      tagName={tagName}
      wrapStyle={wrapStyle}
      className={cn("mt-6 border-l-2 pl-6 font-sans italic", className)}
      {...props}
    />
  );
}

function TypographyInlineCode({
  alignment,
  capitalization,
  className,
  lineClamp,
  style,
  tone,
  wrapStyle,
  ...props
}: SharedTypographyProps) {
  return (
    <code
      data-slot="inline-code"
      className={cn(
        "bg-muted relative rounded px-[0.3rem] py-[0.2rem] font-mono text-sm font-normal",
        typographyUtilityClassName({
          alignment,
          capitalization,
          lineClamp,
          tone,
          wrapStyle,
        }),
        className,
      )}
      style={lineClampStyle(lineClamp, style)}
      {...props}
    />
  );
}

function TypographyLead({ size = "xlarge", tone = "subtle", ...props }: TextProps) {
  return <Text size={size} tone={tone} {...props} />;
}

function TypographyLarge({
  size = "large",
  tagName = "div",
  weight = "bold",
  ...props
}: TextProps) {
  return <Text size={size} tagName={tagName} weight={weight} {...props} />;
}

function TypographySmall({
  size = "small",
  tagName = "div",
  weight = "medium",
  ...props
}: TextProps) {
  return <Text size={size} tagName={tagName} weight={weight} {...props} />;
}

function TypographyMuted({
  size = "small",
  tagName = "div",
  tone = "subtle",
  ...props
}: TextProps) {
  return <Text size={size} tagName={tagName} tone={tone} {...props} />;
}

export {
  Text,
  Title,
  TypographyBlockquote,
  TypographyH1,
  TypographyH2,
  TypographyH3,
  TypographyH4,
  TypographyInlineCode,
  TypographyLarge,
  TypographyLead,
  TypographyMuted,
  TypographyP,
  TypographySmall,
};
