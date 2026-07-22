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
import type { Metadata } from "next";
import { ArrowRightIcon, CheckCircle2Icon, MailIcon } from "lucide-react";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { Button } from "@/components/ui/button";
import { TypographyH1, TypographyH2, TypographyH3, TypographyP } from "@/components/ui/typography";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/app-i18n/locales";
import { getLocalizedAlternates } from "@/lib/seo/localized-alternates";

type TrustCenterPageProps = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: TrustCenterPageProps): Promise<Metadata> {
  const { lang } = await params;
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  const description =
    "Security, subprocessor, privacy, and certification status information for Hyperlocalise.";

  return {
    title: "Trust Center",
    description,
    alternates: getLocalizedAlternates({ locale, path: "/trust-center" }),
    openGraph: {
      title: "Hyperlocalise Trust Center",
      description,
      type: "website",
    },
  };
}

const securityPractices = [
  {
    title: "Data protection",
    status: "Active",
    description:
      "Provider credentials are encrypted at rest, access is scoped by organization, and customer content is handled only to provide the configured product workflow.",
  },
  {
    title: "Access controls",
    status: "Active",
    description:
      "Authentication and organization membership checks gate access before workspace data or connected provider resources are available.",
  },
  {
    title: "Vendor review",
    status: "In progress",
    description:
      "We are documenting operating controls, subprocessors, and evidence needed for security reviews as the product matures.",
  },
] as const;

const certificationStatuses = [
  {
    name: "SOC 2",
    status: "Security program in progress",
  },
  {
    name: "ISO 27001",
    status: "Under consideration",
  },
  {
    name: "Penetration testing",
    status: "Planned",
  },
  {
    name: "Security questionnaire",
    status: "Available on request",
  },
] as const;

const contactEmail = "minh@hyperlocalise.com";

const subprocessors = [
  {
    name: "Vercel",
    purpose: "Application hosting, serverless compute, workflow execution, and file storage",
    data: "Application data, uploaded files, logs, and operational metadata",
    location: "Global infrastructure",
  },
  {
    name: "PlanetScale",
    purpose: "Managed PostgreSQL database hosting and persistent data storage",
    data: "Account, organization, project, localization workflow, and application metadata stored in the platform database",
    location: "United States",
  },
  {
    name: "WorkOS",
    purpose: "Authentication, session management, and organization membership",
    data: "Account identity, organization membership, and session metadata",
    location: "United States",
  },
  {
    name: "Resend",
    purpose: "Transactional email and email-based product workflows",
    data: "Email addresses, message metadata, and email content sent through configured workflows",
    location: "United States",
  },
  {
    name: "Autumn",
    purpose: "Billing, subscription, and usage orchestration",
    data: "Account, subscription, entitlement, and usage metadata",
    location: "United States",
  },
  {
    name: "OpenAI",
    purpose: "AI-assisted translation, review, and localization workflow support",
    data: "Customer content, prompts, context, and model outputs processed for enabled AI features",
    location: "United States",
  },
] as const;

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-3xl space-y-3">
      <div className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">{eyebrow}</div>
      <TypographyH2 className="pb-0 text-3xl leading-tight tracking-[-0.03em] sm:text-4xl md:text-4xl">
        {title}
      </TypographyH2>
      <TypographyP className="text-base text-muted-foreground sm:text-lg">
        {description}
      </TypographyP>
    </div>
  );
}

export default async function TrustCenterPage({ params }: TrustCenterPageProps) {
  const { lang } = await params;
  const locale = normalizeAppLocale(lang) ?? DEFAULT_APP_LOCALE;
  const intl = getIntlShape(locale);

  const workInProgress = intl.formatMessage({
    defaultMessage: "Work in progress",
    id: "jUpgPN4uQt",
    description: "Badge above the Trust Center page heading",
  });
  const pageTitle = intl.formatMessage({
    defaultMessage: "Trust Center",
    id: "Bu38XaIdLK",
    description: "Trust Center page heading",
  });
  const pageLead = intl.formatMessage({
    defaultMessage:
      "A practical view of how Hyperlocalise handles security, subprocessors, and certification work while the formal trust program matures.",
    id: "N8kCP/hYym",
    description: "Lead paragraph under the Trust Center page heading",
  });
  const operatorLine = intl.formatMessage({
    defaultMessage:
      "Hyperlocalise is operated by Hyperlocalise Pty Ltd, ACN 698 557 667, ABN 87698557667.",
    id: "GwjIMiu8Y+",
    description: "Legal operator line on the Trust Center page",
  });
  const contactUs = intl.formatMessage({
    defaultMessage: "Contact us",
    id: "ay4rw6IQUl",
    description: "Contact button label on the Trust Center page",
  });
  const viewSubprocessors = intl.formatMessage({
    defaultMessage: "View subprocessors",
    id: "vny7NGboKv",
    description: "Button that scrolls to the subprocessors section on the Trust Center page",
  });
  const currentPosture = intl.formatMessage({
    defaultMessage: "Current posture",
    id: "oX8prUs9FO",
    description: "Aside heading for current certification posture on the Trust Center page",
  });
  const columnSubprocessor = intl.formatMessage({
    defaultMessage: "Subprocessor",
    id: "O5xNL1bDk3",
    description: "Subprocessors table column header for vendor name",
  });
  const columnPurpose = intl.formatMessage({
    defaultMessage: "Purpose",
    id: "q4SZlpG/03",
    description: "Subprocessors table column header for vendor purpose",
  });
  const columnDataProcessed = intl.formatMessage({
    defaultMessage: "Data processed",
    id: "qd3kyaecwA",
    description: "Subprocessors table column header for data categories",
  });
  const columnLocation = intl.formatMessage({
    defaultMessage: "Primary processing location",
    id: "7VKhjntXa1",
    description: "Subprocessors table column header for processing location",
  });
  const dataHandlingParagraph1 = intl.formatMessage({
    defaultMessage:
      "Source strings, translations, context, prompts, model outputs, and provider metadata may be processed when those workflows are enabled by the customer.",
    id: "/z2t2MxSK2",
    description: "First data-handling paragraph on the Trust Center page",
  });
  const dataHandlingParagraph2 = intl.formatMessage({
    defaultMessage:
      "AI providers, translation management systems, repositories, and chat platforms are not treated as default platform subprocessors here because customers choose whether to connect them and which accounts or projects are in scope.",
    id: "g0n4i124EY",
    description: "Second data-handling paragraph on the Trust Center page",
  });
  const dataHandlingContact = intl.formatMessage(
    {
      defaultMessage: "For data processing agreement requests, contact: {email}",
      id: "fPUMESAd94",
      description: "Contact line for data processing agreement requests on the Trust Center page",
    },
    {
      email: contactEmail,
    },
  );
  const ctaTitle = intl.formatMessage({
    defaultMessage: "Need security details for a review?",
    id: "jUEW9KB993",
    description: "Call-to-action heading at the bottom of the Trust Center page",
  });
  const ctaDescription = intl.formatMessage({
    defaultMessage:
      "Contact us for current security information, vendor review questions, or certification roadmap details, including data processing agreement requests.",
    id: "w+fJWojETe",
    description: "Call-to-action description at the bottom of the Trust Center page",
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl">
        <section className="grid gap-10 px-5 pb-16 pt-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-10 lg:pb-20 lg:pt-16">
          <div className="max-w-4xl space-y-7">
            <div className="w-fit rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
              {workInProgress}
            </div>
            <div className="space-y-5">
              <TypographyH1 className="max-w-3xl text-4xl leading-[1.02] sm:text-5xl md:text-6xl">
                {pageTitle}
              </TypographyH1>
              <TypographyP className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                {pageLead}
              </TypographyP>
              <TypographyP className="max-w-2xl text-base leading-7 text-muted-foreground">
                {operatorLine}
              </TypographyP>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="gap-2" render={<a href={`mailto:${contactEmail}`} />}>
                <MailIcon data-icon="inline-start" />
                {contactUs}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="gap-2"
                render={<a href="#subprocessors" />}
              >
                {viewSubprocessors}
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </div>
          </div>

          <aside className="h-fit rounded-lg border border-border bg-muted/25 p-5">
            <div className="text-sm font-medium text-muted-foreground">{currentPosture}</div>
            <dl className="mt-5 space-y-4">
              {certificationStatuses.map((item) => (
                <div
                  key={item.name}
                  className="flex items-start justify-between gap-4 border-t border-border pt-4 first:border-t-0 first:pt-0"
                >
                  <dt className="text-sm font-medium text-foreground">{item.name}</dt>
                  <dd className="max-w-40 text-right text-sm text-muted-foreground">
                    {item.status}
                  </dd>
                </div>
              ))}
            </dl>
          </aside>
        </section>

        <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
          <SectionHeader
            eyebrow="Security"
            title="Built for controlled localization workflows"
            description="Hyperlocalise is designed around scoped access, encrypted credentials, and explicit provider connections rather than broad default access to customer systems."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {securityPractices.map((practice) => (
              <article
                key={practice.title}
                className="rounded-lg border border-border bg-background p-5"
              >
                <div className="flex items-center justify-between gap-4">
                  <TypographyH3 className="text-base tracking-normal md:text-lg">
                    {practice.title}
                  </TypographyH3>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    {practice.status}
                  </span>
                </div>
                <TypographyP className="mt-4 text-sm leading-6 text-muted-foreground">
                  {practice.description}
                </TypographyP>
              </article>
            ))}
          </div>
        </section>

        <section
          id="subprocessors"
          className="border-t border-border px-5 py-16 scroll-mt-24 sm:px-8 lg:px-10 lg:py-20"
        >
          <SectionHeader
            eyebrow="Subprocessors"
            title="Core vendors used to operate Hyperlocalise"
            description="This lite list covers platform-operated subprocessors. Customer-configured AI providers, translation management systems, repositories, and chat tools are used only when a customer connects them."
          />
          <div className="mt-10 overflow-hidden rounded-lg border border-border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead className="bg-muted/50 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3">{columnSubprocessor}</th>
                    <th className="px-4 py-3">{columnPurpose}</th>
                    <th className="px-4 py-3">{columnDataProcessed}</th>
                    <th className="px-4 py-3">{columnLocation}</th>
                  </tr>
                </thead>
                <tbody>
                  {subprocessors.map((subprocessor) => (
                    <tr key={subprocessor.name} className="border-t border-border">
                      <th className="px-4 py-4 align-top font-medium text-foreground">
                        {subprocessor.name}
                      </th>
                      <td className="px-4 py-4 align-top text-muted-foreground">
                        {subprocessor.purpose}
                      </td>
                      <td className="px-4 py-4 align-top text-muted-foreground">
                        {subprocessor.data}
                      </td>
                      <td className="px-4 py-4 align-top text-muted-foreground">
                        {subprocessor.location}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <SectionHeader
              eyebrow="Certification"
              title="Formal security work is underway"
              description="We are building toward a formal security program, including SOC 2 readiness work. Certifications and independent assessments will be published here as they become available."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {certificationStatuses.map((item) => (
                <div key={item.name} className="rounded-lg border border-border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <CheckCircle2Icon className="size-4 text-primary" aria-hidden="true" />
                    {item.name}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">{item.status}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
            <SectionHeader
              eyebrow="Data handling"
              title="Customer-controlled integrations"
              description="Hyperlocalise processes customer content to run localization workflows and connected automations."
            />
            <div className="space-y-5 text-base leading-7 text-muted-foreground">
              <TypographyP>{dataHandlingParagraph1}</TypographyP>
              <TypographyP>{dataHandlingParagraph2}</TypographyP>
              <TypographyP>{dataHandlingContact}</TypographyP>
            </div>
          </div>
        </section>

        <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-5 rounded-lg border border-border bg-muted/25 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <TypographyH2 className="pb-0 text-2xl tracking-[-0.02em] md:text-3xl">
                {ctaTitle}
              </TypographyH2>
              <TypographyP className="mt-2 text-muted-foreground">{ctaDescription}</TypographyP>
            </div>
            <Button size="lg" className="gap-2" render={<a href={`mailto:${contactEmail}`} />}>
              <MailIcon data-icon="inline-start" />
              {contactUs}
            </Button>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="px-5 py-16 sm:px-8 lg:px-10">
            <MarketingFooter columns={footerColumns} />
          </div>
        </section>
      </div>
    </div>
  );
}
