"use client";

import { TypographyH4, TypographyMuted } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

type ProviderCard = {
  id: string;
  label: string;
  accentClassName?: string;
  tileAccentClassName?: string;
};

const providers: readonly ProviderCard[] = [
  { id: "openai", label: "OpenAI", accentClassName: "group-hover:text-[#111111]" },
  { id: "azure-openai", label: "Azure OpenAI", accentClassName: "group-hover:text-[#2563eb]" },
  { id: "gemini", label: "Gemini", accentClassName: "group-hover:text-[#5b84f1]" },
  { id: "anthropic", label: "Anthropic", accentClassName: "group-hover:text-[#3f3f46]" },
  { id: "bedrock", label: "AWS Bedrock", accentClassName: "group-hover:text-[#ff9900]" },
  { id: "lmstudio", label: "LM Studio", accentClassName: "group-hover:text-[#7c3aed]" },
  { id: "groq", label: "Groq", accentClassName: "group-hover:text-[#111111]" },
  { id: "mistral", label: "Mistral", accentClassName: "group-hover:text-[#d97706]" },
  { id: "ollama", label: "Ollama", accentClassName: "group-hover:text-[#0f766e]" },
  { id: "crowdin", label: "Crowdin", accentClassName: "group-hover:text-[#2563eb]" },
  { id: "lilt", label: "LILT AI", accentClassName: "group-hover:text-[#7c3aed]" },
  { id: "lokalise", label: "Lokalise", accentClassName: "group-hover:text-[#111111]" },
  { id: "phrase", label: "Phrase", accentClassName: "group-hover:text-[#15803d]" },
  { id: "poeditor", label: "POEditor", accentClassName: "group-hover:text-[#d97706]" },
  { id: "smartling", label: "Smartling", accentClassName: "group-hover:text-[#dc2626]" },
] as const;

function ProviderTile({ label, accentClassName, tileAccentClassName }: ProviderCard) {
  return (
    <div
      className={cn(
        "group flex min-h-20 items-center justify-center rounded-[1.05rem] border border-black/6 bg-muted px-4 py-4 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-black/12 hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]",
        tileAccentClassName,
      )}
    >
      <TypographyMuted className={cn("font-semibold transition duration-200", accentClassName)}>
        {label}
      </TypographyMuted>
    </div>
  );
}

export function ProviderSwitchingIllustration() {
  return (
    <div className="rounded-[1.8rem] border border-black/8 bg-background p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-7 mask-radial-from-65% mask-radial-at-top">
      <div className="flex items-center justify-between gap-3">
        <TypographyH4>Providers</TypographyH4>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {providers.map((provider) => (
          <ProviderTile key={provider.id} {...provider} />
        ))}
      </div>
    </div>
  );
}
