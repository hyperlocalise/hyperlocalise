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
import type { HomepageFaqItem } from "@/components/marketing/homepage-faq-content";
import { getIntlShape } from "@/lib/app-i18n/intl";

export const startupsHeroImageSrc = "/images/vimal-s-GBg3jyGS-Ug-unsplash.jpg";
export const startmateUrl = "https://www.startmate.com";
export const startmateLogoSrc = "/images/startmate-logo.svg";
export const slatorUrl = "https://slator.com/2026-slator-language-ai-50-under-50/";
export const slatorLogoSrc = "/images/slator-logo.svg";

export const trustedByLogos = [
  {
    id: "heidi-health",
    href: "https://www.heidihealth.com",
    src: "/images/customers/heidi-health-logo.png",
    width: 800,
    height: 332,
    className: "h-7 sm:h-8",
  },
  {
    id: "tourfinder",
    href: "https://tourfinder.vn",
    src: "/images/customers/tourfinder-logo.png",
    width: 1177,
    height: 294,
    className: "h-6 sm:h-7",
  },
  {
    id: "tourmatic",
    href: "https://tourmatic.io",
    src: "/images/customers/tourmatic-logo.svg",
    width: 315,
    height: 58,
    className: "h-6 sm:h-7",
  },
] as const;

export function getStartupsPageCopy(locale: string) {
  const intl = getIntlShape(locale);

  return {
    headline: intl.formatMessage({
      defaultMessage: "New markets. 100x momentum.",
      id: "4rmmdM56iz",
      description: "Primary headline on the marketing startups page",
    }),
    offerLine: intl.formatMessage({
      defaultMessage: "80% off Growth to launch globally in days.",
      id: "REEtEqm192",
      description: "Offer line under the startups page headline",
    }),
    applyCta: intl.formatMessage({
      defaultMessage: "Apply for startup pricing",
      id: "TRlFNEhzfJ",
      description: "Primary CTA on the startups page hero and program section",
    }),
    seePricingCta: intl.formatMessage({
      defaultMessage: "See pricing",
      id: "ZnysOZy/rI",
      description: "Secondary CTA linking to the pricing page from the startups hero",
    }),
    whyHeading: intl.formatMessage({
      defaultMessage: "Built for teams scaling into new markets",
      id: "4Q7IA4cUr1",
      description: "Heading for the why-startups benefits section",
    }),
    whySubcopy: intl.formatMessage({
      defaultMessage:
        "Entering a new market should feel like growth, not a second product launch that stalls the company.",
      id: "SSTF1YYS27",
      description: "Supporting copy under the why-startups heading",
    }),
    benefits: [
      {
        id: "global-complexity",
        title: intl.formatMessage({
          defaultMessage: "New markets are not copy-paste",
          id: "l+4ZVzc8lT",
          description: "Story beat title: scaling requires market-specific fit",
        }),
        body: intl.formatMessage({
          defaultMessage:
            "Each market brings different customer expectations, language, and compliance requirements. Expansion only works when your product still feels right locally.",
          id: "6ivqVq7zS5",
          description: "Story beat body: markets need local fit and compliance",
        }),
      },
      {
        id: "context-without-overhead",
        title: intl.formatMessage({
          defaultMessage: "Growth should not create busywork",
          id: "SvpJwumZyD",
          description: "Story beat title: scaling should not add coordination overhead",
        }),
        body: intl.formatMessage({
          defaultMessage:
            "Small teams cannot afford a new process for every country. You need a way to scale market launches without drowning the product team.",
          id: "dtxXs1IpQ7",
          description: "Story beat body: scale without burying the product team",
        }),
      },
      {
        id: "launch-at-speed",
        title: intl.formatMessage({
          defaultMessage: "Move while the opportunity is open",
          id: "tpB8bOrCyY",
          description: "Story beat title: scale into markets while timing favors you",
        }),
        body: intl.formatMessage({
          defaultMessage:
            "The companies that win open product and marketing in new markets in days, not after a long setup cycle. Speed matters when the opportunity is in front of you.",
          id: "zzgULmXNCF",
          description: "Story beat body: enter markets quickly when opportunity appears",
        }),
      },
    ],
    proofHeading: intl.formatMessage({
      defaultMessage: "Trusted by teams going global early",
      id: "2lPB6SLWPB",
      description: "Heading for the startups page social proof section",
    }),
    heidiHealthAlt: intl.formatMessage({
      defaultMessage: "Heidi Health",
      id: "FVe674aA/n",
      description: "Alt text for the Heidi Health logo on the startups page",
    }),
    tourfinderAlt: intl.formatMessage({
      defaultMessage: "Tourfinder",
      id: "NWBLW7QFvn",
      description: "Alt text for the Tourfinder logo on the startups page",
    }),
    tourmaticAlt: intl.formatMessage({
      defaultMessage: "Tourmatic",
      id: "mnlYeyj08E",
      description: "Alt text for the Tourmatic logo on the startups page",
    }),
    tourfinderResult: intl.formatMessage({
      defaultMessage: "Tourfinder launched Vietnamese and Japanese marketing in days, not months.",
      id: "xkvlRbfU7k",
      description: "Tourfinder traction one-liner on the startups page",
    }),
    recognitionHeading: intl.formatMessage({
      defaultMessage: "Recognition",
      id: "diE57pixFS",
      description: "Heading above Startmate and Slator recognition on the startups page",
    }),
    startmateName: intl.formatMessage({
      defaultMessage: "Startmate",
      id: "qlC3SJDnRm",
      description: "Startmate name on the startups page recognition row",
    }),
    startmateDescription: intl.formatMessage({
      defaultMessage: "Backed by Australia and New Zealand's leading startup accelerator.",
      id: "vgj4VLCd7U",
      description: "Startmate description on the startups page",
    }),
    slatorName: intl.formatMessage({
      defaultMessage: "Slator Language AI 50 Under 50",
      id: "Z99fVSK2K8",
      description: "Slator recognition name on the startups page",
    }),
    slatorDescription: intl.formatMessage({
      defaultMessage: "Selected for the 2026 Slator Language AI 50 Under 50.",
      id: "DRg3CQC9an",
      description: "Slator recognition description on the startups page",
    }),
    programHeading: intl.formatMessage({
      defaultMessage: "Hyperlocalise Startup Program",
      id: "17dOLN4clX",
      description: "Heading for the startup program eligibility section",
    }),
    programSubcopy: intl.formatMessage({
      defaultMessage:
        "Early-stage startups can get up to 80% off the Growth plan for the first 12 months, or while you qualify. We confirm fit and pricing on the demo.",
      id: "fNsrVmOrc3",
      description: "Supporting copy for the startup program eligibility section",
    }),
    eligibilityHeading: intl.formatMessage({
      defaultMessage: "Who can apply",
      id: "lSzcdHw8Ko",
      description: "Heading above startup program eligibility bullets",
    }),
    eligibility: [
      intl.formatMessage({
        defaultMessage: "New Hyperlocalise customer",
        id: "V5fRx/1XLP",
        description: "Startup program eligibility: new customer",
      }),
      intl.formatMessage({
        defaultMessage: "Early-stage, typically under 50 employees or pre-Series B",
        id: "WoD+am33dd",
        description: "Startup program eligibility: company stage",
      }),
      intl.formatMessage({
        defaultMessage: "Applying for the Growth plan",
        id: "RXXOOcxbRk",
        description: "Startup program eligibility: Growth plan",
      }),
    ],
    finalHeading: intl.formatMessage({
      defaultMessage: "Ready for the next market?",
      id: "iVPGu5Ye6L",
      description: "Final CTA heading on the startups page",
    }),
    finalSubcopy: intl.formatMessage({
      defaultMessage:
        "Book a demo. We'll confirm eligibility and show you startup pricing at 80% off Growth.",
      id: "jWomcj3eo6",
      description: "Final CTA supporting copy on the startups page",
    }),
  };
}

export function getStartupsFaqItems(locale: string): HomepageFaqItem[] {
  const intl = getIntlShape(locale);

  return [
    {
      question: intl.formatMessage({
        defaultMessage: "What is the Hyperlocalise Startup Program?",
        id: "Tyhk/abQFS",
        description: "Startups FAQ question about what the program is",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "It is pricing support for early-stage startups adopting Hyperlocalise Growth. Qualifying teams can receive up to 80% off for their first 12 months, or while they still meet the program criteria. Exact terms are confirmed on the demo.",
        id: "V8A7lWd26M",
        description: "Startups FAQ answer about what the program is",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "Who is eligible?",
        id: "CR4EdyZSZI",
        description: "Startups FAQ question about eligibility",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "The program is designed for new Hyperlocalise customers that are early-stage — typically under 50 employees or pre-Series B — and looking at the Growth plan. If you are unsure, apply for a demo and we will confirm fit.",
        id: "pOCBt3fv7m",
        description: "Startups FAQ answer about eligibility",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "How do I apply?",
        id: "ambL1h5gLQ",
        description: "Startups FAQ question about how to apply",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Request a demo from this page. On the call we review your stage, product workflow, and localisation needs, then confirm whether startup pricing applies.",
        id: "K+l0K4IDAZ",
        description: "Startups FAQ answer about how to apply",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "Do I need Crowdin, Lokalise, or another TMS first?",
        id: "yGq0s5/abu",
        description: "Startups FAQ question about needing an existing TMS",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "No. Hyperlocalise includes a native TMS with an AI agent workflow, so startups can manage strings, drafts, and review without standing up a separate translation stack. Connect GitHub and Slack when you are ready to automate intake and release.",
        id: "9XeOGxKmUC",
        description: "Startups FAQ answer about needing an existing TMS",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: 'What does "up to 80% off" mean?',
        id: "QmJs3YzCjV",
        description: "Startups FAQ question about the discount amount",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "The maximum discount is 80% off Growth list pricing. The final amount depends on stage, scope, and fit. We share a clear number on the demo — nothing is charged until you agree.",
        id: "79OV0Q8xnc",
        description: "Startups FAQ answer about the discount amount",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "Our company is larger than 50 employees. Can we still apply?",
        id: "h3G4KiByU3",
        description: "Startups FAQ question for larger companies",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "The Startup Program is aimed at early-stage teams. Larger companies should still request a demo — we can discuss Growth or Enterprise options that fit your organisation.",
        id: "8akRFF2klx",
        description: "Startups FAQ answer for larger companies",
      }),
    },
  ];
}
