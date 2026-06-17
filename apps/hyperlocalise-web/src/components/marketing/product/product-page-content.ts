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
  detailsHeadline: string;
  summary: string;
  proofPoints: {
    title: string;
    body: string;
  }[];
  cta: {
    headline: string;
    description: string;
  };
  related: ProductPageLink[];
};

export const productLinks: ProductPageLink[] = [
  { label: "Agents Automation", href: "/product/agents-automation" },
  { label: "Next-gen CAT Tool", href: "/product/next-gen-cat-tool" },
  { label: "Self-evolving Knowledge", href: "/product/self-evolving-knowledge" },
];

export const productPages: ProductPageContent[] = [
  {
    slug: "agents-automation",
    metadata: {
      title: "Stop Chasing Localisation Work Across Tools | Hyperlocalise",
      description:
        "Catch source changes, route localisation work, gather context, and keep human review in control across your existing tools.",
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
      headline: "Stop chasing localisation work across tools",
      subcopy:
        "Every release creates strings, context, screenshots, reviewer questions, and sync work. Hyperlocalise turns those loose signals into controlled localisation workflows before anything gets missed.",
    },
    detailsHeadline: "When launch work is scattered, translations become a last-minute scramble.",
    summary:
      "Hyperlocalise watches where work starts, scopes what needs translation, gathers the context reviewers need, and routes the job through the people and systems already in your stack.",
    proofPoints: [
      {
        title: "Catch the change",
        body: "Source changes, CMS updates, and launch requests stop depending on someone remembering to open a ticket.",
      },
      {
        title: "Route the review",
        body: "Agents prepare the work, but reviewers still decide what is good enough to ship.",
      },
      {
        title: "Close the loop",
        body: "Approved translations go back to the TMS, repo, or release flow instead of getting stranded in chat.",
      },
    ],
    cta: {
      headline: "Make missed localisation work harder to miss.",
      description:
        "Connect the signals, reviewers, and systems you already use, then let Hyperlocalise keep the workflow moving.",
    },
    related: [
      { label: "Next-gen CAT Tool", href: "/product/next-gen-cat-tool" },
      { label: "Self-evolving Knowledge", href: "/product/self-evolving-knowledge" },
    ],
  },
  {
    slug: "next-gen-cat-tool",
    metadata: {
      title: "Review Translations With the Context Next to the String | Hyperlocalise",
      description:
        "Give reviewers the source, target, product context, glossary guidance, AI notes, comments, and quality checks in one translation workspace.",
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
      headline: "Review translations without guessing what the string means",
      subcopy:
        "Most review cycles stall because the translator cannot see the screen, the glossary, the intent, or the product nuance. Hyperlocalise puts that context beside the string.",
    },
    detailsHeadline:
      "Bad translations rarely start with bad language. They start with missing context.",
    summary:
      "The CAT workspace keeps the source, target, AI recommendation, product meaning, glossary rules, comments, warnings, and approval state in one place so reviewers can make a decision.",
    proofPoints: [
      {
        title: "Know the intent",
        body: "Reviewers see what the copy is trying to do before they choose the wording.",
      },
      {
        title: "See the risk",
        body: "Glossary notes, format warnings, and comments surface before approval, not after release.",
      },
      {
        title: "Approve with confidence",
        body: "AI helps explain the tradeoffs, but the human reviewer keeps control of the final call.",
      },
    ],
    cta: {
      headline: "Stop reviewing strings in the dark.",
      description:
        "Give every reviewer the context, checks, and approval controls they need before translated copy reaches production.",
    },
    related: [
      { label: "Agents Automation", href: "/product/agents-automation" },
      { label: "Self-evolving Knowledge", href: "/product/self-evolving-knowledge" },
    ],
  },
  {
    slug: "self-evolving-knowledge",
    metadata: {
      title: "Stop Repeating the Same Localisation Feedback | Hyperlocalise",
      description:
        "Capture reviewer corrections, glossary decisions, product context, and market preferences so every localisation workflow starts smarter.",
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
      headline: "Stop repeating the same localisation feedback",
      subcopy:
        "Teams lose time explaining the same product terms, tone rules, and market preferences on every launch. Hyperlocalise turns those decisions into reusable context.",
    },
    detailsHeadline:
      "If the last review taught the team something, the next workflow should know it.",
    summary:
      "Every approved translation, reviewer correction, glossary choice, and market-specific decision becomes context that agents and humans can reuse on the next job.",
    proofPoints: [
      {
        title: "Keep the decision",
        body: "Corrections, terminology choices, and product context stop disappearing into old comments.",
      },
      {
        title: "Reuse the nuance",
        body: "Future suggestions can start from what the team already approved instead of asking again.",
      },
      {
        title: "Reduce review churn",
        body: "Market rules, voice preferences, and repeated mistakes stay visible across workflows.",
      },
    ],
    cta: {
      headline: "Make every review improve the next one.",
      description:
        "Capture the context and corrections your team already creates, then make them available when the next launch starts.",
    },
    related: [
      { label: "Agents Automation", href: "/product/agents-automation" },
      { label: "Next-gen CAT Tool", href: "/product/next-gen-cat-tool" },
    ],
  },
];

export const productPagesBySlug = Object.fromEntries(
  productPages.map((page) => [page.slug, page]),
) as Record<ProductPageSlug, ProductPageContent>;

export const productSlugs = productPages.map((page) => page.slug);
