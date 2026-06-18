import type { Metadata } from "next";
import { ArrowRightIcon, CheckCircle2Icon, MailIcon } from "lucide-react";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { Button } from "@/components/ui/button";
import { TypographyH1, TypographyH2, TypographyH3, TypographyP } from "@/components/ui/typography";

export const metadata: Metadata = {
  title: "Trust Center",
  description:
    "Security, subprocessor, privacy, and certification status information for Hyperlocalise.",
  openGraph: {
    title: "Hyperlocalise Trust Center",
    description:
      "Security, subprocessor, privacy, and certification status information for Hyperlocalise.",
    type: "website",
  },
};

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

export default function TrustCenterPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl">
        <section className="grid gap-10 px-5 pb-16 pt-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-10 lg:pb-20 lg:pt-16">
          <div className="max-w-4xl space-y-7">
            <div className="w-fit rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
              Work in progress
            </div>
            <div className="space-y-5">
              <TypographyH1 className="max-w-3xl text-4xl leading-[1.02] sm:text-5xl md:text-6xl">
                Trust Center
              </TypographyH1>
              <TypographyP className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                A practical view of how Hyperlocalise handles security, subprocessors, and
                certification work while the formal trust program matures.
              </TypographyP>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                className="gap-2"
                render={<a href="mailto:security@hyperlocalise.com" />}
              >
                <MailIcon data-icon="inline-start" />
                Contact us
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="gap-2"
                render={<a href="#subprocessors" />}
              >
                View subprocessors
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </div>
          </div>

          <aside className="h-fit rounded-lg border border-border bg-muted/25 p-5">
            <div className="text-sm font-medium text-muted-foreground">Current posture</div>
            <dl className="mt-5 space-y-4">
              {certificationStatuses.map((item) => (
                <div
                  key={item.name}
                  className="flex items-start justify-between gap-4 border-t border-border/70 pt-4 first:border-t-0 first:pt-0"
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

        <section className="border-t border-border/70 px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
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
          className="border-t border-border/70 px-5 py-16 scroll-mt-24 sm:px-8 lg:px-10 lg:py-20"
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
                    <th className="px-4 py-3">Subprocessor</th>
                    <th className="px-4 py-3">Purpose</th>
                    <th className="px-4 py-3">Data processed</th>
                    <th className="px-4 py-3">Primary processing location</th>
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

        <section className="border-t border-border/70 px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
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

        <section className="border-t border-border/70 px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
            <SectionHeader
              eyebrow="Data handling"
              title="Customer-controlled integrations"
              description="Hyperlocalise processes customer content to run localization workflows and connected automations."
            />
            <div className="space-y-5 text-base leading-7 text-muted-foreground">
              <TypographyP>
                Source strings, translations, context, prompts, model outputs, and provider metadata
                may be processed when those workflows are enabled by the customer.
              </TypographyP>
              <TypographyP>
                AI providers, translation management systems, repositories, and chat platforms are
                not treated as default platform subprocessors here because customers choose whether
                to connect them and which accounts or projects are in scope.
              </TypographyP>
            </div>
          </div>
        </section>

        <section className="border-t border-border/70 px-5 py-16 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-5 rounded-lg border border-border bg-muted/25 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <TypographyH2 className="pb-0 text-2xl tracking-[-0.02em] md:text-3xl">
                Need security details for a review?
              </TypographyH2>
              <TypographyP className="mt-2 text-muted-foreground">
                Contact us for current security information, vendor review questions, or
                certification roadmap details.
              </TypographyP>
            </div>
            <Button
              size="lg"
              className="gap-2"
              render={<a href="mailto:security@hyperlocalise.com" />}
            >
              <MailIcon data-icon="inline-start" />
              Contact us
            </Button>
          </div>
        </section>

        <section className="border-t border-border/70">
          <div className="px-5 py-16 sm:px-8 lg:px-10">
            <MarketingFooter columns={footerColumns} />
          </div>
        </section>
      </div>
    </div>
  );
}
