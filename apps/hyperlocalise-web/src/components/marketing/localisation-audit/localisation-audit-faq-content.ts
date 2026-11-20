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
import {
  buildHomepageFaqJsonLd,
  type HomepageFaqItem,
} from "@/components/marketing/homepage-faq-content";
import { LOCALISATION_AUDIT_USER_AGENT } from "@/lib/localisation-audit/user-agent";

import { getLocalisationAuditPageCopy } from "./localisation-audit-page-content";

export type LocalisationAuditFaqItem = HomepageFaqItem;

export function getLocalisationAuditFaqItems(locale: string): LocalisationAuditFaqItem[] {
  const copy = getLocalisationAuditPageCopy(locale);

  return [
    { question: copy.faqScopeQuestion, answer: copy.scopeNote },
    { question: copy.faqPublicQuestion, answer: copy.disclosure },
    {
      question: copy.faqBlockedQuestion,
      answer: `${copy.crawlAccessNoteBody} ${copy.crawlAccessNoteUserAgent}: ${LOCALISATION_AUDIT_USER_AGENT}`,
    },
    { question: copy.faqFindingQuestion, answer: copy.sampleFindingBody },
  ];
}

export const buildLocalisationAuditFaqJsonLd = buildHomepageFaqJsonLd;
