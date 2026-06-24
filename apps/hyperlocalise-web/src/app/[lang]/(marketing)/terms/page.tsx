import { createLegalMetadata, LegalList, LegalPage, LegalSection } from "../_components/legal-page";
import { TypographyP } from "@/components/ui/typography";

export const metadata = createLegalMetadata({
  title: "Terms of service",
  description: "The baseline terms that govern use of Hyperlocalise websites, docs, and services.",
});

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of service"
      description="The baseline terms that govern use of Hyperlocalise websites, docs, and services."
    >
      <TypographyP>
        These terms describe the baseline rules for using Hyperlocalise websites, documentation,
        APIs, CLI tools, and hosted services.
      </TypographyP>
      <TypographyP>
        Hyperlocalise is operated by Hyperlocalise Pty Ltd, ACN 698 557 667, ABN 87698557667.
      </TypographyP>

      <LegalSection title="Acceptance of terms">
        <TypographyP>
          By accessing or using Hyperlocalise websites, documentation, APIs, CLI tools, and hosted
          services, you agree to these Terms of Service.
        </TypographyP>
        <TypographyP>
          If you use Hyperlocalise on behalf of an organization, you represent that you have
          authority to bind that organization to these terms.
        </TypographyP>
      </LegalSection>

      <LegalSection title="Eligibility and accounts">
        <TypographyP>
          You must be legally able to enter into a binding agreement to use the service. You are
          responsible for:
        </TypographyP>
        <LegalList>
          <li>providing accurate account information,</li>
          <li>maintaining the security of your credentials,</li>
          <li>all activity that occurs under your account.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Use of the service">
        <TypographyP>
          You may use Hyperlocalise only in compliance with applicable laws and these terms. You may
          not:
        </TypographyP>
        <LegalList>
          <li>use the service to violate law or third-party rights,</li>
          <li>interfere with the security, stability, or availability of the service,</li>
          <li>attempt unauthorized access to systems, accounts, or data,</li>
          <li>
            reverse engineer or misuse non-public parts of the service except where law forbids
            restricting that right,
          </li>
          <li>use the service to process content you do not have the right to use.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Customer content">
        <TypographyP>
          You retain ownership of the content, configuration, and materials you submit to
          Hyperlocalise.
        </TypographyP>
        <TypographyP>
          You grant us a limited license to host, process, transmit, and display that content only
          as needed to operate, secure, support, and improve the service.
        </TypographyP>
        <TypographyP>
          You are responsible for ensuring that you have all necessary rights, consents, and
          permissions for the content you submit and for any third-party services you connect.
        </TypographyP>
      </LegalSection>

      <LegalSection title="Third-party services">
        <TypographyP>
          Hyperlocalise may interoperate with third-party model providers, translation platforms,
          storage systems, billing processors, and other external services.
        </TypographyP>
        <TypographyP>
          Your use of those services is governed by their own terms, pricing, and policies. We are
          not responsible for third-party services or for outages, changes, or data handling
          performed by them.
        </TypographyP>
      </LegalSection>

      <LegalSection title="Fees and payment">
        <TypographyP>
          If you purchase a paid plan, you agree to pay applicable fees, taxes, and charges
          associated with your subscription or usage.
        </TypographyP>
        <TypographyP>Unless otherwise stated:</TypographyP>
        <LegalList>
          <li>fees are non-refundable,</li>
          <li>subscriptions renew automatically until canceled,</li>
          <li>we may change pricing with prior notice for future billing periods.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Availability and changes">
        <TypographyP>
          We may modify, suspend, or discontinue part of the service from time to time. We may also
          update features, limits, and technical requirements as the product evolves.
        </TypographyP>
      </LegalSection>

      <LegalSection title="Termination">
        <TypographyP>
          You may stop using the service at any time. We may suspend or terminate access if you
          violate these terms, create risk for the service or other users, or if we are required to
          do so by law.
        </TypographyP>
        <TypographyP>
          Sections that by their nature should survive termination will survive, including
          ownership, payment obligations, disclaimers, limitations of liability, and dispute
          provisions.
        </TypographyP>
      </LegalSection>

      <LegalSection title="Disclaimers">
        <TypographyP>
          Hyperlocalise is provided on an "as is" and "as available" basis to the maximum extent
          permitted by law. We disclaim all warranties, express or implied, including warranties of
          merchantability, fitness for a particular purpose, and non-infringement.
        </TypographyP>
        <TypographyP>
          AI-generated output and synced content may contain errors, omissions, bias, or unsupported
          translations. You remain responsible for human review, compliance, and production use of
          any output or synced content.
        </TypographyP>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <TypographyP>
          To the maximum extent permitted by law, Hyperlocalise and its affiliates, officers,
          employees, and suppliers will not be liable for indirect, incidental, special,
          consequential, exemplary, or punitive damages, or for lost profits, revenues, goodwill,
          data, or business opportunities.
        </TypographyP>
        <TypographyP>
          Our aggregate liability for claims arising out of or related to the service will not
          exceed the greater of the amount you paid us in the 12 months before the claim arose or{" "}
          <strong>USD 100</strong>.
        </TypographyP>
      </LegalSection>

      <LegalSection title="Indemnification">
        <TypographyP>
          You agree to indemnify and hold harmless Hyperlocalise from claims, liabilities, damages,
          losses, and expenses arising from your content, your use of the service, or your violation
          of these terms or applicable law.
        </TypographyP>
      </LegalSection>

      <LegalSection title="Governing law">
        <TypographyP>
          These terms are governed by the laws of the jurisdiction where the service operator is
          established, excluding conflict of law rules.
        </TypographyP>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <TypographyP>
          We may update these terms from time to time. If we make material changes, we will update
          the effective date and take reasonable steps to notify you when required.
        </TypographyP>
      </LegalSection>

      <LegalSection title="Contact">
        <TypographyP>
          For legal questions about these terms, contact: <code>minh@hyperlocalise.com</code>
        </TypographyP>
        <TypographyP>
          For data processing agreement requests, contact: <code>minh@hyperlocalise.com</code>
        </TypographyP>
        <TypographyP>
          Effective date: <code>2026-04-17</code>
        </TypographyP>
      </LegalSection>
    </LegalPage>
  );
}
