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

export const startmateUrl = "https://www.startmate.com";
export const startmateLogoSrc = "/images/startmate-logo.svg";
export const companyHeroImageSrc = "/images/nasa-gyp1xkjZNg8-unsplash.jpg";

export const founders = [
  {
    id: "minh-cung",
    name: "Minh Cung",
    photoSrc: "/images/founders/minh-cung.jpg",
    linkedInUrl: "https://www.linkedin.com/in/minhcung/",
  },
  {
    id: "hans-bui",
    name: "Hans Bui",
    photoSrc: "/images/founders/hans-bui.jpg",
    linkedInUrl: "https://www.linkedin.com/in/hansbui/",
  },
] as const;

export function getCompanyPageCopy(locale: string) {
  const intl = getIntlShape(locale);

  return {
    headline: intl.formatMessage({
      defaultMessage: "Built by people who believe localisation connects the world",
      id: "NZyLH6QByp",
      description: "Primary headline on the marketing company page",
    }),
    subcopy: intl.formatMessage({
      defaultMessage:
        "Hyperlocalise helps teams launch product content globally with market nuance, translation, and first-class human review.",
      id: "6ZyNhsk6BY",
      description: "Supporting copy under the company page headline",
    }),
    requestDemo: intl.formatMessage({
      defaultMessage: "Request a demo",
      id: "HdyjqIAIyn",
      description: "Primary CTA on the marketing company page hero",
    }),
    backedByHeading: intl.formatMessage({
      defaultMessage: "Backed by",
      id: "IqLI+2o8dz",
      description: "Heading above investor logos on the company page",
    }),
    startmateName: intl.formatMessage({
      defaultMessage: "Startmate",
      id: "o5RLnUXcEq",
      description: "Startmate name shown in the backed-by section",
    }),
    startmateDescription: intl.formatMessage({
      defaultMessage: "Australia and New Zealand's leading startup accelerator.",
      id: "e3Ri2dN99z",
      description: "Short description under the Startmate name",
    }),
    foundersNoteHeading: intl.formatMessage({
      defaultMessage: "A note from the founders",
      id: "kjx+4Dj0jz",
      description: "Heading for the founders note section on the company page",
    }),
    foundersNoteParagraphs: [
      intl.formatMessage({
        defaultMessage: "One of us had the privilege of seeing localisation at its best.",
        id: "7bL5m3nsOA",
        description: "First paragraph of the founders note on the company page",
      }),
      intl.formatMessage({
        defaultMessage:
          "Working as a Localisation Engineer at Canva — a product used by millions around the world — Minh saw firsthand that localisation wasn't simply about translating software. It was one of the highest-leverage investments a company could make. Every new language unlocked new customers, stronger engagement, and deeper trust. More importantly, it allowed people to use technology in a language and culture that felt like home.",
        id: "8Y+UNS2n64",
        description: "Second paragraph of the founders note on the company page",
      }),
      intl.formatMessage({
        defaultMessage: "It reminded us that localisation is ultimately about connecting people.",
        id: "lhVzeGwfih",
        description: "Third paragraph of the founders note on the company page",
      }),
      intl.formatMessage({
        defaultMessage:
          "Hans brought the same urgency from another domain: as a Payment lead at Samsung, where shipping across markets meant coordinating product, risk, and trust at scale.",
        id: "7+BF6t4tmu",
        description: "Paragraph about Hans Samsung experience in the founders note",
      }),
      intl.formatMessage({
        defaultMessage:
          "But we also saw the reality behind every successful global launch. Localisation teams worked tirelessly to keep pace with product development. Product context lived in dozens of places. Questions were repeated across projects. Reviews stretched across time zones. As products shipped faster, the operational burden only grew.",
        id: "V3N8wNW3/m",
        description: "Fourth paragraph of the founders note on the company page",
      }),
      intl.formatMessage({
        defaultMessage:
          "The problem was never the talent of localisation teams. It was that they were expected to scale knowledge faster than any human team could.",
        id: "1SarEJV+CO",
        description: "Fifth paragraph of the founders note on the company page",
      }),
      intl.formatMessage({
        defaultMessage: "That's why we started Hyperlocalise.",
        id: "d+GX00LIbd",
        description: "Sixth paragraph of the founders note on the company page",
      }),
      intl.formatMessage({
        defaultMessage:
          "Our mission is to help every company reach the world without localisation becoming the bottleneck. We believe the future isn't replacing localisation professionals with AI. It's giving them an AI workforce that learns alongside them, understands product context, captures organisational knowledge, and removes the repetitive work that slows global releases.",
        id: "H//pE/RYmt",
        description: "Seventh paragraph of the founders note on the company page",
      }),
      intl.formatMessage({
        defaultMessage:
          "When knowledge is shared instead of searched for, localisation teams can focus on what humans do best: making products feel genuinely local, culturally relevant, and trustworthy.",
        id: "OXxWMckqBr",
        description: "Eighth paragraph of the founders note on the company page",
      }),
      intl.formatMessage({
        defaultMessage:
          "The impact goes far beyond operational efficiency. Companies can enter new markets sooner, launch every release globally with confidence, and unlock the return that comes from serving customers in their own language and cultural context. The faster products evolve, the more important this becomes.",
        id: "HXB7LX3AZ/",
        description: "Ninth paragraph of the founders note on the company page",
      }),
      intl.formatMessage({
        defaultMessage:
          "We're building Hyperlocalise with immense respect for the people behind localisation. They are often invisible to end users, yet their work helps millions of people access products, ideas, and opportunities across cultures every day.",
        id: "NtgimRwM7t",
        description: "Tenth paragraph of the founders note on the company page",
      }),
      intl.formatMessage({
        defaultMessage:
          "If we can help those teams scale without losing quality or humanity, then we've done something worthwhile.",
        id: "uQr06xdr2T",
        description: "Eleventh paragraph of the founders note on the company page",
      }),
      intl.formatMessage({
        defaultMessage: "Because every language is another opportunity to connect people.",
        id: "FiNdNgLOfB",
        description: "Twelfth paragraph of the founders note on the company page",
      }),
    ],
    teamHeading: intl.formatMessage({
      defaultMessage: "Founders",
      id: "PVXHS+qpRe",
      description: "Heading above founder cards on the company page",
    }),
    cofounderRole: intl.formatMessage({
      defaultMessage: "Co-founder",
      id: "j8gL5p92ex",
      description: "Role label under each founder name on the company page",
    }),
    linkedInLabel: intl.formatMessage({
      defaultMessage: "LinkedIn",
      id: "/vxavoK/xz",
      description: "LinkedIn link label on founder cards",
    }),
  };
}
