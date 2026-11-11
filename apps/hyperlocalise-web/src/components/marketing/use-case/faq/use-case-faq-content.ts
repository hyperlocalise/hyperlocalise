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
import {
  productLocalisationFaqCopy,
  productLocalisationFaqItems,
} from "./product-localisation-faq";
import type {
  UseCaseFaqDescriptor,
  UseCaseFaqSectionCopy,
  UseCaseFaqSlug,
} from "./use-case-faq-types";

type UseCaseFaqBundle = {
  copy: UseCaseFaqSectionCopy;
  items: UseCaseFaqDescriptor[];
};

const useCaseFaqBySlug: Record<UseCaseFaqSlug, UseCaseFaqBundle> = {
  "product-localisation": {
    copy: productLocalisationFaqCopy,
    items: productLocalisationFaqItems,
  },
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
};

function formatFaqItems(locale: string, descriptors: UseCaseFaqDescriptor[]): HomepageFaqItem[] {
  const intl = getIntlShape(locale);

  return descriptors.map((descriptor) => ({
    question: intl.formatMessage(descriptor.question),
    answer: intl.formatMessage(descriptor.answer),
  }));
}

export function getUseCaseFaqItems(slug: UseCaseFaqSlug, locale: string): HomepageFaqItem[] {
  const bundle = useCaseFaqBySlug[slug];
  return formatFaqItems(locale, bundle.items);
}

export function getUseCaseFaqSectionCopy(
  slug: UseCaseFaqSlug,
  locale: string,
): { heading: string; subheading: string } {
  const intl = getIntlShape(locale);
  const { copy } = useCaseFaqBySlug[slug];

  return {
    heading: intl.formatMessage(copy.heading),
    subheading: intl.formatMessage(copy.subheading),
  };
}
