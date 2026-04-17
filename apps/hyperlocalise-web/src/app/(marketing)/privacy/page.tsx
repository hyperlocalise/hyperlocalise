import { createLegalMetadata, LegalList, LegalPage, LegalSection } from "../_components/legal-page";

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
      <p>
        This page describes the default privacy posture for Hyperlocalise documentation and product
        surfaces.
      </p>

      <LegalSection title="Scope">
        <p>
          This policy applies to Hyperlocalise websites, documentation, hosted services, and related
          support workflows that link to it.
        </p>
      </LegalSection>

      <LegalSection title="Information we collect">
        <p>We may collect:</p>
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
        <p>We use information to:</p>
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
        <p>
          Hyperlocalise may process source strings, translated content, prompts, model outputs, and
          localization metadata that you submit through the product.
        </p>
        <p>
          When you connect third-party AI providers, translation platforms, storage systems, or
          other integrations, your data may be sent to those services based on your configuration.
          Their handling of that data is governed by their own terms and privacy policies.
        </p>
      </LegalSection>

      <LegalSection title="Legal bases for processing">
        <p>
          When required by applicable law, we process personal data under one or more of these legal
          bases:
        </p>
        <LegalList>
          <li>to perform our contract with you,</li>
          <li>to comply with legal obligations,</li>
          <li>for our legitimate interests in operating and securing the service,</li>
          <li>with your consent where consent is required.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Data retention">
        <p>
          We retain personal data only for as long as needed to provide the service, meet legal or
          financial recordkeeping obligations, resolve disputes, and enforce agreements. Retention
          periods may vary by data type and account status.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          We use reasonable technical and organizational measures to protect personal data. No
          method of transmission or storage is completely secure, so we cannot guarantee absolute
          security.
        </p>
      </LegalSection>

      <LegalSection title="International transfers">
        <p>
          Your information may be processed in countries other than your own. Where required, we use
          appropriate safeguards for cross-border data transfers.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>Depending on your location, you may have rights to:</p>
        <LegalList>
          <li>access the personal data we hold about you,</li>
          <li>correct inaccurate or incomplete data,</li>
          <li>delete your personal data,</li>
          <li>restrict or object to certain processing,</li>
          <li>receive a portable copy of your data,</li>
          <li>withdraw consent where processing is based on consent.</li>
        </LegalList>
        <p>To exercise these rights, contact us using the details below.</p>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          Hyperlocalise is not directed to children under 13, or a higher age threshold where
          required by local law. We do not knowingly collect personal data from children.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>
          We may update this policy from time to time. If we make material changes, we will update
          the effective date and take reasonable steps to notify you when required.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          For privacy questions or requests, contact: <code>privacy@hyperlocalise.com</code>
        </p>
        <p>
          Effective date: <code>2026-04-17</code>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
