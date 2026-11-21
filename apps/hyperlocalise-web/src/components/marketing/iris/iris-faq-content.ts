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

// Inline descriptors so the Iris route (a Server Component) can build these.
export function getIrisFaqItems(locale: string): HomepageFaqItem[] {
  const intl = getIntlShape(locale);

  return [
    {
      question: intl.formatMessage({
        defaultMessage: "Is Iris free?",
        id: "HCPJpu/Mvc",
        description: "Iris page FAQ question about price",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Iris is free to download and install. Generating images, video and audio uses AI credit, which paid plans include from $20 a month. The pricing page lists the rate for every model.",
        id: "v8/Eb3C3P6",
        description: "Iris page FAQ answer about price",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "Which Macs can run Iris?",
        id: "tgqxU3MqpJ",
        description: "Iris page FAQ question about supported Macs",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Iris has builds for Apple Silicon Macs (M1 and later) and Intel Macs. The main download button gives you the Apple Silicon build. Use the menu beside it for the Intel build.",
        id: "TVKMlRSdJ5",
        description: "Iris page FAQ answer about supported Macs",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "Is there a Windows or Linux version?",
        id: "xXdEvsjNEO",
        description: "Iris page FAQ question about Windows and Linux support",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Not yet. Iris is Mac only for now. You can still localise text, websites and apps in the Hyperlocalise web app from any browser.",
        id: "1RKEAnbFH/",
        description: "Iris page FAQ answer about Windows and Linux support",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "Which AI models does Iris use?",
        id: "CbqHZiFcRJ",
        description: "Iris page FAQ question about the AI models behind Iris",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Iris runs image, video, voice and audio models from several AI vendors. The pricing page lists every model Iris can run and what each one costs.",
        id: "kBpQcdptW3",
        description: "Iris page FAQ answer about the AI models behind Iris",
      }),
    },
    {
      question: intl.formatMessage({
        defaultMessage: "How do I install Iris?",
        id: "2JKySNAhyO",
        description: "Iris page FAQ question about installing the Mac app",
      }),
      answer: intl.formatMessage({
        defaultMessage:
          "Download the Iris file, open it from your Downloads folder, then drag Iris into Applications. Iris updates itself when a new version ships.",
        id: "++MP4qRhvG",
        description: "Iris page FAQ answer about installing the Mac app",
      }),
    },
  ];
}
