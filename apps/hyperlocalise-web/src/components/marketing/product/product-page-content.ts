export type ProductPageSlug = "agents-automation" | "next-gen-cat-tool" | "self-evolving-knowledge";

export type ProductVisualKind = "automation" | "cat" | "knowledge";

export type ProductPageLink = {
  label: string;
  href: string;
};

export type ProductPageContent = {
  slug: ProductPageSlug;
  metadata: {
    title: string;
    description: string;
    keywords: string[];
  };
  visualKind: ProductVisualKind;
  hero: {
    eyebrow: string;
    headline: string;
    subcopy: string;
  };
  explanation: {
    label: string;
    title: string;
    body: string;
  };
  process: {
    label: string;
    title: string;
    steps: string[];
  };
  capabilities: {
    label: string;
    title: string;
    items: string[];
  };
  whyItMatters: {
    label: string;
    title: string;
    items: string[];
  };
  cta: {
    headline: string;
    description: string;
  };
  related: ProductPageLink[];
  resources: ProductPageLink[];
};

const githubActionUrl = "https://github.com/marketplace/actions/hyperlocalise-ci";
const cliDocsUrl = "https://hyperlocalise.dev/commands/overview";

export const productLinks: ProductPageLink[] = [
  { label: "Agents Automation", href: "/product/agents-automation" },
  { label: "Next-gen CAT Tool", href: "/product/next-gen-cat-tool" },
  { label: "Self-evolving Knowledge", href: "/product/self-evolving-knowledge" },
];

export const productPages: ProductPageContent[] = [
  {
    slug: "agents-automation",
    metadata: {
      title: "Agents Automation for Localisation Operations | Hyperlocalise",
      description:
        "Automate localisation workflows across AI agents, human reviewers, TMS, CMS, GitHub, Slack, and existing tools with Hyperlocalise.",
      keywords: [
        "localisation automation",
        "AI localisation agents",
        "translation workflow automation",
        "TMS automation",
      ],
    },
    visualKind: "automation",
    hero: {
      eyebrow: "Agents Automation",
      headline: "Agents Automation for Localisation Operations",
      subcopy:
        "Turn source changes, content updates, and launch requests into automated localisation workflows across AI agents, human reviewers, and your existing stack.",
    },
    explanation: {
      label: "Product pillar",
      title: "Automate the work without removing review",
      body: "Hyperlocalise agents turn content changes, launch requests, and translation tasks into scoped workflows with humans in control.",
    },
    process: {
      label: "How it works",
      title: "From change signal to approved translations",
      steps: [
        "Detect new content or source changes",
        "Create scoped localisation tasks",
        "Pull context from repo, CMS, TMS, glossary, and product docs",
        "Route work to AI agents or human reviewers",
        "Sync approved translations back",
      ],
    },
    capabilities: {
      label: "Key capabilities",
      title: "Built around your existing operating model",
      items: [
        "GitHub, Slack, and CMS intake",
        "Scoped localisation task creation",
        "Context gathering before translation starts",
        "AI and reviewer routing",
        "Approved translation sync",
      ],
    },
    whyItMatters: {
      label: "Why it matters",
      title: "Less coordination, faster launches",
      items: [
        "Less manual coordination",
        "Faster launch cycles",
        "Fewer missed translation tasks",
        "Works across existing tools",
      ],
    },
    cta: {
      headline: "Automate localisation without replacing your stack.",
      description:
        "Connect change signals, agents, reviewers, and translation systems in one controlled workflow.",
    },
    related: [
      { label: "Next-gen CAT Tool", href: "/product/next-gen-cat-tool" },
      { label: "Self-evolving Knowledge", href: "/product/self-evolving-knowledge" },
    ],
    resources: [
      { label: "Homepage", href: "/" },
      { label: "GitHub Action", href: githubActionUrl },
      { label: "CLI docs", href: cliDocsUrl },
    ],
  },
  {
    slug: "next-gen-cat-tool",
    metadata: {
      title: "Next-gen CAT Tool for Human-in-the-loop Translation | Hyperlocalise",
      description:
        "A modern CAT tool for AI-assisted translation, human review, product context, glossary rules, and localisation quality checks.",
      keywords: [
        "next-gen CAT tool",
        "AI assisted translation",
        "human in the loop translation",
        "localisation quality checks",
      ],
    },
    visualKind: "cat",
    hero: {
      eyebrow: "Next-gen CAT Tool",
      headline: "Next-gen CAT Tool for Human-in-the-loop Translation",
      subcopy:
        "Translate, review, and approve content with AI support, full product context, and human control in one modern workspace.",
    },
    explanation: {
      label: "Product pillar",
      title: "A focused workspace for better review decisions",
      body: "Give translators and reviewers one place for source strings, target strings, context, glossary, memory, AI suggestions, and quality checks.",
    },
    process: {
      label: "Workspace flow",
      title: "Translate with context in view",
      steps: [
        "Open source and target strings together",
        "Review AI-assisted suggestions",
        "Check product context and glossary rules",
        "Discuss changes with reviewer comments",
        "Approve only after quality warnings are resolved",
      ],
    },
    capabilities: {
      label: "Key capabilities",
      title: "Everything review needs, kept close",
      items: [
        "Source and target editing",
        "AI-assisted suggestions",
        "Product context sidebar",
        "Glossary and brand voice rules",
        "Review comments and approval flow",
        "Quality warnings before approval",
      ],
    },
    whyItMatters: {
      label: "Why it matters",
      title: "AI becomes useful when reviewers stay in control",
      items: [
        "Reviewers make better decisions",
        "Translators get context before editing",
        "AI supports work without removing human judgement",
        "Fewer back-and-forth review cycles",
      ],
    },
    cta: {
      headline: "Bring context, AI, and human review into one translation workspace.",
      description:
        "Give every reviewer the source, context, checks, and approval controls needed to ship with confidence.",
    },
    related: [
      { label: "Agents Automation", href: "/product/agents-automation" },
      { label: "Self-evolving Knowledge", href: "/product/self-evolving-knowledge" },
    ],
    resources: [
      { label: "Homepage", href: "/" },
      { label: "GitHub Action", href: githubActionUrl },
      { label: "CLI docs", href: cliDocsUrl },
    ],
  },
  {
    slug: "self-evolving-knowledge",
    metadata: {
      title: "Self-evolving Localisation Knowledge | Hyperlocalise",
      description:
        "Capture approved translations, reviewer feedback, glossary decisions, product context, and market knowledge to improve every localisation workflow.",
      keywords: [
        "localisation knowledge",
        "translation memory",
        "localisation glossary",
        "AI translation context",
      ],
    },
    visualKind: "knowledge",
    hero: {
      eyebrow: "Self-evolving Knowledge",
      headline: "Self-evolving Localisation Knowledge",
      subcopy:
        "Build a living knowledge layer that captures product context, terminology, review decisions, and market feedback across every localisation workflow.",
    },
    explanation: {
      label: "Product pillar",
      title: "Every review improves the next workflow",
      body: "Hyperlocalise learns from approved translations, reviewer feedback, glossary decisions, product context, and market-specific preferences.",
    },
    process: {
      label: "What it learns from",
      title: "A reusable knowledge layer for agents and humans",
      steps: [
        "Approved translations",
        "Reviewer edits",
        "Glossary and terminology choices",
        "Product documentation",
        "Brand voice rules",
        "Market-specific feedback",
        "Repeated mistakes and corrections",
      ],
    },
    capabilities: {
      label: "Key capabilities",
      title: "Memory that is practical, visible, and reusable",
      items: [
        "Terminology and brand voice capture",
        "Reviewer feedback memory",
        "Product documentation context",
        "Market-specific preferences",
        "Repeated correction tracking",
      ],
    },
    whyItMatters: {
      label: "Why it matters",
      title: "Stop repeating the same feedback",
      items: [
        "AI suggestions improve over time",
        "Teams stop repeating the same feedback",
        "Brand and terminology stay consistent",
        "Localisation knowledge becomes reusable across agents and humans",
      ],
    },
    cta: {
      headline: "Turn every review decision into reusable localisation intelligence.",
      description:
        "Capture the context and corrections your team already creates, then make them available to every future workflow.",
    },
    related: [
      { label: "Agents Automation", href: "/product/agents-automation" },
      { label: "Next-gen CAT Tool", href: "/product/next-gen-cat-tool" },
    ],
    resources: [
      { label: "Homepage", href: "/" },
      { label: "GitHub Action", href: githubActionUrl },
      { label: "CLI docs", href: cliDocsUrl },
    ],
  },
];

export const productPagesBySlug = Object.fromEntries(
  productPages.map((page) => [page.slug, page]),
) as Record<ProductPageSlug, ProductPageContent>;

export const productSlugs = productPages.map((page) => page.slug);
