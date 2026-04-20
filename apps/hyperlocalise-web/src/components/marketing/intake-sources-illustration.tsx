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
  tone?: "dark" | "light";
}) {
  return (
    <span
      className={
        tone === "light"
          ? "inline-flex items-center rounded-full border border-white/16 bg-white/12 px-2.5 py-1 font-sans text-[0.68rem] font-medium tracking-[0.08em] uppercase text-white/78"
          : "inline-flex items-center rounded-full border border-black/8 bg-black/5 px-2.5 py-1 font-sans text-[0.68rem] font-medium tracking-[0.08em] uppercase text-black/55"
      }
    >
      {children}
    </span>
  );
}

function GithubSourceCard() {
  return (
    <article className="relative flex min-h-[29rem] flex-col overflow-hidden rounded-[1.7rem] border border-white/10 bg-[linear-gradient(180deg,#171b21_0%,#12161d_100%)] p-6 text-white shadow-[0_28px_80px_rgba(0,0,0,0.18)]">
      <div className="flex items-start justify-between gap-4">
        <TypographyH2 className="pb-0 text-[3rem] leading-none tracking-[-0.07em] text-white">
          GitHub
        </TypographyH2>
        <TypographySmall className="rounded-full border border-white/16 bg-white/10 px-3 py-1 text-[0.7rem] tracking-[0.1em] uppercase text-white/74">
          Pull request
        </TypographySmall>
      </div>

      <div className="mt-14 rounded-[1.45rem] border border-white/8 bg-[#0d1117] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] mask-radial-from-35% mask-radial-at-left">
        <TypographySmall className="text-[0.72rem] tracking-[0.18em] uppercase text-white/58">
          Changed files
        </TypographySmall>
        <div className="mt-5 space-y-4 font-mono text-[0.94rem] leading-7 text-white/92">
          <div>messages/en/pricing.json</div>
          <div>docs/launch-checklist.mdx</div>
          <div>locales/fr-FR/hero.json</div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <DetailPill tone="light">3 locale updates</DetailPill>
          <DetailPill tone="light">drift ready</DetailPill>
        </div>
      </div>

      <div className="mt-auto pt-10">
        <TypographyH4 className="max-w-64 text-[2rem] leading-[1.02] tracking-[-0.06em] text-white">
          Repo changes become intake.
        </TypographyH4>
        <TypographyP className="mt-3 max-w-64 text-[1rem] leading-7 text-white/62">
          Pull request diffs arrive with file context intact.
        </TypographyP>
      </div>
    </article>
  );
}

function SlackSourceCard() {
  return (
    <article className="relative flex min-h-[29rem] flex-col overflow-hidden rounded-[1.7rem] border border-[#e9e0fb] bg-[linear-gradient(180deg,#faf8ff_0%,#f2edff_100%)] p-6 text-slate-950 shadow-[0_28px_80px_rgba(0,0,0,0.12)]">
      <div className="flex items-start justify-between gap-4">
        <TypographyH2 className="pb-0 text-[3rem] leading-none tracking-[-0.07em] text-slate-950">
          Slack
        </TypographyH2>
        <TypographySmall className="inline-flex w-fit items-center rounded-full border border-[#d7d0ea] bg-white/85 px-3 py-1 text-[0.68rem] tracking-[0.18em] uppercase text-[#6c5b7b]">
          Request
        </TypographySmall>
      </div>

      <div className="mt-14 rounded-[1.45rem] border border-[#ebe3fb] bg-white/98 p-6 shadow-[0_18px_40px_rgba(78,96,160,0.06)] mask-radial-from-35% mask-radial-at-left">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-2xl bg-[#4a154b] p-2">
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

        <TypographyP className="mt-6 max-w-[17rem] text-[1.02rem] leading-8 text-slate-700">
          Need hero copy and pricing updates translated for the Friday campaign launch.
        </TypographyP>

        <div className="mt-4 flex flex-wrap gap-2">
          <DetailPill>fr-FR</DetailPill>
          <DetailPill>de-DE</DetailPill>
          <DetailPill>Launch copy</DetailPill>
        </div>
      </div>

      <div className="mt-auto pt-10">
        <TypographyH4 className="max-w-64 text-[2rem] leading-[1.02] tracking-[-0.06em] text-slate-950">
          Requests arrive with urgency.
        </TypographyH4>
        <TypographyP className="mt-3 max-w-64 text-[1rem] leading-7 text-slate-700/60">
          Timing and locale targets stay attached from the start.
        </TypographyP>
      </div>
    </article>
  );
}

function ClaudeSourceCard() {
  return (
    <article className="relative flex min-h-[29rem] flex-col overflow-hidden rounded-[1.7rem] border border-[#dc8b64] bg-[linear-gradient(180deg,#d97d56_0%,#cf7048_100%)] p-6 text-white shadow-[0_28px_80px_rgba(15,23,42,0.14)]">
      <TypographyH2 className="relative pb-0 text-[3.6rem] leading-none tracking-[-0.08em] text-white">
        Anthropic
      </TypographyH2>

      <div className="mt-18 rounded-[1.55rem] border border-white/14 bg-white/6 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.1)] mask-radial-from-35% mask-radial-at-left">
        <TypographyP className="font-mono text-[1rem] leading-8 text-white/96">claude</TypographyP>
        <TypographyP className="mt-8 max-w-64  font-mono text-[1rem] leading-8 text-white/96">
          mcp add --transport http hyperlocalise
          <br />
          https://hyperlocalise.com/mcp
        </TypographyP>
      </div>

      <div className="mt-auto pt-10">
        <TypographyH4 className="max-w-64 text-[2rem] leading-[1.02] tracking-[-0.06em] text-white">
          Trigger translation
        </TypographyH4>
        <TypographyP className="mt-3 max-w-64 text-[1rem] leading-7 text-white/66">
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
