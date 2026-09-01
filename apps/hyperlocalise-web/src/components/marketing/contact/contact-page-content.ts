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
import { SUPPORT_EMAIL } from "@/lib/support-contact";

export const supportEmailMailto = `mailto:${SUPPORT_EMAIL}`;

export function getContactPageCopy(locale: string) {
  const intl = getIntlShape(locale);

  return {
    headline: intl.formatMessage({
      defaultMessage: "Talk with the Hyperlocalise team",
      id: "40cE/etX60",
      description: "Primary headline on the marketing contact page",
    }),
    subcopy: intl.formatMessage({
      defaultMessage:
        "Questions about localisation, pricing, or your account? Email us and we will reply within one business day.",
      id: "6pa9eyshGx",
      description: "Supporting copy under the contact page headline",
    }),
    emailCta: intl.formatMessage({
      defaultMessage: "Email support",
      id: "CqB7r5Lcsl",
      description: "Primary button that opens the support email on the contact page",
    }),
  };
}
