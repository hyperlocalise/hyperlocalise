import Image from "next/image";

import { InfiniteSlider } from "@/components/ui/infinite-slider";

type Provider = {
  id: string;
  label: string;
  src: string;
  width: number;
  height: number;
};

const providers: readonly Provider[] = [
  {
    id: "openai",
    label: "OpenAI",
    src: "/images/openai-old-logo.webp",
    width: 132,
    height: 32,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    src: "/images/claude.png",
    width: 156,
    height: 32,
  },
  {
    id: "gemini",
    label: "Gemini",
    src: "/images/gemini.webp",
    width: 140,
    height: 32,
  },
  {
    id: "groq",
    label: "Groq",
    src: "/images/groq.webp",
    width: 124,
    height: 32,
  },
  {
    id: "mistral",
    label: "Mistral",
    src: "/images/mistral.jpg",
    width: 136,
    height: 32,
  },
] as const;

function ProviderChip({ provider }: { provider: Provider }) {
  return (
    <Image
      alt={provider.label}
      className="h-8 w-8 md:h-12 md:w-12 object-cover rounded-full"
      height={32}
      src={provider.src}
      unoptimized
      width={provider.width}
    />
  );
}

function ProviderTrack() {
  return (
      <>{[...Array(5)].map((_, i) =>
        providers.map((provider) => (
          <ProviderChip key={`${provider.id}-${i}`} provider={provider} />
        )),
      )}</>
  );
}

export function LogoStripSection() {
  return (
    <section aria-labelledby="supported-llm-providers" className="relative">
      <div className="mb-4 flex items-center justify-between gap-4">
        <p
          id="supported-llm-providers"
          className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground"
        >
          Supported LLM providers
        </p>
        <p className="hidden text-xs text-muted-foreground sm:block">Bring your own model stack</p>
      </div>

      <div className="relative overflow-hidden motion-reduce:hidden">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-linear-to-r from-background to-transparent sm:w-20" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-linear-to-l from-background to-transparent sm:w-20" />
        <InfiniteSlider gap={16} speed={60}>
          <ProviderTrack />
        </InfiniteSlider>
      </div>

      <div className="hidden flex-wrap items-center gap-3 motion-reduce:flex">
        {providers.map((provider) => (
          <ProviderChip key={provider.id} provider={provider} />
        ))}
      </div>
    </section>
  );
}
