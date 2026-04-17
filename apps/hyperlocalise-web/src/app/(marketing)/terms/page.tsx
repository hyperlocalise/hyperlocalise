import { createLegalMetadata, LegalList, LegalPage, LegalSection } from "../_components/legal-page";

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
      <p>
        This page is a starting point for Hyperlocalise terms of service. Review it with legal
        counsel before publishing it as binding legal terms.
      </p>

      <LegalSection title="Acceptance of terms">
        <p>
          By accessing or using Hyperlocalise websites, documentation, APIs, CLI tools, and hosted
          services, you agree to these Terms of Service.
        </p>
        <p>
          If you use Hyperlocalise on behalf of an organization, you represent that you have
          authority to bind that organization to these terms.
        </p>
      </LegalSection>

      <LegalSection title="Eligibility and accounts">
        <p>
          You must be legally able to enter into a binding agreement to use the service. You are
          responsible for:
        </p>
        <LegalList>
          <li>providing accurate account information,</li>
          <li>maintaining the security of your credentials,</li>
          <li>all activity that occurs under your account.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Use of the service">
        <p>
          You may use Hyperlocalise only in compliance with applicable laws and these terms. You may
          not:
        </p>
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
        <p>
          You retain ownership of the content, configuration, and materials you submit to
          Hyperlocalise.
        </p>
        <p>
          You grant us a limited license to host, process, transmit, and display that content only
          as needed to operate, secure, support, and improve the service.
        </p>
        <p>
          You are responsible for ensuring that you have all necessary rights, consents, and
          permissions for the content you submit and for any third-party services you connect.
        </p>
      </LegalSection>

      <LegalSection title="Third-party services">
        <p>
          Hyperlocalise may interoperate with third-party model providers, translation platforms,
          storage systems, billing processors, and other external services.
        </p>
        <p>
          Your use of those services is governed by their own terms, pricing, and policies. We are
          not responsible for third-party services or for outages, changes, or data handling
          performed by them.
        </p>
      </LegalSection>

      <LegalSection title="Fees and payment">
        <p>
          If you purchase a paid plan, you agree to pay applicable fees, taxes, and charges
          associated with your subscription or usage.
        </p>
        <p>Unless otherwise stated:</p>
        <LegalList>
          <li>fees are non-refundable,</li>
          <li>subscriptions renew automatically until canceled,</li>
          <li>we may change pricing with prior notice for future billing periods.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Availability and changes">
        <p>
          We may modify, suspend, or discontinue part of the service from time to time. We may also
          update features, limits, and technical requirements as the product evolves.
        </p>
      </LegalSection>

      <LegalSection title="Termination">
        <p>
          You may stop using the service at any time. We may suspend or terminate access if you
          violate these terms, create risk for the service or other users, or if we are required to
          do so by law.
        </p>
        <p>
          Sections that by their nature should survive termination will survive, including
          ownership, payment obligations, disclaimers, limitations of liability, and dispute
          provisions.
        </p>
      </LegalSection>

      <LegalSection title="Disclaimers">
        <p>
          Hyperlocalise is provided on an "as is" and "as available" basis to the maximum extent
          permitted by law. We disclaim all warranties, express or implied, including warranties of
          merchantability, fitness for a particular purpose, and non-infringement.
        </p>
        <p>
          AI-generated output and synced content may contain errors, omissions, bias, or unsupported
          translations. You are responsible for review and approval before production use.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <p>
          To the maximum extent permitted by law, Hyperlocalise and its affiliates, officers,
          employees, and suppliers will not be liable for indirect, incidental, special,
          consequential, exemplary, or punitive damages, or for lost profits, revenues, goodwill,
          data, or business opportunities.
        </p>
        <p>
          Our aggregate liability for claims arising out of or related to the service will not
          exceed the greater of the amount you paid us in the 12 months before the claim arose or{" "}
          <code>100 USD</code>.
        </p>
      </LegalSection>

      <LegalSection title="Indemnification">
        <p>
          You agree to indemnify and hold harmless Hyperlocalise from claims, liabilities, damages,
          losses, and expenses arising from your content, your use of the service, or your violation
          of these terms or applicable law.
        </p>
      </LegalSection>

      <LegalSection title="Governing law">
        <p>
          These terms are governed by the laws of the jurisdiction where the service operator is
          established, excluding conflict of law rules. Update this section with the correct
          governing law and dispute venue before publishing.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          We may update these terms from time to time. If we make material changes, we will update
          the effective date and take reasonable steps to notify you when required.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          For legal questions about these terms, contact: <code>legal@hyperlocalise.com</code>
        </p>
        <p>
          Effective date: <code>2026-04-17</code>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
