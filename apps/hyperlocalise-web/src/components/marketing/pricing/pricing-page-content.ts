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
import { getIntlShape } from "@/lib/app-i18n/intl";

import {
  getPricingCatalogEntries,
  type PricingModelAccess,
  type PricingModelCopyKey,
  type PricingModelJob,
  type PricingModelProviderId,
} from "./pricing-model-catalog";

export type PricingPlanId = "free" | "starter" | "growth" | "enterprise";

export type PricingPlanCta = {
  label: string;
  kind: "signup" | "demo";
};

export type PricingPlan = {
  id: PricingPlanId;
  name: string;
  /** Optional badge beside the plan name (for example Auto-enable on Free). */
  badge: string | null;
  price: string;
  priceSuffix: string | null;
  description: string;
  popular: boolean;
  includesFrom: string | null;
  features: string[];
  cta: PricingPlanCta;
};

export type PricingMatrixCell =
  | { kind: "check" }
  | { kind: "dash" }
  | { kind: "text"; value: string };

export type PricingMatrixRow = {
  id: string;
  label: string;
  /** Optional supporting copy shown under the row label in the comparison matrix. */
  detail?: string;
  cells: Record<PricingPlanId, PricingMatrixCell>;
};

export type PricingMatrixSection = {
  id: string;
  title: string;
  description: string;
  rows: PricingMatrixRow[];
};

export const pricingPlanOrder: readonly PricingPlanId[] = [
  "free",
  "starter",
  "growth",
  "enterprise",
] as const;

export function getPricingPlans(locale: string): PricingPlan[] {
  const intl = getIntlShape(locale);
  const startForFree = intl.formatMessage({
    defaultMessage: "Start for free",
    id: "+FcGOPQu9Z",
    description: "Free plan CTA label on the pricing page",
  });
  const getStarted = intl.formatMessage({
    defaultMessage: "Get started",
    id: "8Oyr38Aj4F",
    description: "Paid self-serve plan CTA label on the pricing page",
  });
  const perMonth = intl.formatMessage({
    defaultMessage: "/mo.",
    id: "clr4hixI6B",
    description: "Monthly price suffix on pricing cards",
  });

  return [
    {
      id: "free",
      name: intl.formatMessage({
        defaultMessage: "Free Plan",
        id: "71I+YToKV7",
        description: "Free plan name on the pricing page",
      }),
      badge: intl.formatMessage({
        defaultMessage: "Auto-enable",
        id: "/a2VqYlgh4",
        description: "Badge on the Free pricing plan indicating automatic provisioning",
      }),
      price: intl.formatMessage({
        defaultMessage: "Free",
        id: "UL0g2ZIWhm",
        description: "Free plan price on the pricing page",
      }),
      priceSuffix: null,
      description: intl.formatMessage({
        defaultMessage: "Evaluate Hyperlocalise with a single-seat workspace.",
        id: "4Xya9zkpLQ",
        description: "Free plan description on the pricing page",
      }),
      popular: false,
      includesFrom: null,
      features: [
        intl.formatMessage({
          defaultMessage: "1 project",
          id: "73DwGFhZM/",
          description: "Free plan feature: project limit",
        }),
        intl.formatMessage({
          defaultMessage: "1 seat",
          id: "V1lR4mPTs5",
          description: "Free plan feature: seat limit",
        }),
      ],
      cta: { label: startForFree, kind: "signup" },
    },
    {
      id: "starter",
      name: intl.formatMessage({
        defaultMessage: "Starter",
        id: "dBWJx9vBQt",
        description: "Starter plan name on the pricing page",
      }),
      badge: null,
      price: intl.formatMessage({
        defaultMessage: "$20",
        id: "cTTX9n9kbk",
        description: "Starter plan price on the pricing page",
      }),
      priceSuffix: perMonth,
      description: intl.formatMessage({
        defaultMessage: "For small teams that need more seats and projects.",
        id: "x9qwrwtKqR",
        description: "Starter plan description on the pricing page",
      }),
      popular: false,
      includesFrom: intl.formatMessage({
        defaultMessage: "All Free features, plus:",
        id: "yoOShm3Zjk",
        description: "Starter plan intro above incremental features",
      }),
      features: [
        intl.formatMessage({
          defaultMessage: "2 integrations",
          id: "v0pahqQ3yE",
          description: "Starter plan feature: integration limit",
        }),
        intl.formatMessage({
          defaultMessage: "Unlimited projects",
          id: "iRIRASFRNC",
          description: "Starter plan feature: unlimited projects",
        }),
        intl.formatMessage({
          defaultMessage: "5 seats",
          id: "uc3WQiSxaw",
          description: "Starter plan feature: seat limit",
        }),
        intl.formatMessage({
          defaultMessage: "AI Feature",
          id: "EtJmzwZSzn",
          description: "Paid plan feature: AI feature access",
        }),
        intl.formatMessage({
          defaultMessage: "Queries Board",
          id: "+zBo713DAu",
          description: "Starter plan feature: Queries Board access",
        }),
        intl.formatMessage({
          defaultMessage: "$20 per month AI credit",
          id: "fnuHA5r7aQ",
          description: "Starter plan feature: included monthly AI credit",
        }),
      ],
      cta: { label: getStarted, kind: "signup" },
    },
    {
      id: "growth",
      name: intl.formatMessage({
        defaultMessage: "Growth Plan",
        id: "0x5bWok1f2",
        description: "Growth plan name on the pricing page",
      }),
      badge: null,
      price: intl.formatMessage({
        defaultMessage: "$2,000",
        id: "y9blutdtEE",
        description: "Growth plan price on the pricing page",
      }),
      priceSuffix: perMonth,
      description: intl.formatMessage({
        defaultMessage: "For teams running localisation in production every week.",
        id: "8yfcbh9AO6",
        description: "Growth plan description on the pricing page",
      }),
      popular: true,
      includesFrom: intl.formatMessage({
        defaultMessage: "All Starter features, plus:",
        id: "4HG5INMxUv",
        description: "Growth plan intro above incremental features",
      }),
      features: [
        intl.formatMessage({
          defaultMessage: "20 automations",
          id: "9J3EZADGbx",
          description: "Growth plan feature: automation limit",
        }),
        intl.formatMessage({
          defaultMessage: "5 integrations",
          id: "j0iC3VoekG",
          description: "Growth plan feature: integration limit",
        }),
        intl.formatMessage({
          defaultMessage: "Unlimited projects",
          id: "iRIRASFRNC",
          description: "Starter plan feature: unlimited projects",
        }),
        intl.formatMessage({
          defaultMessage: "Unlimited seats",
          id: "7X4JZ1+tNc",
          description: "Growth plan feature: unlimited seats",
        }),
        intl.formatMessage({
          defaultMessage: "2,000 agent runs per month",
          id: "saGDzW8Kz5",
          description: "Growth plan feature: agent run quota",
        }),
        intl.formatMessage({
          defaultMessage: "Unlimited translation jobs",
          id: "tFGX4qNX4h",
          description: "Growth plan feature: unlimited translation jobs",
        }),
        intl.formatMessage({
          defaultMessage: "AI Feature",
          id: "EtJmzwZSzn",
          description: "Paid plan feature: AI feature access",
        }),
        intl.formatMessage({
          defaultMessage: "Automation Workflow",
          id: "bfWw2Q3euR",
          description: "Growth plan feature: Automation Workflow access",
        }),
        intl.formatMessage({
          defaultMessage: "Queries Board",
          id: "+zBo713DAu",
          description: "Starter plan feature: Queries Board access",
        }),
        intl.formatMessage({
          defaultMessage: "$2,000 per month AI credit",
          id: "blxqR2KvgQ",
          description: "Growth plan feature: included monthly AI credit",
        }),
      ],
      cta: { label: getStarted, kind: "signup" },
    },
    {
      id: "enterprise",
      name: intl.formatMessage({
        defaultMessage: "Enterprise",
        id: "Bgy156rCP9",
        description: "Enterprise plan name on the pricing page",
      }),
      badge: null,
      price: intl.formatMessage({
        defaultMessage: "Custom",
        id: "fMyeM5BW3s",
        description: "Enterprise plan price label on the pricing page",
      }),
      priceSuffix: null,
      description: intl.formatMessage({
        defaultMessage: "For organizations that need custom limits and support.",
        id: "ZBij4iUX44",
        description: "Enterprise plan description on the pricing page",
      }),
      popular: false,
      includesFrom: intl.formatMessage({
        defaultMessage: "All Growth features, plus:",
        id: "uxTXRcu5Em",
        description: "Enterprise plan intro above incremental features",
      }),
      features: [
        intl.formatMessage({
          defaultMessage: "Custom usage limits",
          id: "e6PVBNU9Sg",
          description: "Enterprise plan feature: custom limits",
        }),
        intl.formatMessage({
          defaultMessage: "SSO / SAML",
          id: "OtoAcs/psJ",
          description: "Enterprise plan feature: SSO",
        }),
        intl.formatMessage({
          defaultMessage: "Service-level agreement",
          id: "AUcojcp0lZ",
          description: "Enterprise plan feature: SLA",
        }),
        intl.formatMessage({
          defaultMessage: "Dedicated support",
          id: "1M4Hu48OSE",
          description: "Enterprise plan feature: dedicated support",
        }),
        intl.formatMessage({
          defaultMessage: "Security review assistance",
          id: "vUcO7nkRNE",
          description: "Enterprise plan feature: security review help",
        }),
      ],
      cta: {
        label: intl.formatMessage({
          defaultMessage: "Contact Sales",
          id: "MRoAAfbdki",
          description: "Enterprise plan CTA label on the pricing page",
        }),
        kind: "demo",
      },
    },
  ];
}

export function getPricingMatrixSections(locale: string): PricingMatrixSection[] {
  const intl = getIntlShape(locale);
  const unlimited = intl.formatMessage({
    defaultMessage: "Unlimited",
    id: "SNl5ipNJ6A",
    description: "Matrix cell value for unlimited plan limits",
  });
  const custom = intl.formatMessage({
    defaultMessage: "Custom",
    id: "yEwFJfSgTY",
    description: "Matrix cell value for custom enterprise limits",
  });

  return [
    {
      id: "workspace",
      title: intl.formatMessage({
        defaultMessage: "Workspace",
        id: "DRiVk5mEAF",
        description: "Pricing matrix section title for workspace limits",
      }),
      description: intl.formatMessage({
        defaultMessage: "Projects, seats, and connected tools for your team.",
        id: "0HGkduChrS",
        description: "Pricing matrix section description for workspace limits",
      }),
      rows: [
        {
          id: "projects",
          label: intl.formatMessage({
            defaultMessage: "Projects",
            id: "Pd3edSzEYJ",
            description: "Pricing matrix row label for projects",
          }),
          cells: {
            free: { kind: "text", value: "1" },
            starter: { kind: "text", value: unlimited },
            growth: { kind: "text", value: unlimited },
            enterprise: { kind: "text", value: custom },
          },
        },
        {
          id: "seats",
          label: intl.formatMessage({
            defaultMessage: "Seats",
            id: "X96S8fajCU",
            description: "Pricing matrix row label for seats",
          }),
          cells: {
            free: { kind: "text", value: "1" },
            starter: { kind: "text", value: "5" },
            growth: { kind: "text", value: unlimited },
            enterprise: { kind: "text", value: custom },
          },
        },
        {
          id: "integrations",
          label: intl.formatMessage({
            defaultMessage: "Integrations",
            id: "3Zjg+fxxP+",
            description: "Pricing matrix row label for integrations",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "text", value: "2" },
            growth: { kind: "text", value: "5" },
            enterprise: { kind: "text", value: custom },
          },
        },
        {
          id: "automations",
          label: intl.formatMessage({
            defaultMessage: "Automations",
            id: "llbzw/iXGP",
            description: "Pricing matrix row label for automations",
          }),
          detail: intl.formatMessage({
            defaultMessage:
              "Scheduled and GitHub-triggered agent playbooks (not the visual workflow editor).",
            id: "P+MaWGCLAB",
            description: "Pricing matrix detail for agent automation quota row",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "dash" },
            growth: { kind: "text", value: "20" },
            enterprise: { kind: "text", value: custom },
          },
        },
      ],
    },
    {
      id: "usage",
      title: intl.formatMessage({
        defaultMessage: "Usage",
        id: "Kxj1NjlA8v",
        description: "Pricing matrix section title for usage quotas",
      }),
      description: intl.formatMessage({
        defaultMessage: "Monthly agent, token, and translation capacity.",
        id: "zEqfVrKbs/",
        description: "Pricing matrix section description for usage quotas",
      }),
      rows: [
        {
          id: "agent-runs",
          label: intl.formatMessage({
            defaultMessage: "Agent runs / month",
            id: "u1HpnCoRxX",
            description: "Pricing matrix row label for agent runs",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "dash" },
            growth: { kind: "text", value: "2,000" },
            enterprise: { kind: "text", value: custom },
          },
        },
        {
          id: "ai-tokens",
          label: intl.formatMessage({
            defaultMessage: "AI credit / month",
            id: "csr373/O34",
            description: "Pricing matrix row label for included monthly AI credit",
          }),
          detail: intl.formatMessage({
            defaultMessage:
              "Managed model usage draws down your monthly AI credit balance at published rates.",
            id: "2AFaXwgQin",
            description: "Pricing matrix detail explaining monthly AI credit",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "text", value: "$20" },
            growth: { kind: "text", value: "$2,000" },
            enterprise: { kind: "text", value: custom },
          },
        },
        {
          id: "translation-jobs",
          label: intl.formatMessage({
            defaultMessage: "Translation jobs / month",
            id: "4WS98Fwfj2",
            description: "Pricing matrix row label for translation jobs",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "dash" },
            growth: { kind: "text", value: unlimited },
            enterprise: { kind: "text", value: custom },
          },
        },
        {
          id: "ai-features",
          label: intl.formatMessage({
            defaultMessage: "AI features",
            id: "bUBd4XGtBI",
            description: "Pricing matrix row label for AI features",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "check" },
            growth: { kind: "check" },
            enterprise: { kind: "check" },
          },
        },
      ],
    },
    {
      id: "queries-automation",
      title: intl.formatMessage({
        defaultMessage: "Queries & automation",
        id: "cBjVvDkrw1",
        description: "Pricing matrix section title for Queries and Automation Workflow",
      }),
      description: intl.formatMessage({
        defaultMessage:
          "Collaboration for copy and context issues, plus repeatable workflow tooling for production teams.",
        id: "7uZBXW8hcA",
        description: "Pricing matrix section description for Queries and Automation Workflow",
      }),
      rows: [
        {
          id: "queries-board",
          label: intl.formatMessage({
            defaultMessage: "Queries Board",
            id: "28A/J2yeKB",
            description: "Pricing matrix row label for Queries Board",
          }),
          detail: intl.formatMessage({
            defaultMessage:
              "Central place to log localization questions, triage copy issues, and keep reviewers aligned.",
            id: "F+TDVIQeN4",
            description: "Pricing matrix detail for Queries Board overview row",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "check" },
            growth: { kind: "check" },
            enterprise: { kind: "check" },
          },
        },
        {
          id: "queries-workspace-project",
          label: intl.formatMessage({
            defaultMessage: "Workspace & project views",
            id: "x5xGik3YFl",
            description: "Pricing matrix row for Queries workspace and project surfaces",
          }),
          detail: intl.formatMessage({
            defaultMessage: "Org-wide Queries list and per-project boards tied to your content.",
            id: "7611x1JIeq",
            description: "Pricing matrix detail for Queries workspace and project views",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "check" },
            growth: { kind: "check" },
            enterprise: { kind: "check" },
          },
        },
        {
          id: "queries-collaboration",
          label: intl.formatMessage({
            defaultMessage: "Comments, assignees & links",
            id: "2emviDP0f7",
            description: "Pricing matrix row for Queries collaboration features",
          }),
          detail: intl.formatMessage({
            defaultMessage: "Thread on issues, assign owners, and relate work across projects.",
            id: "8P9Vlj8jx9",
            description: "Pricing matrix detail for Queries collaboration features",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "check" },
            growth: { kind: "check" },
            enterprise: { kind: "check" },
          },
        },
        {
          id: "queries-import-bulk",
          label: intl.formatMessage({
            defaultMessage: "CSV import & bulk updates",
            id: "/GQj3K56LL",
            description: "Pricing matrix row for Queries import and bulk actions",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "check" },
            growth: { kind: "check" },
            enterprise: { kind: "check" },
          },
        },
        {
          id: "automation-workflow",
          label: intl.formatMessage({
            defaultMessage: "Automation Workflow",
            id: "oQ4ei78nry",
            description: "Pricing matrix row label for Automation Workflow",
          }),
          detail: intl.formatMessage({
            defaultMessage:
              "Visual, deterministic workflows—fixed steps and approvals instead of one-off agent chat.",
            id: "g/rzrQHbSt",
            description: "Pricing matrix detail for Automation Workflow overview row",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "dash" },
            growth: { kind: "check" },
            enterprise: { kind: "check" },
          },
        },
        {
          id: "automation-visual-editor",
          label: intl.formatMessage({
            defaultMessage: "Visual workflow editor",
            id: "IVt01o++9g",
            description: "Pricing matrix row for Automation Workflow visual editor",
          }),
          detail: intl.formatMessage({
            defaultMessage:
              "Compose triggers, branches, and actions on a canvas with typed bindings.",
            id: "8mV6lAbiyf",
            description: "Pricing matrix detail for Automation Workflow visual editor",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "dash" },
            growth: { kind: "check" },
            enterprise: { kind: "check" },
          },
        },
        {
          id: "automation-integrations",
          label: intl.formatMessage({
            defaultMessage: "HTTP, webhooks & AI steps",
            id: "TrBjo12/3b",
            description: "Pricing matrix row for Automation Workflow step types",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "dash" },
            growth: { kind: "check" },
            enterprise: { kind: "check" },
          },
        },
        {
          id: "automation-runs",
          label: intl.formatMessage({
            defaultMessage: "Manual test & scheduled runs",
            id: "1Bz70bU/oj",
            description: "Pricing matrix row for Automation Workflow execution",
          }),
          detail: intl.formatMessage({
            defaultMessage: "Dry-run drafts, publish versions, and run on a schedule or on demand.",
            id: "Yzbs+0FanB",
            description: "Pricing matrix detail for Automation Workflow execution",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "dash" },
            growth: { kind: "check" },
            enterprise: { kind: "check" },
          },
        },
      ],
    },
    {
      id: "enterprise",
      title: intl.formatMessage({
        defaultMessage: "Enterprise",
        id: "8tw6rEaK51",
        description: "Pricing matrix section title for enterprise controls",
      }),
      description: intl.formatMessage({
        defaultMessage: "Security, support, and commercial controls for larger orgs.",
        id: "ilusC30/97",
        description: "Pricing matrix section description for enterprise controls",
      }),
      rows: [
        {
          id: "sso",
          label: intl.formatMessage({
            defaultMessage: "SSO / SAML",
            id: "pjTufHJtA+",
            description: "Pricing matrix row label for SSO",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "dash" },
            growth: { kind: "dash" },
            enterprise: { kind: "check" },
          },
        },
        {
          id: "sla",
          label: intl.formatMessage({
            defaultMessage: "Service-level agreement",
            id: "q+3+ldE+Vn",
            description: "Pricing matrix row label for SLA",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "dash" },
            growth: { kind: "dash" },
            enterprise: { kind: "check" },
          },
        },
        {
          id: "dedicated-support",
          label: intl.formatMessage({
            defaultMessage: "Dedicated support",
            id: "YJhLdtyhdj",
            description: "Pricing matrix row label for dedicated support",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "dash" },
            growth: { kind: "dash" },
            enterprise: { kind: "check" },
          },
        },
        {
          id: "security-review",
          label: intl.formatMessage({
            defaultMessage: "Security review assistance",
            id: "EJHq4HC1h1",
            description: "Pricing matrix row label for security review assistance",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "dash" },
            growth: { kind: "dash" },
            enterprise: { kind: "check" },
          },
        },
      ],
    },
  ];
}

export type PricingAiFeature = {
  id: string;
  title: string;
  description: string;
};

export type PricingBrowserModel = {
  modelId: string;
  name: string;
  providerId: PricingModelProviderId;
  providerName: string;
  job: PricingModelJob;
  access: PricingModelAccess;
  summary: string;
  story: string;
  useWhen: string;
  billingLabel: string;
  highlight: string | null;
  recommended: boolean;
};

export type PricingModelFilterOption = {
  id: string;
  label: string;
};

export type PricingModelsSectionContent = {
  heading: string;
  subcopy: string;
  searchLabel: string;
  searchPlaceholder: string;
  jobFilterLabel: string;
  accessFilterLabel: string;
  scopeFilterLabel: string;
  scopes: readonly PricingModelFilterOption[];
  jobs: readonly PricingModelFilterOption[];
  accessOptions: readonly PricingModelFilterOption[];
  columnModel: string;
  columnHelpsWith: string;
  columnBilling: string;
  useWhenLabel: string;
  modelIdLabel: string;
  models: readonly PricingBrowserModel[];
  emptyRecommendedTitle: string;
  emptyRecommendedBody: string;
  showEveryModelLabel: string;
  emptyTitle: string;
  emptyBody: string;
  clearFiltersLabel: string;
  listLabel: string;
  footnote: string;
};

export function getPricingModelsSectionContent(locale: string): PricingModelsSectionContent {
  const intl = getIntlShape(locale);

  const includedBilling = intl.formatMessage({
    defaultMessage: "Included",
    id: "qDPDjijqjg",
    description: "Badge and filter for a model included with paid plans",
  });
  const byokBilling = intl.formatMessage({
    defaultMessage: "Your account",
    id: "fxjFqNjim9",
    description: "Badge and filter for a model billed to the customer's provider account",
  });
  const workspaceDefault = intl.formatMessage({
    defaultMessage: "Workspace default",
    id: "J3VsxKxltT",
    description: "Highlight for the default writing model on the pricing page",
  });

  const providerNames = {
    openai: intl.formatMessage({
      defaultMessage: "OpenAI",
      id: "ebSc/SgRuM",
      description: "OpenAI provider name on the pricing BYOK section",
    }),
    anthropic: intl.formatMessage({
      defaultMessage: "Anthropic",
      id: "zgB7RcHWk8",
      description: "Anthropic provider name on the pricing BYOK section",
    }),
    gemini: intl.formatMessage({
      defaultMessage: "Google Gemini",
      id: "4I4RDHWJ2Q",
      description: "Google Gemini provider name on the pricing BYOK section",
    }),
    fish: intl.formatMessage({
      defaultMessage: "Fish Audio",
      id: "p2iBQGftoM",
      description: "Fish Audio provider name on the pricing page",
    }),
    bytedance: intl.formatMessage({
      defaultMessage: "ByteDance",
      id: "l//f5K3F+p",
      description: "ByteDance provider name on the pricing page",
    }),
  } as const satisfies Record<PricingModelProviderId, string>;

  const copy = {
    luna: {
      summary: intl.formatMessage({
        defaultMessage: "Chat, translation, and coding",
        id: "ow1T0+Vk+a",
        description: "Summary for the default writing model on the pricing page",
      }),
      story: intl.formatMessage({
        defaultMessage:
          "This is the writer on paid plans. Ask it about a string, run a translation job, or let a coding agent draft a change. Usage comes out of your monthly AI credit. Connect your own OpenAI key if you want OpenAI to bill this model instead.",
        id: "Ino5JbBMsK",
        description: "Story for the default writing model on the pricing page",
      }),
      useWhen: intl.formatMessage({
        defaultMessage: "You want one default the whole workspace can share.",
        id: "MoH++be9F6",
        description: "Situation for the default writing model on the pricing page",
      }),
    },
    "luna-fast": {
      summary: intl.formatMessage({
        defaultMessage: "Quicker replies from Luna",
        id: "i8AxYRXb9E",
        description: "Summary for the fast Luna model on the pricing page",
      }),
      story: intl.formatMessage({
        defaultMessage:
          "A faster Luna for the same chat, translation, and coding work. Included on paid plans, and usage comes out of your monthly AI credit. Connect your own OpenAI key if you want OpenAI to bill it instead.",
        id: "fPXZYLvS43",
        description: "Story for the fast Luna model on the pricing page",
      }),
      useWhen: intl.formatMessage({
        defaultMessage: "You want the same Luna writer, with quicker replies.",
        id: "akrLncuXTs",
        description: "Situation for the fast Luna model on the pricing page",
      }),
    },
    "openai-writer": {
      summary: intl.formatMessage({
        defaultMessage: "Chat, translation, and coding",
        id: "Hv8dudDiIO",
        description: "Summary for an included OpenAI writing model on the pricing page",
      }),
      story: intl.formatMessage({
        defaultMessage:
          "Use it for chat, translation, and coding. Included on paid plans, and usage comes out of your monthly AI credit. Connect your own OpenAI key if you want OpenAI to bill this model instead.",
        id: "T2qLjqNIRT",
        description: "Story for an included OpenAI writing model on the pricing page",
      }),
      useWhen: intl.formatMessage({
        defaultMessage: "You want this OpenAI model for chat, translation, or coding.",
        id: "rzB2qvVXWW",
        description: "Situation for an included OpenAI writing model on the pricing page",
      }),
    },
    "openai-fast": {
      summary: intl.formatMessage({
        defaultMessage: "Quicker replies for writing",
        id: "r4DslyI+Ba",
        description: "Summary for a faster included OpenAI model on the pricing page",
      }),
      story: intl.formatMessage({
        defaultMessage:
          "A faster version for chat, translation, and coding. Included on paid plans, and usage comes out of your monthly AI credit. Connect your own OpenAI key if you want OpenAI to bill it instead.",
        id: "x7rTF4CYcT",
        description: "Story for a faster included OpenAI model on the pricing page",
      }),
      useWhen: intl.formatMessage({
        defaultMessage: "You want quicker replies from this OpenAI model.",
        id: "ZqN2yepK3V",
        description: "Situation for a faster included OpenAI model on the pricing page",
      }),
    },
    sonnet: {
      summary: intl.formatMessage({
        defaultMessage: "Longer drafts and review",
        id: "n5ZuB985rS",
        description: "Summary for Claude Sonnet on the pricing page",
      }),
      story: intl.formatMessage({
        defaultMessage:
          "Connect an Anthropic key and use Sonnet for longer drafts and review notes. Anthropic bills this usage. It does not draw down your monthly AI credit.",
        id: "t9wxr1NNC0",
        description: "Story for Claude Sonnet on the pricing page",
      }),
      useWhen: intl.formatMessage({
        defaultMessage: "You want a second writer for longer text.",
        id: "/SJnfuawRk",
        description: "Situation for Claude Sonnet on the pricing page",
      }),
    },
    opus: {
      summary: intl.formatMessage({
        defaultMessage: "A more careful pass",
        id: "Pb5w1LHor2",
        description: "Summary for Claude Opus on the pricing page",
      }),
      story: intl.formatMessage({
        defaultMessage:
          "Connect an Anthropic key and use Opus when the wording needs extra attention. Anthropic bills this usage. It does not draw down your monthly AI credit.",
        id: "JTdejUyr0G",
        description: "Story for Claude Opus on the pricing page",
      }),
      useWhen: intl.formatMessage({
        defaultMessage: "The wording needs extra attention.",
        id: "oAdWI3pqoy",
        description: "Situation for Claude Opus on the pricing page",
      }),
    },
    haiku: {
      summary: intl.formatMessage({
        defaultMessage: "Shorter turns",
        id: "5vxosjDykR",
        description: "Summary for Claude Haiku on the pricing page",
      }),
      story: intl.formatMessage({
        defaultMessage:
          "Connect an Anthropic key and use Haiku for shorter turns. Anthropic bills this usage. It does not draw down your monthly AI credit.",
        id: "G715x+6MXV",
        description: "Story for Claude Haiku on the pricing page",
      }),
      useWhen: intl.formatMessage({
        defaultMessage: "You want shorter turns and quicker replies.",
        id: "YCaD+nC2OM",
        description: "Situation for Claude Haiku on the pricing page",
      }),
    },
    "gemini-flash": {
      summary: intl.formatMessage({
        defaultMessage: "Quick drafts",
        id: "1hnHBtSh2K",
        description: "Summary for Gemini Flash on the pricing page",
      }),
      story: intl.formatMessage({
        defaultMessage:
          "Connect a Gemini key and use Flash to move through a long list of strings. Google bills this usage. It does not draw down your monthly AI credit.",
        id: "3BtQulEZ6Y",
        description: "Story for Gemini Flash on the pricing page",
      }),
      useWhen: intl.formatMessage({
        defaultMessage: "You have many short strings and want quick drafts.",
        id: "9ia5fOVQ3G",
        description: "Situation for Gemini Flash on the pricing page",
      }),
    },
    "gemini-pro": {
      summary: intl.formatMessage({
        defaultMessage: "Harder drafts",
        id: "qWuPZZeIC0",
        description: "Summary for Gemini Pro on the pricing page",
      }),
      story: intl.formatMessage({
        defaultMessage:
          "Connect a Gemini key and use Pro for harder drafts. Google bills this usage. It does not draw down your monthly AI credit.",
        id: "hRiPxjtqBZ",
        description: "Story for Gemini Pro on the pricing page",
      }),
      useWhen: intl.formatMessage({
        defaultMessage: "You want a more careful Google model for harder drafts.",
        id: "upsJCx/arg",
        description: "Situation for Gemini Pro on the pricing page",
      }),
    },
    voice: {
      summary: intl.formatMessage({
        defaultMessage: "Hear how a line sounds",
        id: "V5Cs48ujmR",
        description: "Summary for the text to speech model on the pricing page",
      }),
      story: intl.formatMessage({
        defaultMessage:
          "It reads copy aloud so you can check rhythm and length before a voiceover goes out. Included on paid plans. Usage comes out of your monthly AI credit.",
        id: "1KKO0Okjmc",
        description: "Story for the text to speech model on the pricing page",
      }),
      useWhen: intl.formatMessage({
        defaultMessage: "You want to hear the rhythm and length of a line.",
        id: "YP1eohi/Yy",
        description: "Situation for the text to speech model on the pricing page",
      }),
    },
    listen: {
      summary: intl.formatMessage({
        defaultMessage: "Turn speech into text",
        id: "RSD6Hb39Fw",
        description: "Summary for the transcription model on the pricing page",
      }),
      story: intl.formatMessage({
        defaultMessage:
          "Turn a recording into text your team can review and translate. Included on paid plans. Usage comes out of your monthly AI credit.",
        id: "O+malJ4pAE",
        description: "Story for the transcription model on the pricing page",
      }),
      useWhen: intl.formatMessage({
        defaultMessage: "A recording needs to become copy you can localize.",
        id: "b/ulx7nVXu",
        description: "Situation for the transcription model on the pricing page",
      }),
    },
    picture: {
      summary: intl.formatMessage({
        defaultMessage: "Still images from a short brief",
        id: "cHYsUGiY4s",
        description: "Summary for the image model on the pricing page",
      }),
      story: intl.formatMessage({
        defaultMessage:
          "Describe the picture you need for a campaign or a stand-in visual. Included on paid plans. Usage comes out of your monthly AI credit.",
        id: "Tr9qQQZ/aQ",
        description: "Story for the image model on the pricing page",
      }),
      useWhen: intl.formatMessage({
        defaultMessage: "You need an image, not another paragraph.",
        id: "Ge+3hBBbLV",
        description: "Situation for the image model on the pricing page",
      }),
    },
    video: {
      summary: intl.formatMessage({
        defaultMessage: "Short video from a brief",
        id: "t1MgIE0AON",
        description: "Summary for the video model on the pricing page",
      }),
      story: intl.formatMessage({
        defaultMessage:
          "Describe a short clip when a market needs motion as well as words. Included on paid plans. Usage comes out of your monthly AI credit.",
        id: "Bqz0aRCBut",
        description: "Story for the video model on the pricing page",
      }),
      useWhen: intl.formatMessage({
        defaultMessage: "A still image is not enough for the campaign.",
        id: "pWIlwfK6L5",
        description: "Situation for the video model on the pricing page",
      }),
    },
  } as const satisfies Record<
    PricingModelCopyKey,
    { summary: string; story: string; useWhen: string }
  >;

  const billingLabels = {
    included: includedBilling,
    byok: byokBilling,
  } as const satisfies Record<PricingModelAccess, string>;

  return {
    heading: intl.formatMessage({
      defaultMessage: "Models your team can use",
      id: "rc9DBDztDD",
      description: "Heading for the models section on the pricing page",
    }),
    subcopy: intl.formatMessage({
      defaultMessage:
        "Paid plans include models for writing, voice, listening, pictures, and video. Those draw from your monthly AI credit. Connect OpenAI, Anthropic, or Gemini when you want a writer billed to that account.",
      id: "rK02Gg9nl5",
      description: "Supporting copy for the models section on the pricing page",
    }),
    searchLabel: intl.formatMessage({
      defaultMessage: "Search models",
      id: "Zhasquwx2x",
      description: "Accessible label for the pricing model search field",
    }),
    searchPlaceholder: intl.formatMessage({
      defaultMessage: "Search by name or job",
      id: "Fb4AJ4nGEX",
      description: "Placeholder for the pricing model search field",
    }),
    jobFilterLabel: intl.formatMessage({
      defaultMessage: "Filter by job",
      id: "DT7M7vytkc",
      description: "Accessible label for the pricing model job filter",
    }),
    accessFilterLabel: intl.formatMessage({
      defaultMessage: "Filter by billing",
      id: "GpCoXXS8l1",
      description: "Accessible label for the pricing model billing filter",
    }),
    scopeFilterLabel: intl.formatMessage({
      defaultMessage: "Choose how many models to show",
      id: "YGFB2mB2iu",
      description: "Accessible label for the pricing model list scope",
    }),
    scopes: [
      {
        id: "recommended",
        label: intl.formatMessage({
          defaultMessage: "Recommended",
          id: "N/76NIMu0h",
          description: "Filter that shows the short model list on the pricing page",
        }),
      },
      {
        id: "all",
        label: intl.formatMessage({
          defaultMessage: "Every model",
          id: "WojZwK+028",
          description: "Filter that shows the full model list on the pricing page",
        }),
      },
    ],
    jobs: [
      {
        id: "all",
        label: intl.formatMessage({
          defaultMessage: "All",
          id: "nLIx9rcSZg",
          description: "Filter label for every model job on the pricing page",
        }),
      },
      {
        id: "write",
        label: intl.formatMessage({
          defaultMessage: "Writing",
          id: "ZMuADiRtdx",
          description: "Filter label for writing models on the pricing page",
        }),
      },
      {
        id: "speak",
        label: intl.formatMessage({
          defaultMessage: "Voice",
          id: "LRVFAS5BU6",
          description: "Filter label for voice models on the pricing page",
        }),
      },
      {
        id: "listen",
        label: intl.formatMessage({
          defaultMessage: "Listening",
          id: "UQJXYycHuy",
          description: "Filter label for transcription models on the pricing page",
        }),
      },
      {
        id: "picture",
        label: intl.formatMessage({
          defaultMessage: "Pictures",
          id: "4NRfGc3Yk+",
          description: "Filter label for image models on the pricing page",
        }),
      },
      {
        id: "video",
        label: intl.formatMessage({
          defaultMessage: "Video",
          id: "wCP+A1rntn",
          description: "Filter label for video models on the pricing page",
        }),
      },
    ],
    accessOptions: [
      {
        id: "all",
        label: intl.formatMessage({
          defaultMessage: "Any billing",
          id: "6W4y3PFOV8",
          description: "Filter label for every billing type on the pricing page",
        }),
      },
      { id: "included", label: includedBilling },
      { id: "byok", label: byokBilling },
    ],
    columnModel: intl.formatMessage({
      defaultMessage: "Model",
      id: "Up335i7GML",
      description: "Column label for the model name on the pricing page",
    }),
    columnHelpsWith: intl.formatMessage({
      defaultMessage: "What it helps with",
      id: "mCz1OMRk2y",
      description: "Column label for what a pricing model is used for",
    }),
    columnBilling: intl.formatMessage({
      defaultMessage: "Billing",
      id: "i70eKYLUvJ",
      description: "Column label for how a pricing model is billed",
    }),
    useWhenLabel: intl.formatMessage({
      defaultMessage: "Use it when",
      id: "I3a2YDu+oy",
      description: "Label above the situation a pricing model fits",
    }),
    modelIdLabel: intl.formatMessage({
      defaultMessage: "In AI Engine",
      id: "9Cdevjsa8b",
      description: "Label for the technical model id in the pricing model detail",
    }),
    models: getPricingCatalogEntries().map((entry) => {
      const entryCopy = copy[entry.copyKey];
      return {
        modelId: entry.modelId,
        name: entry.name,
        providerId: entry.providerId,
        providerName: providerNames[entry.providerId],
        job: entry.job,
        access: entry.access,
        summary: entryCopy.summary,
        story: entryCopy.story,
        useWhen: entryCopy.useWhen,
        billingLabel: billingLabels[entry.access],
        highlight: entry.highlight ? workspaceDefault : null,
        recommended: entry.recommended,
      };
    }),
    emptyRecommendedTitle: intl.formatMessage({
      defaultMessage: "Nothing recommended matches",
      id: "mWtA0VdJue",
      description: "Title when the recommended pricing models do not match the search",
    }),
    emptyRecommendedBody: intl.formatMessage({
      defaultMessage: "Look through every model, or clear the search.",
      id: "9M6xjAhsYc",
      description: "Help text when the recommended pricing models do not match the search",
    }),
    showEveryModelLabel: intl.formatMessage({
      defaultMessage: "Show every model",
      id: "kRkY9YXl2W",
      description: "Button that expands the pricing model list to the full catalog",
    }),
    emptyTitle: intl.formatMessage({
      defaultMessage: "No models match",
      id: "yj4HofLXjM",
      description: "Title when pricing model filters return nothing",
    }),
    emptyBody: intl.formatMessage({
      defaultMessage: "Try another job, or clear the search.",
      id: "LRjbYLhwbi",
      description: "Help text when pricing model filters return nothing",
    }),
    clearFiltersLabel: intl.formatMessage({
      defaultMessage: "Clear filters",
      id: "UvSp5y/OIh",
      description: "Button that resets pricing model search and filters",
    }),
    listLabel: intl.formatMessage({
      defaultMessage: "Models",
      id: "JKmR2EOv2K",
      description: "Accessible label for the pricing model list",
    }),
    footnote: intl.formatMessage({
      defaultMessage:
        "Connect a key in AI Engine on Starter, Growth, or Enterprise. Ask, Translation, Coding, file translation, and automations follow the workspace default. Speech, transcription, images, and video stay included.",
      id: "r6qom0JjbO",
      description: "Footnote under the model list on the pricing page",
    }),
  };
}

export function getPricingAiFeatures(locale: string): PricingAiFeature[] {
  const intl = getIntlShape(locale);

  return [
    {
      id: "ask-about-any-string",
      title: intl.formatMessage({
        defaultMessage: "Ask about any string",
        id: "rDFwnPnMxA",
        description: "AI feature capability title: ask about strings",
      }),
      description: intl.formatMessage({
        defaultMessage: "Get meaning, where it appears in the product, and how to translate it.",
        id: "GJZJnd3J8t",
        description: "AI feature capability body: ask about strings",
      }),
    },
    {
      id: "visual-context",
      title: intl.formatMessage({
        defaultMessage: "See the UI context",
        id: "2Y27cUhCTS",
        description: "AI feature capability title: visual context",
      }),
      description: intl.formatMessage({
        defaultMessage: "Screenshots so reviewers know where copy shows up.",
        id: "VFYJ+T/TTl",
        description: "AI feature capability body: visual context",
      }),
    },
    {
      id: "translate-in-chat",
      title: intl.formatMessage({
        defaultMessage: "Translate in chat",
        id: "rw4HCHelCR",
        description: "AI feature capability title: translate in chat",
      }),
      description: intl.formatMessage({
        defaultMessage: "Send files, text, or images in web, Slack, or email.",
        id: "9acpAUlA8Z",
        description: "AI feature capability body: translate in chat",
      }),
    },
    {
      id: "recent-change-briefs",
      title: intl.formatMessage({
        defaultMessage: "Catch what changed",
        id: "YNbxvilhkH",
        description: "AI feature capability title: recent change briefs",
      }),
      description: intl.formatMessage({
        defaultMessage: "Briefs on new or updated source copy, with context.",
        id: "36xVSohq0P",
        description: "AI feature capability body: recent change briefs",
      }),
    },
    {
      id: "organization-memory",
      title: intl.formatMessage({
        defaultMessage: "Remember your rules",
        id: "sVUx4aIt3x",
        description: "AI feature capability title: organization memory",
      }),
      description: intl.formatMessage({
        defaultMessage: "Keep tone and terminology guidance for the next job.",
        id: "hDNxzYjQkl",
        description: "AI feature capability body: organization memory",
      }),
    },
    {
      id: "tms-aware-drafting-qa",
      title: intl.formatMessage({
        defaultMessage: "Draft and check in your TMS",
        id: "hIOpWNAWDG",
        description: "AI feature capability title: TMS-aware drafting and QA",
      }),
      description: intl.formatMessage({
        defaultMessage: "Fill missing locales and run QA while people stay in control.",
        id: "6t3EqSwEpq",
        description: "AI feature capability body: TMS-aware drafting and QA",
      }),
    },
    {
      id: "agent-automations",
      title: intl.formatMessage({
        defaultMessage: "Automate the busywork",
        id: "iOJxHuvYs1",
        description: "AI feature capability title: agent automations",
      }),
      description: intl.formatMessage({
        defaultMessage:
          "Sync, validate, and notify the team on a schedule or when something lands.",
        id: "jNUm0wTEWX",
        description: "AI feature capability body: agent automations",
      }),
    },
    {
      id: "bring-your-own-llm",
      title: intl.formatMessage({
        defaultMessage: "Use the model you prefer",
        id: "hz8O9/ilG1",
        description: "AI feature capability title: bring your own LLM",
      }),
      description: intl.formatMessage({
        defaultMessage: "OpenAI, Anthropic, or Gemini — without changing how you work.",
        id: "kmECxTtxS5",
        description: "AI feature capability body: bring your own LLM",
      }),
    },
  ];
}

export function getPricingPageCopy(locale: string) {
  const intl = getIntlShape(locale);

  return {
    headline: intl.formatMessage({
      defaultMessage: "Scale localisation. Control your costs.",
      id: "gfUQK+bPpD",
      description: "Primary headline on the marketing pricing page",
    }),
    subcopy: intl.formatMessage({
      defaultMessage: "Simple plans for evaluating Hyperlocalise today.",
      id: "qRVA5sizhD",
      description: "Supporting copy under the pricing page headline",
    }),
    popularBadge: intl.formatMessage({
      defaultMessage: "Popular",
      id: "BhWHI3Tdnm",
      description: "Badge label on the featured Growth pricing plan",
    }),
    compareHeading: intl.formatMessage({
      defaultMessage: "Compare plans",
      id: "kqDNTw/sEr",
      description: "Heading above the pricing comparison matrix",
    }),
    compareSubcopy: intl.formatMessage({
      defaultMessage: "See what each plan includes before you choose a path.",
      id: "wNfaNj8oeP",
      description: "Supporting copy above the pricing comparison matrix",
    }),
    includedAriaLabel: intl.formatMessage({
      defaultMessage: "Included",
      id: "xEaoAlugPJ",
      description: "Accessible label for a checkmark in the pricing matrix",
    }),
    notIncludedAriaLabel: intl.formatMessage({
      defaultMessage: "Not included",
      id: "z9cqkREGyZ",
      description: "Accessible label for a dash in the pricing matrix",
    }),
    aiFeaturesHeading: intl.formatMessage({
      defaultMessage: "AI features",
      id: "Lmup4mp1Uh",
      description: "Heading for the AI features explainer on the pricing page",
    }),
    aiFeaturesSubcopy: intl.formatMessage({
      defaultMessage:
        "Included on Starter, Growth, and Enterprise. Clear answers on your copy, UI context, and localisation workflow.",
      id: "ULysfP8wxM",
      description: "Supporting copy under the AI features heading on the pricing page",
    }),
    undecidedHeading: intl.formatMessage({
      defaultMessage: "Can't decide?",
      id: "dOaxbDzrv5",
      description: "Heading for the undecided CTA band below the pricing FAQ",
    }),
    talkToSales: intl.formatMessage({
      defaultMessage: "Talk to sales",
      id: "MZ5aQR65ew",
      description: "Secondary CTA on the undecided pricing band",
    }),
    requestDemo: intl.formatMessage({
      defaultMessage: "Request a demo",
      id: "+iY8hxQCxr",
      description: "Primary CTA on the undecided pricing band",
    }),
  };
}
