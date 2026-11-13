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
import type { IntlShape } from "@formatjs/intl";

import type { HomepageFaqItem } from "@/components/marketing/homepage-faq-content";

// Inline formatMessage() calls so the catalog extractor picks every string up.
export function formatLocalisationCliAndApiFaq(intl: IntlShape): {
  heading: string;
  subheading: string;
  items: HomepageFaqItem[];
} {
  return {
    heading: intl.formatMessage({
      defaultMessage: "A few things\nyou might ask.",
      id: "GDUQE2YEtY",
      description: "FAQ heading on the localisation-cli-and-api use case page",
    }),
    subheading: intl.formatMessage({
      defaultMessage: "Localisation in your terminal, CI, and code.",
      id: "4LD44eKXZc",
      description: "FAQ subheading on the localisation-cli-and-api use case page",
    }),
    items: [
      {
        question: intl.formatMessage({
          defaultMessage: "What does the CLI do?",
          id: "TJzZUSEIA2",
          description: "localisation-cli-and-api use case FAQ question 1",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "It extracts messages from source code, pushes source files to your project, and pulls translations back into your repository. The same commands run on a laptop and in CI.",
          id: "OIw4ri4SNr",
          description: "localisation-cli-and-api use case FAQ answer 1",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "How is a repository configured?",
          id: "0ARpByq0q8",
          description: "localisation-cli-and-api use case FAQ question 2",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "With an i18n.yml file in the repository root that lists the source locale, target locales, and file mappings. Each project's settings include a sample you can copy.",
          id: "Vngdg1iWMO",
          description: "localisation-cli-and-api use case FAQ answer 2",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "How does CI authenticate?",
          id: "tUQOHX2k1A",
          description: "localisation-cli-and-api use case FAQ question 3",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "With an API key created under Settings, read from an environment variable such as HYPERLOCALISE_API_KEY. Keys can be limited to the permissions CI needs and revoked at any time.",
          id: "Hp5jzWXprV",
          description: "localisation-cli-and-api use case FAQ answer 3",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "Which file formats are supported?",
          id: "spvtTAKOGv",
          description: "localisation-cli-and-api use case FAQ question 4",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "Common localisation formats including JSON, YAML, PO, XLIFF, and more. See the file formats page in the docs for the full list.",
          id: "YSXkmv+Ld6",
          description: "localisation-cli-and-api use case FAQ answer 4",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "What can I do with the API?",
          id: "r1XrmbImoM",
          description: "localisation-cli-and-api use case FAQ question 5",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "Upload source files, create translation jobs, check job status, download translated files, and import or export translation memory. Webhooks notify you when work finishes.",
          id: "tRvXJdFo5L",
          description: "localisation-cli-and-api use case FAQ answer 5",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "Do we have to use your translation engine?",
          id: "NQI5GeXhlu",
          description: "localisation-cli-and-api use case FAQ question 6",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "No. Translation and review happen in the workspace with the models, vendors, and reviewers you choose. The CLI and API move files in and out.",
          id: "eDulz6dgTa",
          description: "localisation-cli-and-api use case FAQ answer 6",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "Can we keep our existing TMS?",
          id: "djBj1lcXsJ",
          description: "localisation-cli-and-api use case FAQ question 7",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "Yes. The CLI can sync with supported TMS platforms, and Platform sync takes precedence when both are configured.",
          id: "5DDAC2HaxW",
          description: "localisation-cli-and-api use case FAQ answer 7",
        }),
      },
      {
        question: intl.formatMessage({
          defaultMessage: "Do you use this yourselves?",
          id: "BGRs1nJYcm",
          description: "localisation-cli-and-api use case FAQ question 8",
        }),
        answer: intl.formatMessage({
          defaultMessage:
            "Yes. Our own web app extracts and pushes messages on every merge, and a nightly job pulls translations and opens a pull request.",
          id: "3cLEXnOO6R",
          description: "localisation-cli-and-api use case FAQ answer 8",
        }),
      },
    ],
  };
}
