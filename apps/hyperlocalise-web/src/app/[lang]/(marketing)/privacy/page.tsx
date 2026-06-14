import { createLegalMetadata, LegalList, LegalPage, LegalSection } from "../_components/legal-page";
import { TypographyP } from "@/components/ui/typography";

export const metadata = createLegalMetadata({
  title: "Privacy policy",
  description: "How Hyperlocalise handles account, usage, and provider-related data.",
});

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy policy"
      description="How Hyperlocalise handles account, usage, and provider-related data."
    >
      <TypographyP>
        This page describes the default privacy posture for Hyperlocalise documentation and product
        surfaces.
      </TypographyP>

      <LegalSection title="Scope">
        <TypographyP>
          This policy applies to Hyperlocalise websites, documentation, hosted services, and related
          support workflows that link to it.
        </TypographyP>
      </LegalSection>

      <LegalSection title="Information we collect">
        <TypographyP>We may collect:</TypographyP>
        <LegalList>
          <li>
            account and contact details such as your name, email address, company name, and billing
            details,
          </li>
          <li>
            workspace and configuration metadata such as project names, locale settings, provider
            selections, and integration settings,
          </li>
          <li>
            usage and diagnostic data such as command usage, page views, request timestamps, device
            information, IP address, and error logs,
          </li>
          <li>
            support information such as messages, attachments, and troubleshooting details you send
            to us,
          </li>
          <li>payment and subscription records processed by our billing providers.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="How we use information">
        <TypographyP>We use information to:</TypographyP>
        <LegalList>
          <li>provide, secure, and maintain Hyperlocalise,</li>
          <li>authenticate users and manage subscriptions,</li>
          <li>operate localization workflows and connected integrations,</li>
          <li>monitor reliability, prevent abuse, and debug failures,</li>
          <li>improve product features, documentation, and support,</li>
          <li>comply with legal obligations and enforce our agreements.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Customer content and third-party providers">
        <TypographyP>
          Hyperlocalise may process source strings, translated content, prompts, model outputs, and
          localization metadata that you submit through the product.
        </TypographyP>
        <TypographyP>
          When you connect third-party AI providers, translation platforms, storage systems, or
          other integrations, your data may be sent to those services based on your configuration.
          Their handling of that data is governed by their own terms and privacy policies.
        </TypographyP>
      </LegalSection>

      <LegalSection title="Legal bases for processing">
        <TypographyP>
          When required by applicable law, we process personal data under one or more of these legal
          bases:
        </TypographyP>
        <LegalList>
          <li>to perform our contract with you,</li>
          <li>to comply with legal obligations,</li>
          <li>for our legitimate interests in operating and securing the service,</li>
          <li>with your consent where consent is required.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Data retention">
        <TypographyP>
          We retain personal data only for as long as needed to provide the service, meet legal or
          financial recordkeeping obligations, resolve disputes, and enforce agreements. Retention
          periods may vary by data type and account status.
        </TypographyP>
      </LegalSection>

      <LegalSection title="Security">
        <TypographyP>
          We use reasonable technical and organizational measures to protect personal data. No
          method of transmission or storage is completely secure, so we cannot guarantee absolute
          security.
        </TypographyP>
      </LegalSection>

      <LegalSection title="International transfers">
        <TypographyP>
          Your information may be processed in countries other than your own. Where required, we use
          appropriate safeguards for cross-border data transfers.
        </TypographyP>
      </LegalSection>

      <LegalSection title="Your rights">
        <TypographyP>Depending on your location, you may have rights to:</TypographyP>
        <LegalList>
          <li>access the personal data we hold about you,</li>
          <li>correct inaccurate or incomplete data,</li>
          <li>delete your personal data,</li>
          <li>restrict or object to certain processing,</li>
          <li>receive a portable copy of your data,</li>
          <li>withdraw consent where processing is based on consent.</li>
        </LegalList>
        <TypographyP>To exercise these rights, contact us using the details below.</TypographyP>
      </LegalSection>

      <LegalSection title="Children">
        <TypographyP>
          Hyperlocalise is not directed to children under 13, or a higher age threshold where
          required by local law. We do not knowingly collect personal data from children.
        </TypographyP>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <TypographyP>
          We may update this policy from time to time. If we make material changes, we will update
          the effective date and take reasonable steps to notify you when required.
        </TypographyP>
      </LegalSection>

      <LegalSection title="Contact">
        <TypographyP>
          For privacy questions or requests, contact: <code>privacy@hyperlocalise.com</code>
        </TypographyP>
        <TypographyP>
          Effective date: <code>2026-04-17</code>
        </TypographyP>
      </LegalSection>
    </LegalPage>
  );
}
