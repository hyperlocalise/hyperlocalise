"use client";

import Image from "next/image";

import { TypographyH4, TypographyMuted } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

type ProviderCard = {
  id: string;
  label: string;
  src?: string;
  accentClassName?: string;
  tileAccentClassName?: string;
};

const providers: readonly ProviderCard[] = [
  {
    id: "openai",
    label: "OpenAI",
    src: "/images/openai-old-logo.webp",
    accentClassName: "group-hover:text-[#111111]",
  },
  { id: "azure-openai", label: "Azure OpenAI", accentClassName: "group-hover:text-[#2563eb]" },
  {
    id: "gemini",
    label: "Gemini",
    src: "/images/gemini.webp",
    accentClassName: "group-hover:text-[#5b84f1]",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    src: "/images/claude.png",
    accentClassName: "group-hover:text-[#3f3f46]",
  },
  { id: "bedrock", label: "AWS Bedrock", accentClassName: "group-hover:text-[#ff9900]" },
  { id: "lmstudio", label: "LM Studio", accentClassName: "group-hover:text-[#7c3aed]" },
  {
    id: "groq",
    label: "Groq",
    src: "/images/groq.webp",
    accentClassName: "group-hover:text-[#111111]",
  },
  {
    id: "mistral",
    label: "Mistral",
    src: "/images/mistral.jpg",
    accentClassName: "group-hover:text-[#d97706]",
  },
  { id: "ollama", label: "Ollama", accentClassName: "group-hover:text-[#0f766e]" },
  {
    id: "crowdin",
    label: "Crowdin",
    src: "/images/tms/crowdin.png",
    accentClassName: "group-hover:text-[#2563eb]",
  },
  { id: "lilt", label: "LILT AI", accentClassName: "group-hover:text-[#7c3aed]" },
  {
    id: "lokalise",
    label: "Lokalise",
    src: "/images/tms/lokalise.webp",
    accentClassName: "group-hover:text-[#111111]",
  },
  {
    id: "phrase",
    label: "Phrase",
    src: "/images/tms/phrase.png",
    accentClassName: "group-hover:text-[#15803d]",
  },
  {
    id: "poeditor",
    label: "POEditor",
    src: "/images/tms/poeditor.png",
    accentClassName: "group-hover:text-[#d97706]",
  },
  {
    id: "smartling",
    label: "Smartling",
    src: "/images/tms/smartling.png",
    accentClassName: "group-hover:text-[#dc2626]",
  },
] as const;

function ProviderTile({ label, src, accentClassName, tileAccentClassName }: ProviderCard) {
  return (
    <div
      className={cn(
        "group flex min-h-16 items-center justify-center rounded-[0.95rem] border border-border/60 bg-muted/80 px-3 py-3 text-center shadow-[0_1px_2px_color-mix(in_srgb,var(--foreground)_4%,transparent)] transition duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-muted hover:shadow-[0_8px_20px_color-mix(in_srgb,var(--foreground)_7%,transparent)] sm:min-h-20 sm:rounded-[1.05rem] sm:bg-muted sm:px-4 sm:py-4 sm:hover:shadow-[0_10px_24px_color-mix(in_srgb,var(--foreground)_8%,transparent)]",
        tileAccentClassName,
      )}
    >
      {src ? (
        <Image
          alt={label}
          className="h-6 w-auto rounded object-cover sm:h-8"
          height={src ? 24 : 0}
          src={src}
          unoptimized
          width={src ? 60 : 0}
        />
      ) : (
        <TypographyMuted
          className={cn(
            "text-sm font-semibold leading-5 transition duration-200 sm:text-base",
            accentClassName,
          )}
        >
          {label}
        </TypographyMuted>
      )}
    </div>
  );
}

export function ProviderSwitchingIllustration() {
  return (
    <div className="rounded-[1.5rem] border border-border/60 bg-background p-4 shadow-[0_18px_56px_color-mix(in_srgb,var(--foreground)_7%,transparent)] sm:rounded-[1.8rem] sm:p-7 sm:shadow-[0_24px_80px_color-mix(in_srgb,var(--foreground)_8%,transparent)] mask-radial-from-65% mask-radial-at-top">
      <div className="flex items-center justify-between gap-3">
        <TypographyH4 className="text-[1.05rem] font-semibold tracking-[-0.02em] sm:text-inherit sm:tracking-[inherit]">
          Providers
        </TypographyH4>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:mt-5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
        {providers.map((provider) => (
          <ProviderTile key={provider.id} {...provider} />
        ))}
      </div>
    </div>
  );
}
