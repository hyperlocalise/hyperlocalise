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
import type { IntlShape } from "@formatjs/intl";

import { getIntlShape } from "@/lib/app-i18n/intl";

import {
  githubReleaseLocalisationFaqCopy,
  githubReleaseLocalisationFaqItems,
} from "./github-release-localisation-faq";
import {
  helpCenterLocalisationFaqCopy,
  helpCenterLocalisationFaqItems,
} from "./help-center-localisation-faq";
import {
  localisationOperationsFaqCopy,
  localisationOperationsFaqItems,
} from "./localisation-operations-faq";
import {
  localisationQualityMonitoringFaqCopy,
  localisationQualityMonitoringFaqItems,
} from "./localisation-quality-monitoring-faq";
import {
  marketingLocalisationFaqCopy,
  marketingLocalisationFaqItems,
} from "./marketing-localisation-faq";
import { formatLocalisationCliAndApiFaq } from "./localisation-cli-and-api-faq";
import { formatLocalisationForAiCodingAgentsFaq } from "./localisation-for-ai-coding-agents-faq";
import { formatMarketEntryFaq } from "./market-entry-faq";
import { formatMarketExperimentationFaq } from "./market-experimentation-faq";
import type {
  UseCaseFaqDescriptor,
  UseCaseFaqSectionCopy,
  UseCaseFaqSlug,
} from "./use-case-faq-types";

type FormattedFaq = { heading: string; subheading: string; items: HomepageFaqItem[] };

/** Older pages hold descriptors; newer pages format inline so the extractor sees every string. */
type UseCaseFaqBundle =
  | { copy: UseCaseFaqSectionCopy; items: UseCaseFaqDescriptor[] }
  | { format: (intl: IntlShape) => FormattedFaq };

const useCaseFaqBySlug: Record<UseCaseFaqSlug, UseCaseFaqBundle> = {
  "marketing-localisation": {
    copy: marketingLocalisationFaqCopy,
    items: marketingLocalisationFaqItems,
  },
  "help-center-localisation": {
    copy: helpCenterLocalisationFaqCopy,
    items: helpCenterLocalisationFaqItems,
  },
  "github-release-localisation": {
    copy: githubReleaseLocalisationFaqCopy,
    items: githubReleaseLocalisationFaqItems,
  },
  "localisation-quality-monitoring": {
    copy: localisationQualityMonitoringFaqCopy,
    items: localisationQualityMonitoringFaqItems,
  },
  "localisation-operations": {
    copy: localisationOperationsFaqCopy,
    items: localisationOperationsFaqItems,
  },
  "market-entry": { format: formatMarketEntryFaq },
  "market-experimentation": { format: formatMarketExperimentationFaq },
  "localisation-cli-and-api": { format: formatLocalisationCliAndApiFaq },
  "localisation-for-ai-coding-agents": { format: formatLocalisationForAiCodingAgentsFaq },
};

function formatBundle(slug: UseCaseFaqSlug, locale: string): FormattedFaq {
  const intl = getIntlShape(locale);
  const bundle = useCaseFaqBySlug[slug];

  if ("format" in bundle) {
    return bundle.format(intl);
  }

  return {
    heading: intl.formatMessage(bundle.copy.heading),
    subheading: intl.formatMessage(bundle.copy.subheading),
    items: bundle.items.map((descriptor) => ({
      question: intl.formatMessage(descriptor.question),
      answer: intl.formatMessage(descriptor.answer),
    })),
  };
}

export function getUseCaseFaqItems(slug: UseCaseFaqSlug, locale: string): HomepageFaqItem[] {
  return formatBundle(slug, locale).items;
}

export function getUseCaseFaqSectionCopy(
  slug: UseCaseFaqSlug,
  locale: string,
): { heading: string; subheading: string } {
  const { heading, subheading } = formatBundle(slug, locale);
  return { heading, subheading };
}
