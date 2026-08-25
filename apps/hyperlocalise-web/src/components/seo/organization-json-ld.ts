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
import type { Organization, WithContext } from "schema-dts";

export const organizationJsonLd: WithContext<Organization> = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://www.hyperlocalise.com/#organization",
  name: "Hyperlocalise",
  url: "https://www.hyperlocalise.com",
  logo: {
    "@type": "ImageObject",
    url: "https://www.hyperlocalise.com/images/logo.png",
  },
  description:
    "Agentic localisation platform that connects product change signals, AI translation, human review, and release workflows.",
  foundingDate: "2026",
  founders: [
    {
      "@type": "Person",
      name: "Minh Cung",
      sameAs: "https://www.linkedin.com/in/minhcung/",
    },
    {
      "@type": "Person",
      name: "Hans Bui",
      sameAs: "https://www.linkedin.com/in/hansbui/",
    },
  ],
  sameAs: ["https://www.linkedin.com/company/hyperlocalise/"],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "sales",
    email: "minh@hyperlocalise.com",
  },
};
