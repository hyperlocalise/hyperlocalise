import { useCaseFooterLinks } from "@/components/marketing/use-case";

export const githubRepoUrl = "https://github.com/hyperlocalise/hyperlocalise";
export const githubActionUrl = "https://github.com/marketplace/actions/hyperlocalise-ci";
export const githubReleasesUrl = "https://github.com/hyperlocalise/hyperlocalise/releases";
export const docsUrl = "https://hyperlocalise.dev";
export const cliDocsUrl = "https://hyperlocalise.dev/commands/overview";

export type MarketingFooterLink = {
  label: string;
  href: string;
};

export type MarketingFooterColumn = {
  title: string;
  links: MarketingFooterLink[];
};

export const principles = [
  {
    title: "Agent-native workflows",
    description:
      "Assign AI agents to translate, review, and sync content while keeping human review first-class.",
  },
  {
    title: "Bring your LLMs. Keep your TMS.",
    description:
      "Stay flexible across model providers and existing TMS platforms without redesigning your operating model.",
  },
  {
    title: "Designed for release confidence",
    description:
      "Carry shared context, evals, and regression checks through every sync so quality does not quietly drift.",
  },
];

export type MarketingChapter = {
  id: string;
  anchorId: string;
  label: string;
  title: string;
  description: string;
  links: string[];
  cta?: {
    label: string;
    href: string;
  };
  placeholderType?: "product" | "illustration";
  placeholderTitle?: string;
  placeholderDescription?: string;
};

export const chapters: MarketingChapter[] = [
  {
    id: "01",
    anchorId: "sources",
    label: "Sources",
    title: "Localization begins in the tools teams already use",
    description:
      "Pull requests, launch requests, and campaign assets become structured localization work with source context attached from the start.",
    links: ["GitHub changes", "Slack requests", "Claude briefs", "Context attached"],
    cta: {
      label: "View GitHub Action",
      href: githubActionUrl,
    },
    placeholderType: "product",
    placeholderTitle: "Intake illustration",
    placeholderDescription:
      "Sources feed into a single intake layer that prepares changed strings, context, and sync-ready jobs.",
  },
  {
    id: "02",
    anchorId: "translate-task",
    label: "Translate Task",
    title: "Move translation work across agents, reviewers and systems",
    description:
      "Assign agents to translation, review, and sync tasks while keeping human reviewers in the loop through the TMS your team already uses.",
    links: [
      "AI translation + review",
      "TMS Agnostic",
      "Regression Evals",
      "Context Auto-discovery",
    ],
  },
  {
    id: "03",
    anchorId: "providers",
    label: "Providers",
    title: "Stay flexible across providers and platforms",
    description:
      "Hyperlocalise sits between LLM providers and TMS tools, giving teams one workflow even as models, vendors, and review systems change underneath it.",
    links: ["LLM-agnostic", "TMS-agnostic", "Provider switching", "Workflow continuity"],
    placeholderType: "illustration",
    placeholderTitle: "Illustration placeholder",
    placeholderDescription:
      "Future illustration: ecosystem map showing repositories, LLM providers, TMS tools, and release control.",
  },
  {
    id: "04",
    anchorId: "evaluations",
    label: "Evaluations",
    title: "Review PRs and translation regressions before merge",
    description:
      "Run GitHub Actions for localization drift, compare outputs, and keep release checks visible in pull requests before broken sync reaches production.",
    links: ["Drift checks", "Eval gates", "PR visibility", "Release blocking"],
    cta: {
      label: "View GitHub Action",
      href: githubActionUrl,
    },
    placeholderType: "illustration",
    placeholderTitle: "Review PR illustration",
    placeholderDescription:
      "Pull request diff with Hyperlocalise review comments highlighting translation errors before merge.",
  },
  {
    id: "05",
    anchorId: "monitor",
    label: "Monitor",
    title: "Understand translation quality at scale",
    description:
      "Track locale health, review coverage, and eval history in one place so localization PMs and engineering teams can see what is safe to ship.",
    links: ["Locale health", "Eval history", "Review coverage", "Release readiness"],
    placeholderType: "product",
    placeholderTitle: "Product image placeholder",
    placeholderDescription:
      "Future screenshot: dashboard for locale status, quality trends, and release confidence.",
  },
];

export const changelog = [
  {
    title: "v1.8.13",
    body: "Hardened Crowdin CAT workflows with approved translations, richer segment context, repository lookup fixes, and ICU parser improvements.",
    meta: "Jun 11, 2026",
    href: `${githubReleasesUrl}/tag/v1.8.13`,
    ctaLabel: "Read release",
  },
  {
    title: "v1.8.12",
    body: "Launched the next-gen CAT workspace with Storybook coverage, added teams UI for member assignment, and optimized XML parsing hot paths.",
    meta: "Jun 8, 2026",
    href: `${githubReleasesUrl}/tag/v1.8.12`,
    ctaLabel: "Read release",
  },
  {
    title: "v1.8.11",
    body: "Added multi-intent Slack agent routing so localization requests are classified and routed to the right workflow automatically.",
    meta: "Jun 2, 2026",
    href: `${githubReleasesUrl}/tag/v1.8.11`,
    ctaLabel: "Read release",
  },
  {
    title: "v1.8.10",
    body: "Optimized XLIFF parsing and marshaling for faster sync runs on large translation files.",
    meta: "Jun 1, 2026",
    href: `${githubReleasesUrl}/tag/v1.8.10`,
    ctaLabel: "Read release",
  },
];

export const testimonials = [
  {
    quote: "We need one workflow across AI drafts, TMS review, and release checks.",
    name: "Localization PM",
    company: "Early design partner",
    tone: "bg-[#dfe6ff] text-slate-950",
  },
  {
    quote: "Keeping our TMS while adding agent workflows is the difference.",
    name: "Product lead",
    company: "Early design partner",
    tone: "bg-[#f4ff1e] text-slate-950",
  },
  {
    quote: "The GitHub and regression layer is what makes this usable for engineering.",
    name: "Engineering manager",
    company: "Early design partner",
    tone: "bg-[#2b87e8] text-slate-950",
  },
];

export const footerColumns: MarketingFooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Sources", href: "#sources" },
      { label: "Translate Task", href: "#translate-task" },
      { label: "Providers", href: "#providers" },
      { label: "Evaluations", href: "#evaluations" },
      { label: "Monitor", href: "#monitor" },
      { label: "Pricing", href: "#waitlist" },
    ],
  },
  {
    title: "Use cases",
    links: useCaseFooterLinks,
  },
  {
    title: "Features",
    links: [
      { label: "Agents", href: "#workflow" },
      { label: "TMS sync", href: "#workflow" },
      { label: "GitHub checks", href: "#workflow" },
      { label: "Evals", href: "#workflow" },
      { label: "Shared context", href: "#overview" },
      { label: "Changelog", href: "#changelog" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: docsUrl },
      { label: "CLI docs", href: cliDocsUrl },
      { label: "GitHub Action", href: githubActionUrl },
      { label: "GitHub", href: githubRepoUrl },
      { label: "Contact", href: "mailto:minh@hyperlocalise.com" },
    ],
  },
];
