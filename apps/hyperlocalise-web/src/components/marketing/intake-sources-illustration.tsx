import {
  TypographyH2,
  TypographyH4,
  TypographyMuted,
  TypographyP,
  TypographySmall,
} from "@/components/ui/typography";

function DetailPill({
  children,
  tone = "dark",
}: {
  children: React.ReactNode;
  tone?: "dark" | "light" | "slack";
}) {
  return (
    <span
      className={
        tone === "light"
          ? "inline-flex items-center rounded-full border border-background/16 bg-background/12 px-2.5 py-1 font-sans text-[0.68rem] font-medium tracking-[0.08em] uppercase text-background/78"
          : tone === "slack"
            ? "inline-flex items-center rounded-full border border-slate-300/80 bg-white/72 px-2.5 py-1 font-sans text-[0.68rem] font-medium tracking-[0.08em] uppercase text-slate-500"
            : "inline-flex items-center rounded-full border border-foreground/8 bg-foreground/5 px-2.5 py-1 font-sans text-[0.68rem] font-medium tracking-[0.08em] uppercase text-foreground/55"
      }
    >
      {children}
    </span>
  );
}

function GithubSourceCard() {
  return (
    <article className="relative flex min-h-90 flex-col overflow-hidden rounded-[1.35rem] border border-background/10 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--foreground)_88%,var(--background)_12%)_0%,color-mix(in_srgb,var(--foreground)_94%,var(--background)_6%)_100%)] p-5 text-background shadow-[0_28px_80px_color-mix(in_srgb,var(--foreground)_18%,transparent)] sm:min-h-100 sm:rounded-[1.55rem] sm:p-6 lg:min-h-116 lg:rounded-[1.7rem]">
      <div className="flex items-start justify-between gap-4">
        <TypographyH2 className="pb-0 text-[2.4rem] leading-none tracking-[-0.07em] text-background sm:text-[2.7rem] lg:text-[3rem]">
          GitHub
        </TypographyH2>
        <TypographySmall className="rounded-full border border-background/16 bg-background/10 px-3 py-1 text-[0.7rem] tracking-widest uppercase text-background/74">
          Pull request
        </TypographySmall>
      </div>

      <div className="mt-8 rounded-[1.2rem] border border-background/8 bg-foreground/50 p-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--background)_3%,transparent)] mask-radial-from-35% mask-radial-at-left sm:mt-10 sm:rounded-[1.35rem] sm:p-5 lg:mt-14 lg:rounded-[1.45rem] lg:p-6">
        <TypographySmall className="text-[0.72rem] tracking-[0.18em] uppercase text-background/58">
          Changed files
        </TypographySmall>
        <div className="mt-4 space-y-3 font-mono text-[0.84rem] leading-6 text-background/92 sm:mt-5 sm:text-[0.9rem] sm:leading-7 lg:text-[0.94rem]">
          <div>messages/en/pricing.json</div>
          <div>docs/launch-checklist.mdx</div>
          <div>locales/fr-FR/hero.json</div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <DetailPill tone="light">3 locale updates</DetailPill>
          <DetailPill tone="light">drift ready</DetailPill>
        </div>
      </div>

      <div className="mt-auto pt-7 sm:pt-8 lg:pt-10">
        <TypographyH4 className="max-w-56 text-[1.6rem] leading-[1.04] tracking-[-0.06em] text-background sm:max-w-60 sm:text-[1.8rem] lg:max-w-64 lg:text-[2rem] lg:leading-[1.02]">
          Repo changes become intake.
        </TypographyH4>
        <TypographyP className="mt-2.5 max-w-56 text-[0.95rem] leading-6 text-background/62 sm:mt-3 sm:max-w-60 sm:text-[0.98rem] sm:leading-7 lg:max-w-64 lg:text-[1rem]">
          Pull request diffs arrive with file context intact.
        </TypographyP>
      </div>
    </article>
  );
}

function SlackSourceCard() {
  return (
    <article className="relative flex min-h-90 flex-col overflow-hidden rounded-[1.35rem] border border-[#e9e0fb] bg-[linear-gradient(180deg,#faf8ff_0%,#f2edff_100%)] p-5 text-slate-950 shadow-[0_28px_80px_rgba(0,0,0,0.12)] sm:min-h-100 sm:rounded-[1.55rem] sm:p-6 lg:min-h-116 lg:rounded-[1.7rem]">
      <div className="flex items-start justify-between gap-4">
        <TypographyH2 className="pb-0 text-[2.4rem] leading-none tracking-[-0.07em] text-slate-950 sm:text-[2.7rem] lg:text-[3rem]">
          Slack
        </TypographyH2>
        <TypographySmall className="inline-flex w-fit items-center rounded-full border border-slate-400/70 bg-slate-900/78 px-3 py-1 text-[0.68rem] tracking-[0.18em] uppercase text-white/72">
          Request
        </TypographySmall>
      </div>

      <div className="mt-8 rounded-[1.2rem] border border-[#d9d4e5] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(242,239,248,0.94)_100%)] p-4 shadow-[0_18px_40px_rgba(88,72,116,0.16)] mask-radial-from-35% mask-radial-at-left sm:mt-10 sm:rounded-[1.35rem] sm:p-5 lg:mt-14 lg:rounded-[1.45rem] lg:p-6">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-xl bg-[#4a154b] p-2 sm:size-9 sm:rounded-2xl">
            <div className="grid h-full w-full grid-cols-2 gap-1">
              <span className="rounded-full bg-[#36c5f0]" />
              <span className="rounded-full bg-[#2eb67d]" />
              <span className="rounded-full bg-[#ecb22e]" />
              <span className="rounded-full bg-[#e01e5a]" />
            </div>
          </div>
          <div>
            <TypographySmall className="text-slate-900">#launch-ops</TypographySmall>
            <TypographyMuted className="text-sm text-slate-500">New request</TypographyMuted>
          </div>
        </div>

        <TypographyP className="mt-5 max-w-60 text-[0.94rem] leading-6 text-slate-700 sm:mt-6 sm:max-w-[16rem] sm:text-[0.98rem] sm:leading-7 lg:max-w-68 lg:text-[1.02rem] lg:leading-8">
          Need hero copy and pricing updates translated for the Friday campaign launch.
        </TypographyP>

        <div className="mt-4 flex flex-wrap gap-2">
          <DetailPill tone="slack">fr-FR</DetailPill>
          <DetailPill tone="slack">de-DE</DetailPill>
          <DetailPill tone="slack">Launch copy</DetailPill>
        </div>
      </div>

      <div className="mt-auto pt-7 sm:pt-8 lg:pt-10">
        <TypographyH4 className="max-w-56 text-[1.6rem] leading-[1.04] tracking-[-0.06em] text-slate-950 sm:max-w-60 sm:text-[1.8rem] lg:max-w-64 lg:text-[2rem] lg:leading-[1.02]">
          Requests arrive with urgency.
        </TypographyH4>
        <TypographyP className="mt-2.5 max-w-56 text-[0.95rem] leading-6 text-slate-700/60 sm:mt-3 sm:max-w-60 sm:text-[0.98rem] sm:leading-7 lg:max-w-64 lg:text-[1rem]">
          Timing and locale targets stay attached from the start.
        </TypographyP>
      </div>
    </article>
  );
}

function ClaudeSourceCard() {
  return (
    <article className="relative flex min-h-90 flex-col overflow-hidden rounded-[1.35rem] border border-clay-500 bg-[linear-gradient(180deg,var(--color-flame-500)_0%,var(--color-flame-700)_100%)] p-5 text-background shadow-[0_28px_80px_color-mix(in_srgb,var(--foreground)_14%,transparent)] sm:min-h-100 sm:rounded-[1.55rem] sm:p-6 lg:min-h-116 lg:rounded-[1.7rem]">
      <TypographyH2 className="relative pb-0 text-[2.85rem] leading-none tracking-[-0.08em] text-background sm:text-[3.2rem] lg:text-[3.6rem]">
        Anthropic
      </TypographyH2>

      <div className="mt-10 rounded-[1.25rem] border border-background/14 bg-background/6 p-4 shadow-[0_20px_40px_color-mix(in_srgb,var(--foreground)_10%,transparent)] mask-radial-from-35% mask-radial-at-left sm:mt-12 sm:rounded-[1.4rem] sm:p-5 lg:mt-18 lg:rounded-[1.55rem] lg:p-6">
        <TypographyP className="font-mono text-[1rem] leading-8 text-background/96">
          claude
        </TypographyP>
        <TypographyP className="mt-6 max-w-56 font-mono text-[0.9rem] leading-6 text-background/96 sm:mt-7 sm:max-w-96 sm:text-[0.95rem] sm:leading-7 lg:mt-8 lg:text-[1rem] lg:leading-8 overflow-hidden">
          mcp add --transport http hyperlocalise
          <br />
          https://hyperlocalise.com/mcp
        </TypographyP>
      </div>

      <div className="mt-auto pt-7 sm:pt-8 lg:pt-10">
        <TypographyH4 className="max-w-56 text-[1.6rem] leading-[1.04] tracking-[-0.06em] text-background sm:max-w-60 sm:text-[1.8rem] lg:max-w-64 lg:text-[2rem] lg:leading-[1.02]">
          Trigger translation
        </TypographyH4>
        <TypographyP className="mt-2.5 max-w-56 text-[0.95rem] leading-6 text-background/66 sm:mt-3 sm:max-w-60 sm:text-[0.98rem] sm:leading-7 lg:max-w-64 lg:text-[1rem]">
          Claude can start Hyperlocalise work with locale scope and source context attached.
        </TypographyP>
      </div>
    </article>
  );
}

export function IntakeSourcesIllustration() {
  return (
    <section>
      <div className="mb-6 flex items-center justify-between gap-4">
        <TypographySmall>Sources</TypographySmall>
        <TypographyMuted className="text-sm">GitHub, Slack, Claude</TypographyMuted>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <GithubSourceCard />
        <SlackSourceCard />
        <ClaudeSourceCard />
      </div>
    </section>
  );
}
