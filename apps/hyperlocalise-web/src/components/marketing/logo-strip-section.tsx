import type { ReactNode } from "react";

type Provider = {
  id: string;
  label: string;
  width: number;
  viewBox: string;
  render: () => ReactNode;
};

const providers: readonly Provider[] = [
  {
    id: "openai",
    label: "OpenAI",
    width: 132,
    viewBox: "0 0 132 32",
    render: () => (
      <>
        <g fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M19.4 8.1a5.6 5.6 0 0 1 6.1 1.2l3.9 4.1a5.6 5.6 0 0 1 .9 6.7" />
          <path d="M26.3 22.8a5.6 5.6 0 0 1-6.1 1.2l-5.5-2a5.6 5.6 0 0 1-3.6-5.7" />
          <path d="M10.5 21.1a5.6 5.6 0 0 1-1.4-6.1l1.6-5.6a5.6 5.6 0 0 1 5.3-4" />
          <path d="M13 7.4a5.6 5.6 0 0 1 6.1-1.2l5.5 2a5.6 5.6 0 0 1 3.6 5.7" />
          <path d="M28.8 9.1a5.6 5.6 0 0 1 1.4 6.1L28.6 21a5.6 5.6 0 0 1-5.3 4" />
          <path d="M26.3 22.8a5.6 5.6 0 0 1-6.1 1.2l-3.9-4.1a5.6 5.6 0 0 1-.9-6.7" />
        </g>
        <circle cx="19.7" cy="15.9" r="2.9" fill="currentColor" />
        <text
          x="42"
          y="21.5"
          fill="currentColor"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="13.5"
          fontWeight="650"
          letterSpacing="0.08em"
        >
          OPENAI
        </text>
      </>
    ),
  },
  {
    id: "anthropic",
    label: "Anthropic",
    width: 156,
    viewBox: "0 0 156 32",
    render: () => (
      <>
        <path
          d="M14 25.5 19.8 6.5h2.4L28 25.5h-3.6l-1.1-3.9h-4.7l-1.1 3.9Zm5.4-7h3.1L21 13.2z"
          fill="currentColor"
        />
        <text
          x="38"
          y="21.5"
          fill="currentColor"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="13.5"
          fontWeight="650"
          letterSpacing="0.08em"
        >
          ANTHROPIC
        </text>
      </>
    ),
  },
  {
    id: "gemini",
    label: "Gemini",
    width: 140,
    viewBox: "0 0 140 32",
    render: () => (
      <>
        <path
          d="M18 6.5c1.2 4.3 2.4 5.6 6.7 6.8-4.3 1.2-5.5 2.5-6.7 6.8-1.2-4.3-2.4-5.6-6.7-6.8 4.3-1.2 5.5-2.5 6.7-6.8Zm7.7 9.8c.6 2.1 1.3 2.8 3.4 3.4-2.1.6-2.8 1.3-3.4 3.4-.6-2.1-1.3-2.8-3.4-3.4 2.1-.6 2.8-1.3 3.4-3.4Z"
          fill="currentColor"
        />
        <text
          x="40"
          y="21.5"
          fill="currentColor"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="13.5"
          fontWeight="650"
          letterSpacing="0.08em"
        >
          GEMINI
        </text>
      </>
    ),
  },
  {
    id: "groq",
    label: "Groq",
    width: 124,
    viewBox: "0 0 124 32",
    render: () => (
      <>
        <path d="M12 8h10.5v3.2h-7.1v10h7.1v-3.5h-4.5v-3.2H26v9.9H12Z" fill="currentColor" />
        <text
          x="40"
          y="21.5"
          fill="currentColor"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="13.5"
          fontWeight="650"
          letterSpacing="0.08em"
        >
          GROQ
        </text>
      </>
    ),
  },
  {
    id: "mistral",
    label: "Mistral",
    width: 136,
    viewBox: "0 0 136 32",
    render: () => (
      <>
        <g fill="currentColor">
          <rect x="12" y="8" width="3.5" height="16" rx="1" />
          <rect x="16.5" y="11" width="3.5" height="13" rx="1" />
          <rect x="21" y="8" width="3.5" height="16" rx="1" />
          <rect x="25.5" y="11" width="3.5" height="13" rx="1" />
        </g>
        <text
          x="42"
          y="21.5"
          fill="currentColor"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="13.5"
          fontWeight="650"
          letterSpacing="0.08em"
        >
          MISTRAL
        </text>
      </>
    ),
  },
] as const;

function ProviderChip({ provider }: { provider: Provider }) {
  return (
    <div className="flex h-14 items-center rounded-full border border-border/70 bg-muted/40 px-5 text-muted-foreground shadow-[inset_0_1px_0_color-mix(in_srgb,var(--background)_65%,transparent)]">
      <svg
        aria-hidden="true"
        className="h-6 w-auto"
        viewBox={provider.viewBox}
        width={provider.width}
        xmlns="http://www.w3.org/2000/svg"
      >
        {provider.render()}
      </svg>
      <span className="sr-only">{provider.label}</span>
    </div>
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
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-background to-transparent sm:w-20" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-background to-transparent sm:w-20" />
        <div
          className="marketing-marquee flex w-max items-center [--marquee-duration:22s] [--marquee-gap:0.75rem] sm:[--marquee-duration:26s] sm:[--marquee-gap:1rem]"
          aria-hidden="true"
        >
          {[0, 1].map((track) => (
            <div key={track} className="flex shrink-0 items-center gap-3 pr-3 sm:gap-4 sm:pr-4">
              {providers.map((provider) => (
                <ProviderChip key={`${track}-${provider.id}`} provider={provider} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="hidden flex-wrap items-center gap-3 motion-reduce:flex">
        {providers.map((provider) => (
          <ProviderChip key={provider.id} provider={provider} />
        ))}
      </div>
    </section>
  );
}
