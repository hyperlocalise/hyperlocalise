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
import Link from "next/link";

import { TypographyP } from "@/components/ui/typography";
import { SUPPORT_EMAIL } from "@/lib/support-contact";

import { LegalList, LegalSection } from "../_components/legal-page";

const PRIVACY_HREF = "/privacy";
const COMMON_PAPER_CSA_URL = "https://commonpaper.com/standards/cloud-service-agreement/2.1/";
const COMMON_PAPER_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";

/**
 * Online Cloud Service Agreement adapted from Common Paper CSA Standard Terms
 * Version 2.1 for Hyperlocalise Pty Ltd clickwrap / self-serve use.
 * Attribution: Common Paper CSA v2.1, CC BY 4.0.
 */
export function CloudServiceAgreement() {
  return (
    <>
      <TypographyP>
        These Cloud Service Agreement terms (“Agreement”) govern access to and use of Hyperlocalise
        websites, documentation, APIs, CLI tools, and hosted services (the “Cloud Service”).
      </TypographyP>
      <TypographyP>
        Provider is Hyperlocalise Pty Ltd, ACN 698 557 667, ABN 87698557667 (“Provider”, “we”,
        “us”). “Customer”, “you” means the individual or entity that accepts this Agreement. If you
        use the Product on behalf of an organization, you represent that you have authority to bind
        that organization, and “Customer” means that organization.
      </TypographyP>
      <TypographyP>
        By creating an account, completing checkout, signing an Order Form, or otherwise accessing
        or using the Product, Customer agrees to this Agreement. If Customer does not agree,
        Customer must not use the Product.
      </TypographyP>
      <TypographyP>
        This Agreement is adapted from the{" "}
        <a
          href={COMMON_PAPER_CSA_URL}
          className="underline underline-offset-4 hover:text-foreground"
          rel="noopener noreferrer"
          target="_blank"
        >
          Common Paper Cloud Service Agreement Standard Terms Version 2.1
        </a>
        , available under a{" "}
        <a
          href={COMMON_PAPER_LICENSE_URL}
          className="underline underline-offset-4 hover:text-foreground"
          rel="noopener noreferrer"
          target="_blank"
        >
          Creative Commons Attribution 4.0 International License
        </a>
        . Hyperlocalise is not affiliated with Common Paper.
      </TypographyP>

      <LegalSection title="Key Terms">
        <TypographyP>
          The following Key Terms apply to self-serve use and to any Order Form that does not state
          different values. Capitalized terms not defined in these Key Terms have the meanings in
          Section 13 (Definitions).
        </TypographyP>
        <LegalList>
          <li>
            <strong>Cloud Service:</strong> Hyperlocalise hosted localization platform, websites,
            APIs, cloud-connected CLI features, and related hosted offerings described in the
            Documentation or an Order Form.
          </li>
          <li>
            <strong>Governing Law:</strong> the laws of New South Wales, Australia, without regard
            to conflict of laws rules.
          </li>
          <li>
            <strong>Chosen Courts:</strong> the state and federal courts sitting in New South Wales,
            Australia.
          </li>
          <li>
            <strong>Notice Address:</strong> <code>{SUPPORT_EMAIL}</code> (or another address
            Provider designates in writing).
          </li>
          <li>
            <strong>Effective Date:</strong> the earlier of the date Customer first accepts this
            Agreement or first accesses or uses the Product.
          </li>
          <li>
            <strong>Order Date:</strong> for an Order Form, the date stated on the Order Form; for
            online checkout, the date Customer completes purchase.
          </li>
          <li>
            <strong>Subscription Period:</strong> the billing or subscription period selected at
            checkout or stated in an Order Form (for example monthly or annual). Free or trial
            access continues until Provider or Customer ends it.
          </li>
          <li>
            <strong>Non-Renewal Notice Date:</strong> the end of the then-current Subscription
            Period. Customer may cancel renewal in-product or by notice to the Notice Address before
            that date.
          </li>
          <li>
            <strong>Payment Process:</strong> automatic payment using the payment method on file
            through Provider’s billing processor, unless an Order Form specifies invoicing.
          </li>
          <li>
            <strong>Currency:</strong> the currency shown at checkout or in the Order Form. If none
            is stated, Australian Dollars (AUD).
          </li>
          <li>
            <strong>Technical Support:</strong> standard support via the Notice Address during
            Provider’s ordinary business hours, unless an Order Form describes different support.
          </li>
          <li>
            <strong>Use Limitations:</strong> plan limits, rate limits, seat limits, and other usage
            limits described in the Documentation, product UI, or Order Form.
          </li>
          <li>
            <strong>Additional Warranties:</strong> none.
          </li>
          <li>
            <strong>General Cap Amount:</strong> the greater of (a) the Fees Customer paid to
            Provider for the Product in the 12 months before the claim arose, or (b) AUD 150.
          </li>
          <li>
            <strong>Increased Cap Amount:</strong> three times the General Cap Amount.
          </li>
          <li>
            <strong>Increased Claims:</strong> breach of Section 10 (Confidentiality); and Provider
            Covered Claims under Section 9 (Indemnification).
          </li>
          <li>
            <strong>Unlimited Claims:</strong> Customer’s payment obligations; a party’s fraud or
            willful misconduct; and liability that cannot be limited or excluded under Applicable
            Laws (including non-excludable guarantees under the Australian Consumer Law, where it
            applies).
          </li>
          <li>
            <strong>Provider Covered Claims:</strong> third-party claims that the Product infringes
            or misappropriates the third party’s intellectual property rights.
          </li>
          <li>
            <strong>Customer Covered Claims:</strong> third-party claims arising from (a) Customer
            Content; (b) Customer’s or Users’ use of the Product; (c) Customer’s violation of this
            Agreement or Applicable Laws; or (d) Customer’s combination of the Product with items
            not provided by Provider (including Customer-configured third-party model providers and
            TMS platforms).
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="1. Service">
        <TypographyP>
          <strong>1.1 Access and Use.</strong> During the Subscription Period and subject to this
          Agreement, Customer may (a) access and use the Cloud Service; and (b) copy and use the
          included Software and Documentation only as needed to access and use the Cloud Service, in
          each case for its internal business purposes. If a Customer Affiliate enters a separate
          Order Form with Provider, that Affiliate creates a separate agreement with Provider, and
          Customer is not responsible for that Affiliate’s agreement.
        </TypographyP>
        <TypographyP>
          <strong>1.2 Support.</strong> During the Subscription Period, Provider will provide
          Technical Support as described in the Key Terms or Order Form.
        </TypographyP>
        <TypographyP>
          <strong>1.3 User Accounts.</strong> Customer is responsible for all actions on Users’
          accounts and for all Users’ compliance with this Agreement. Customer and Users must
          protect the confidentiality of their passwords and login credentials. Customer will
          promptly notify Provider if it suspects or knows of any fraudulent activity with its
          accounts, passwords, or credentials, or if they become compromised.
        </TypographyP>
        <TypographyP>
          <strong>1.4 Feedback and Usage Data.</strong> Customer may, but is not required to, give
          Provider Feedback, in which case Customer gives Feedback “AS IS”. Provider may use all
          Feedback freely without any restriction or obligation. Provider may collect and analyze
          Usage Data and may freely use Usage Data to maintain, improve, enhance, and promote
          Provider’s products and services without restriction or obligation. Provider may only
          disclose Usage Data to others if the Usage Data is aggregated and does not identify
          Customer or Users.
        </TypographyP>
        <TypographyP>
          <strong>1.5 Customer Content.</strong> Provider may copy, display, modify, and use
          Customer Content only as needed to provide, secure, support, and maintain the Product and
          related offerings. Customer retains all right, title, and interest in and to Customer
          Content, subject to the limited rights granted in this Agreement. Customer is responsible
          for the accuracy and content of Customer Content and for any third-party services Customer
          connects.
        </TypographyP>
        <TypographyP>
          <strong>1.6 Machine Learning.</strong> Usage Data and Customer Content may be used to
          develop, train, or enhance artificial intelligence or machine learning models that are
          part of Provider’s products and services, including third-party components of the Product,
          and Customer authorizes Provider to process its Usage Data and Customer Content for such
          purposes. However, (a) Usage Data and Customer Content must be aggregated before it can be
          used for these purposes, and (b) Provider will use commercially reasonable efforts
          consistent with industry standard technology to de-identify Usage Data and Customer
          Content before such use. Nothing in this section reduces Provider’s obligations regarding
          Personal Data under Applicable Data Protection Laws or a DPA. Due to the nature of
          artificial intelligence and machine learning, information generated by these features
          (including translations and localization suggestions) may be incorrect or inaccurate.
          Product features that include artificial intelligence or machine learning models are not
          human and are not a substitute for human oversight. Customer remains responsible for human
          review, compliance, and production use of any output or synced content.
        </TypographyP>
        <TypographyP>
          <strong>1.7 Third-Party Services.</strong> The Product may interoperate with third-party
          model providers, translation management systems, storage systems, billing processors, and
          other external services that Customer selects or connects. Customer’s use of those
          services is governed by their own terms, pricing, and policies. When Customer configures
          the Product to send Customer Content to a third-party service, that transmission is at
          Customer’s direction. Provider is not responsible for third-party services or for outages,
          changes, or data handling performed by them, except to the extent caused by Provider’s
          breach of this Agreement.
        </TypographyP>
      </LegalSection>

      <LegalSection title="2. Restrictions and obligations">
        <TypographyP>
          <strong>2.1 Restrictions on Customer.</strong> Except as expressly permitted by this
          Agreement, Customer will not (and will not allow anyone else to): (i) reverse engineer,
          decompile, or attempt to discover any source code or underlying ideas or algorithms of the
          Product (except to the extent Applicable Laws prohibit this restriction); (ii) provide,
          sell, transfer, sublicense, lend, distribute, rent, or otherwise allow others to access or
          use the Product (except Users under Customer’s account); (iii) remove any proprietary
          notices or labels; (iv) copy, modify, or create derivative works of the Product; (v)
          conduct security or vulnerability tests on, interfere with the operation of, cause
          performance degradation of, or circumvent access restrictions of the Product; (vi) access
          accounts, information, data, or portions of the Product to which Customer does not have
          explicit authorization; (vii) use the Product to develop a competing service or product;
          (viii) use the Product with any High Risk Activities or with any activity prohibited by
          Applicable Laws; (ix) use the Product to obtain unauthorized access to anyone else’s
          networks or equipment; or (x) upload, submit, or otherwise make available to the Product
          any Customer Content to which Customer and Users do not have the proper rights. Use of the
          Product must comply with all Documentation and Use Limitations.
        </TypographyP>
        <TypographyP>
          <strong>2.2 Suspension.</strong> If Customer (a) has an outstanding, undisputed balance on
          its account for more than 30 days; (b) breaches Section 2.1 (Restrictions on Customer); or
          (c) uses the Product in violation of the Agreement or in a way that materially and
          negatively impacts the Product or others, then Provider may temporarily suspend Customer’s
          access to the Product with or without notice. Provider will try to inform Customer before
          suspending Customer’s account when practical. Provider will reinstate Customer’s access
          only if Customer resolves the underlying issue.
        </TypographyP>
      </LegalSection>

      <LegalSection title="3. Privacy and security">
        <TypographyP>
          <strong>3.1 Personal Data.</strong> Provider’s handling of personal information is
          described in the{" "}
          <Link href={PRIVACY_HREF} className="underline underline-offset-4 hover:text-foreground">
            Privacy Policy
          </Link>
          . Before submitting Personal Data governed by GDPR (or UK GDPR) to the Product, Customer
          must enter into a data processing agreement with Provider. Request a DPA at{" "}
          <code>{SUPPORT_EMAIL}</code>. If the parties have a DPA, each party will comply with it;
          the DPA controls each party’s rights and obligations as to Personal Data and controls in
          the event of any conflict with this Agreement.
        </TypographyP>
        <TypographyP>
          <strong>3.2 Prohibited Data.</strong> Customer will not (and will not allow anyone else
          to) submit Prohibited Data to the Product unless authorized in writing by Provider (for
          example in an Order Form or DPA).
        </TypographyP>
      </LegalSection>

      <LegalSection title="4. Payment and taxes">
        <TypographyP>
          <strong>4.1 Fees.</strong> Unless checkout or an Order Form specifies a different
          currency, Fees are in the Currency stated in the Key Terms and are exclusive of taxes.
          Except for the prorated refund of prepaid Fees allowed with specific termination rights in
          this Agreement, Fees are non-refundable.
        </TypographyP>
        <TypographyP>
          <strong>4.2 Invoicing.</strong> For a Payment Process with invoicing, Provider will send
          invoices for usage-based Fees in arrears and for all other Fees in advance, according to
          the Payment Process.
        </TypographyP>
        <TypographyP>
          <strong>4.3 Automatic Payment.</strong> For a Payment Process with automatic payment,
          Provider will automatically charge the payment method on file for Fees according to the
          Payment Process, and Customer authorizes all such charges. Provider will make bills or
          transaction history available to Customer.
        </TypographyP>
        <TypographyP>
          <strong>4.4 Taxes.</strong> Customer is responsible for all duties, taxes, and levies that
          apply to Fees, including sales, use, VAT, GST, or withholding, that Provider itemizes and
          includes in an invoice or charge. Customer is not responsible for Provider’s income taxes.
        </TypographyP>
        <TypographyP>
          <strong>4.5 Payment.</strong> Customer will pay Fees and taxes in the applicable Currency
          according to the Payment Process. Subscriptions renew automatically for successive
          Subscription Periods unless canceled before the Non-Renewal Notice Date. Provider may
          change pricing for future Subscription Periods with prior notice.
        </TypographyP>
        <TypographyP>
          <strong>4.6 Payment Dispute.</strong> If Customer has a good-faith disagreement about Fees
          charged or invoiced, Customer must notify Provider about the dispute before payment is
          due, or within 30 days of an automatic payment, and must pay all undisputed amounts on
          time. The parties will work together to resolve the dispute within 15 days. If no
          resolution is agreed, each party may pursue any remedies available under the Agreement or
          Applicable Laws.
        </TypographyP>
      </LegalSection>

      <LegalSection title="5. Term and termination">
        <TypographyP>
          <strong>5.1 Order Form and Agreement.</strong> For each Order Form or online purchase, the
          Agreement starts on the Order Date, continues through the Subscription Period, and
          automatically renews for additional Subscription Periods unless one party gives notice of
          non-renewal before the Non-Renewal Notice Date (including in-product cancellation).
        </TypographyP>
        <TypographyP>
          <strong>5.2 Framework Terms.</strong> These Framework Terms start on the Effective Date
          and continue for the longer of one year or until all Order Forms and paid subscriptions
          governed by the Framework Terms have ended. Free or trial use ends when Provider or
          Customer terminates access.
        </TypographyP>
        <TypographyP>
          <strong>5.3 Termination.</strong> Either party may terminate the Framework Terms or an
          Order Form immediately: (a) if the other party fails to cure a material breach following
          30 days’ notice; or (b) upon notice if the other party (i) materially breaches in a manner
          that cannot be cured; (ii) dissolves or stops conducting business without a successor;
          (iii) makes an assignment for the benefit of creditors; or (iv) becomes the debtor in
          insolvency, receivership, or bankruptcy proceedings that continue for more than 60 days.
          Customer may stop using the Product and cancel a subscription at any time; cancellation
          takes effect at the end of the then-current Subscription Period unless otherwise stated at
          cancellation. Provider may terminate free or trial access at any time.
        </TypographyP>
        <TypographyP>
          <strong>5.4 Force Majeure.</strong> Either party may terminate an affected Order Form or
          subscription upon notice if a Force Majeure Event prevents the Product from materially
          operating for 30 or more consecutive days. Provider will pay Customer a prorated refund of
          any prepaid Fees for the remainder of the Subscription Period. A Force Majeure Event does
          not excuse Customer’s obligation to pay Fees accrued prior to termination.
        </TypographyP>
        <TypographyP>
          <strong>5.5 Effect of Termination.</strong> Termination of the Framework Terms
          automatically terminates all Order Forms and subscriptions governed by them. Upon any
          expiration or termination: (a) Customer will no longer have any right to use the Product;
          (b) upon Customer’s request, Provider will delete Customer Content within 60 days; (c)
          each Recipient will return or destroy Discloser’s Confidential Information in its
          possession or control; and (d) Provider will submit a final bill for outstanding Fees
          accrued before termination and Customer will pay according to Section 4.
        </TypographyP>
        <TypographyP>
          <strong>5.6 Survival.</strong> The following survive expiration or termination: Sections
          1.4, 1.6, 1.7, 2.1, 4 (for Fees accrued or payable before expiration or termination), 5.5,
          5.6, 6, 7, 8, 9, 10, 11, 12, and 13. Each Recipient may retain Discloser’s Confidential
          Information in accordance with standard backup or record retention policies or as required
          by Applicable Laws, in which case Sections 3 and 10 continue to apply to retained
          Confidential Information.
        </TypographyP>
      </LegalSection>

      <LegalSection title="6. Representations and warranties">
        <TypographyP>
          <strong>6.1 Mutual.</strong> Each party represents and warrants to the other that: (a) it
          has the legal power and authority to enter into this Agreement; (b) it is duly organized,
          validly existing, and in good standing under the Applicable Laws of the jurisdiction of
          its origin (if it is an entity); (c) it will comply with all Applicable Laws in performing
          its obligations or exercising its rights under this Agreement; and (d) it will comply with
          the Additional Warranties.
        </TypographyP>
        <TypographyP>
          <strong>6.2 From Customer.</strong> Customer represents and warrants that it, all Users,
          and anyone submitting Customer Content each have and will continue to have all rights
          necessary to submit or make available Customer Content to the Product and to allow the use
          of Customer Content as described in this Agreement.
        </TypographyP>
        <TypographyP>
          <strong>6.3 From Provider.</strong> Provider represents and warrants to Customer that it
          will not materially reduce the general functionality of the Cloud Service during the
          Subscription Period.
        </TypographyP>
        <TypographyP>
          <strong>6.4 Provider Warranty Remedy.</strong> If Provider breaches the warranty in
          Section 6.3, Customer must give Provider notice (with enough detail for Provider to
          understand or replicate the issue) within 45 days of discovering the issue. Within 45 days
          of receiving sufficient details, Provider will attempt to restore the general
          functionality of the Cloud Service. If Provider cannot resolve the issue, Customer may
          terminate the affected Order Form or subscription and Provider will pay a prorated refund
          of prepaid Fees for the remainder of the Subscription Period. Provider’s restoration
          obligation, and Customer’s termination right, are Customer’s only remedies for a breach of
          Section 6.3.
        </TypographyP>
      </LegalSection>

      <LegalSection title="7. Disclaimer of warranties">
        <TypographyP>
          Provider makes no guarantees that the Product will always be safe, secure, or error-free,
          or that it will function without disruptions, delays, or imperfections. The warranties in
          Section 6 do not apply to any misuse or unauthorized modification of the Product, nor to
          any product or service provided by anyone other than Provider (including Customer-selected
          third-party model providers). Except for the warranties in Section 6, Provider and
          Customer each disclaim all other warranties and conditions, whether express or implied,
          including the implied warranties and conditions of merchantability, fitness for a
          particular purpose, title, and non-infringement. These disclaimers apply to the maximum
          extent permitted by Applicable Laws.
        </TypographyP>
        <TypographyP>
          Nothing in this Agreement excludes, restricts, or modifies any consumer guarantee, right,
          or remedy conferred by the Australian Consumer Law or any other Applicable Laws that
          cannot be excluded, restricted, or modified by agreement. Where such a guarantee applies
          and liability cannot be excluded, Provider’s liability is limited, to the extent permitted
          by law, to resupplying the services or paying the cost of resupply.
        </TypographyP>
      </LegalSection>

      <LegalSection title="8. Limitation of liability">
        <TypographyP>
          <strong>8.1 Liability Caps.</strong> Except as provided in Section 8.4 (Exceptions), each
          party’s total cumulative liability for all claims arising out of or relating to this
          Agreement will not be more than the General Cap Amount. If there are Increased Claims,
          each party’s total cumulative liability for all Increased Claims arising out of or
          relating to this Agreement will not be more than the Increased Cap Amount.
        </TypographyP>
        <TypographyP>
          <strong>8.2 Damages Waiver.</strong> Except as provided in Section 8.4 (Exceptions), under
          no circumstances will either party be liable to the other for lost profits or revenues
          (whether direct or indirect), or for consequential, special, indirect, exemplary,
          punitive, or incidental damages relating to this Agreement, even if the party is informed
          of the possibility of this type of damage in advance.
        </TypographyP>
        <TypographyP>
          <strong>8.3 Applicability.</strong> The limitations and waivers in Sections 8.1 and 8.2
          apply to all liability, whether in tort (including negligence), contract, breach of
          statutory duty, or otherwise.
        </TypographyP>
        <TypographyP>
          <strong>8.4 Exceptions.</strong> The liability cap in Section 8.1’s General Cap Amount
          does not apply to any Increased Claims. Section 8.1 does not apply to any Unlimited
          Claims. Section 8.2 does not apply to any Increased Claims or a breach of Section 10
          (Confidentiality). Nothing in this Agreement will limit, exclude, or restrict a party’s
          liability to the extent prohibited by Applicable Laws.
        </TypographyP>
      </LegalSection>

      <LegalSection title="9. Indemnification">
        <TypographyP>
          <strong>9.1 Protection by Provider.</strong> Provider will indemnify, defend, and hold
          harmless Customer from and against all Provider Covered Claims made by someone other than
          Customer, Customer’s Affiliates, or Users, and all out-of-pocket damages, awards,
          settlements, costs, and expenses, including reasonable attorneys’ fees and other legal
          expenses, that arise from the Provider Covered Claims.
        </TypographyP>
        <TypographyP>
          <strong>9.2 Protection by Customer.</strong> Customer will indemnify, defend, and hold
          harmless Provider from and against all Customer Covered Claims made by someone other than
          Provider or its Affiliates, and all out-of-pocket damages, awards, settlements, costs, and
          expenses, including reasonable attorneys’ fees and other legal expenses, that arise from
          the Customer Covered Claims.
        </TypographyP>
        <TypographyP>
          <strong>9.3 Procedure.</strong> The Indemnifying Party’s obligations are contingent upon
          the Protected Party: (a) promptly notifying the Indemnifying Party of each Covered Claim;
          (b) providing reasonable assistance at the Indemnifying Party’s expense; and (c) giving
          the Indemnifying Party sole control over the defense and settlement of each Covered Claim.
          A Protected Party may participate with its own attorneys only at its own expense. The
          Indemnifying Party may not agree to any settlement that contains an admission of fault or
          otherwise materially and adversely impacts the Protected Party without the Protected
          Party’s prior written consent.
        </TypographyP>
        <TypographyP>
          <strong>9.4 Changes to Product.</strong> If required by settlement or court order, or if
          deemed reasonably necessary in response to a Provider Covered Claim, Provider may: (a)
          obtain the right for Customer to continue using the Product; (b) replace or modify the
          affected component without materially reducing the general functionality of the Product;
          or (c) if neither (a) nor (b) is reasonable, terminate the affected Order Form or
          subscription and issue a prorated refund of prepaid Fees for the remainder of the
          Subscription Period.
        </TypographyP>
        <TypographyP>
          <strong>9.5 Exclusions.</strong> Provider’s obligations as an Indemnifying Party will not
          apply to Provider Covered Claims that result from (i) modifications to the Product not
          authorized by Provider or made in compliance with Customer’s instructions; (ii)
          unauthorized use of the Product, including use in violation of this Agreement; (iii) use
          of the Product in combination with items not provided by Provider; or (iv) use of an old
          version of the Product where a newer release would avoid the claim. Customer’s obligations
          as an Indemnifying Party will not apply to Customer Covered Claims that result from
          Provider’s unauthorized use of Customer Content, including use in violation of this
          Agreement.
        </TypographyP>
        <TypographyP>
          <strong>9.6 Exclusive Remedy.</strong> This Section 9, together with any termination
          rights, describes each Protected Party’s exclusive remedy and each Indemnifying Party’s
          entire liability for a Covered Claim.
        </TypographyP>
      </LegalSection>

      <LegalSection title="10. Confidentiality">
        <TypographyP>
          <strong>10.1 Non-Use and Non-Disclosure.</strong> Except as otherwise authorized in the
          Agreement or as needed to fulfill its obligations or exercise its rights under this
          Agreement, Recipient will not (a) use Discloser’s Confidential Information; nor (b)
          disclose Discloser’s Confidential Information to anyone else. Recipient will protect
          Discloser’s Confidential Information using at least the same protections Recipient uses
          for its own similar information but no less than a reasonable standard of care.
        </TypographyP>
        <TypographyP>
          <strong>10.2 Exclusions.</strong> Confidential Information does not include information
          that (a) Recipient knew without any obligation of confidentiality before disclosure by
          Discloser; (b) is or becomes publicly known and generally available through no fault of
          Recipient; (c) Recipient receives under no obligation of confidentiality from someone else
          who is authorized to make the disclosure; or (d) Recipient independently developed without
          use of or reference to Discloser’s Confidential Information.
        </TypographyP>
        <TypographyP>
          <strong>10.3 Required Disclosures.</strong> Recipient may disclose Discloser’s
          Confidential Information to the extent required by Applicable Laws if, unless prohibited
          by Applicable Laws, Recipient provides Discloser reasonable advance notice of the required
          disclosure and reasonably cooperates, at Discloser’s expense, with Discloser’s efforts to
          obtain confidential treatment.
        </TypographyP>
        <TypographyP>
          <strong>10.4 Permitted Disclosures.</strong> Recipient may disclose Discloser’s
          Confidential Information to Users, employees, advisors, contractors, and representatives
          who each have a need to know, but only if the person or entity is bound by confidentiality
          obligations at least as protective as those in this Section 10 and Recipient remains
          responsible for everyone’s compliance.
        </TypographyP>
      </LegalSection>

      <LegalSection title="11. Reservation of rights">
        <TypographyP>
          Except for the limited license to copy and use Software and Documentation in Section 1.1,
          Provider retains all right, title, and interest in and to the Product, whether developed
          before or after the Effective Date. Except for the limited rights in Sections 1.5, 1.6,
          and 1.7, Customer retains all right, title, and interest in and to the Customer Content.
        </TypographyP>
      </LegalSection>

      <LegalSection title="12. General terms">
        <TypographyP>
          <strong>12.1 Entire Agreement.</strong> This Agreement is the only agreement between the
          parties about its subject and supersedes all prior or contemporaneous statements (whether
          in writing or not) about its subject. Provider expressly rejects any terms included in
          Customer’s purchase order or similar document, which may only be used for accounting or
          administrative purposes. No terms in any Customer documentation or online vendor portal
          apply unless expressly agreed in a legally binding written agreement signed by an
          authorized Provider representative.
        </TypographyP>
        <TypographyP>
          <strong>12.2 Modifications, Severability, and Waiver.</strong> Provider may update these
          online Framework Terms from time to time. If Provider makes material changes, Provider
          will update the effective date and take reasonable steps to notify Customer (for example
          by email or in-product notice). Continued use of the Product after the effective date of
          updated terms constitutes acceptance, except where Applicable Laws require a different
          process. For a signed Order Form, any waiver, modification, or change to that Order Form
          must be in writing and signed or electronically accepted by each party. If any term of
          this Agreement is determined to be invalid or unenforceable, the remaining terms remain in
          full force and effect. Failure to enforce a term is not a waiver.
        </TypographyP>
        <TypographyP>
          <strong>12.3 Governing Law and Chosen Courts.</strong> The Governing Law will govern all
          interpretations and disputes about this Agreement, without regard to its conflict of laws
          provisions. The parties will bring any legal suit, action, or proceeding about this
          Agreement in the Chosen Courts and each party irrevocably submits to the exclusive
          jurisdiction of the Chosen Courts.
        </TypographyP>
        <TypographyP>
          <strong>12.4 Injunctive Relief.</strong> Despite Section 12.3, a breach of Section 10
          (Confidentiality) or the violation of a party’s intellectual property rights may cause
          irreparable harm for which monetary damages cannot adequately compensate. Upon the actual
          or threatened breach of Section 10 or violation of a party’s intellectual property rights,
          the non-breaching or non-violating party may seek appropriate equitable relief, including
          an injunction, in any court of competent jurisdiction without the need to post a bond and
          without limiting its other rights or remedies.
        </TypographyP>
        <TypographyP>
          <strong>12.5 Non-Exhaustive Remedies.</strong> Except where the Agreement provides for an
          exclusive remedy, seeking or exercising a remedy does not limit the other rights or
          remedies available to a party.
        </TypographyP>
        <TypographyP>
          <strong>12.6 Assignment.</strong> Neither party may assign any rights or obligations under
          this Agreement without the prior written consent of the other party. However, either party
          may assign this Agreement upon notice if the assigning party undergoes a merger, change of
          control, reorganization, or sale of all or substantially all its equity, business, or
          assets to which this Agreement relates. Any attempted but non-permitted assignment is
          void. This Agreement will be binding upon and inure to the benefit of the parties and
          their permitted successors and assigns.
        </TypographyP>
        <TypographyP>
          <strong>12.7 Beta Products.</strong> If Provider gives Customer access to a Beta Product,
          the Beta Product is provided “AS IS” and Section 6.3 does not apply to Beta Products.
          Customer acknowledges that Beta Products are experimental and may be modified or removed
          at Provider’s discretion with or without notice.
        </TypographyP>
        <TypographyP>
          <strong>12.8 Logo Rights.</strong> Provider may identify Customer and use Customer’s name
          and logo in marketing to identify Customer as a user of Provider’s products and services.
          Customer may opt out by notice to the Notice Address.
        </TypographyP>
        <TypographyP>
          <strong>12.9 Notices.</strong> Any notice, request, or approval about the Agreement must
          be in writing and sent to the Notice Address (and, for notices to Customer, the email
          associated with Customer’s account). Notices will be deemed given (a) upon confirmed
          delivery if by email, registered or certified mail, or personal delivery; or (b) two days
          after mailing if by overnight commercial delivery.
        </TypographyP>
        <TypographyP>
          <strong>12.10 Independent Contractors.</strong> The parties are independent contractors,
          not agents, partners, or joint venturers. Neither party is authorized to bind the other to
          any liability or obligation.
        </TypographyP>
        <TypographyP>
          <strong>12.11 No Third-Party Beneficiary.</strong> There are no third-party beneficiaries
          of this Agreement.
        </TypographyP>
        <TypographyP>
          <strong>12.12 Force Majeure.</strong> Neither party will be liable for a delay or failure
          to perform its obligations of this Agreement if caused by a Force Majeure Event. However,
          this section does not excuse Customer’s obligations to pay Fees.
        </TypographyP>
        <TypographyP>
          <strong>12.13 Export Controls and Sanctions.</strong> Customer may not use, export, or
          re-export the Product in violation of Applicable Laws of Australia, the United States, or
          other applicable jurisdictions, including sanctions administered by DFAT, OFAC, or similar
          authorities. Customer represents that it is not (a) located in, or a national or resident
          of, an Embargoed Country; (b) an entity organized under the laws of an Embargoed Country;
          (c) designated on any list of prohibited, restricted, or sanctioned parties maintained by
          the Australian, U.S., UN, or other applicable governments or agencies; nor (d) 50% or more
          owned by any party designated on any of the above lists. Provider may terminate this
          Agreement immediately without notice or liability to comply, as determined in Provider’s
          sole discretion, with applicable export controls and sanctions laws and regulations.
        </TypographyP>
        <TypographyP>
          <strong>12.14 Government Rights.</strong> If Customer is a U.S. Government end user, the
          Cloud Service and Software are deemed “commercial items” or “commercial computer software”
          according to FAR section 12.212 and DFAR section 227.7202, and the Documentation is
          “commercial computer software documentation” according to DFAR section 252.227-7014(a)(1)
          and (5). Any use, modification, reproduction, release, performance, display, or disclosure
          of the Product by the U.S. Government will be governed solely by the terms of this
          Agreement and all other use is prohibited.
        </TypographyP>
        <TypographyP>
          <strong>12.15 Anti-Bribery.</strong> Neither party will take any action that would violate
          Applicable Laws that prohibit bribery or corruption, including the Australian Criminal
          Code Act bribery offences, the U.S. Foreign Corrupt Practices Act, and the UK Bribery Act
          2010.
        </TypographyP>
        <TypographyP>
          <strong>12.16 Titles and Interpretation.</strong> Section titles are for convenience and
          reference only. All uses of “including” and similar phrases are non-exhaustive and without
          limitation. The United Nations Convention for the International Sale of Goods does not
          apply to this Agreement.
        </TypographyP>
        <TypographyP>
          <strong>12.17 Signature and Acceptance.</strong> This Agreement may be accepted by
          electronic acceptance, online checkout, account creation, continued use of the Product, or
          signature (including counterparts and electronic copies). Each acceptance or signed copy
          is deemed an original.
        </TypographyP>
      </LegalSection>

      <LegalSection title="13. Definitions">
        <TypographyP>
          <strong>“Affiliate”</strong> means an entity that, directly or indirectly, controls, is
          under the control of, or is under common control with a party, where control means having
          more than fifty percent (50%) of the voting stock or other ownership interest.
        </TypographyP>
        <TypographyP>
          <strong>“Agreement”</strong> means these Framework Terms, including the Key Terms, and any
          Order Form or online purchase governed by them.
        </TypographyP>
        <TypographyP>
          <strong>“Applicable Data Protection Laws”</strong> means the Applicable Laws that govern
          how the Cloud Service may process or use an individual’s personal information, personal
          data, personally identifiable information, or other similar term, including the Australian
          Privacy Act 1988 (Cth) and the GDPR where applicable.
        </TypographyP>
        <TypographyP>
          <strong>“Applicable Laws”</strong> means the laws, rules, regulations, court orders, and
          other binding requirements of a relevant government authority that apply to or govern
          Provider or Customer.
        </TypographyP>
        <TypographyP>
          <strong>“Beta Product”</strong> means an early or prerelease feature or version of the
          Product that is identified as beta or similar, or a version of the Product that is not
          generally available.
        </TypographyP>
        <TypographyP>
          <strong>“Cloud Service”</strong> means the product described in the Key Terms or Order
          Form.
        </TypographyP>
        <TypographyP>
          <strong>“Confidential Information”</strong> means information in any form disclosed by or
          on behalf of a Discloser, including before the Effective Date, to a Recipient in
          connection with this Agreement that (a) the Discloser identifies as “confidential”,
          “proprietary”, or the like; or (b) should be reasonably understood as confidential or
          proprietary due to its nature and the circumstances of its disclosure. Confidential
          Information includes the existence of a negotiated Order Form and its commercial terms.
          Customer’s Confidential Information includes non-public Customer Content. Provider’s
          Confidential Information includes non-public information about the Product.
        </TypographyP>
        <TypographyP>
          <strong>“Covered Claim”</strong> means either a Provider Covered Claim or Customer Covered
          Claim, as defined in the Key Terms.
        </TypographyP>
        <TypographyP>
          <strong>“Customer Content”</strong> means data, information, or materials submitted by or
          on behalf of Customer or Users to the Product (including source strings, translations,
          prompts, glossaries, configuration, and localization metadata) but excludes Feedback.
        </TypographyP>
        <TypographyP>
          <strong>“Discloser”</strong> means a party to this Agreement when the party is providing
          or disclosing Confidential Information to the other party.
        </TypographyP>
        <TypographyP>
          <strong>“Documentation”</strong> means the usage manuals and instructional materials for
          the Cloud Service or Software that are made available by Provider.
        </TypographyP>
        <TypographyP>
          <strong>“Embargoed Country”</strong> means any country or region to or from where
          Applicable Laws generally restrict the export or import of goods, services, or money.
        </TypographyP>
        <TypographyP>
          <strong>“Feedback”</strong> means suggestions, feedback, or comments about the Product or
          related offerings.
        </TypographyP>
        <TypographyP>
          <strong>“Fees”</strong> means the applicable amounts described at checkout, in an Order
          Form, or in Customer’s plan.
        </TypographyP>
        <TypographyP>
          <strong>“Force Majeure Event”</strong> means an unforeseen event outside a party’s
          reasonable control where the affected party took reasonable measures to avoid or mitigate
          the impacts of the event. Examples include unpredicted natural disasters, war, pandemic,
          riot, act of terrorism, or public utility or internet failure.
        </TypographyP>
        <TypographyP>
          <strong>“Framework Terms”</strong> means these Standard Terms, the Key Terms, and any
          policies and documents referenced in them (including the Privacy Policy).
        </TypographyP>
        <TypographyP>
          <strong>“GDPR”</strong> means European Union Regulation 2016/679 as implemented by local
          law in the relevant European Union member nation, and by section 3 of the United Kingdom’s
          European Union (Withdrawal) Act of 2018 in the United Kingdom.
        </TypographyP>
        <TypographyP>
          <strong>“High Risk Activity”</strong> means any situation where the use or failure of the
          Product could be reasonably expected to lead to death, bodily injury, or environmental
          damage. Examples include full or partial autonomous vehicle technology, medical
          life-support technology, emergency response services, nuclear facilities operation, and
          air traffic control.
        </TypographyP>
        <TypographyP>
          <strong>“Indemnifying Party”</strong> means a party to this Agreement when the party is
          providing protection for a particular Covered Claim.
        </TypographyP>
        <TypographyP>
          <strong>“OFAC”</strong> means the United States Department of the Treasury’s Office of
          Foreign Assets Control.
        </TypographyP>
        <TypographyP>
          <strong>“Order Form”</strong> means an ordering document, online checkout, or similar
          commercial terms that reference this Agreement and identify Fees, Subscription Period, or
          other commercial details. An Order Form includes the policies and documents referenced in
          or attached to it.
        </TypographyP>
        <TypographyP>
          <strong>“Personal Data”</strong> will have the meaning(s) set forth in the Applicable Data
          Protection Laws for personal information, personal data, personally identifiable
          information, or other similar term.
        </TypographyP>
        <TypographyP>
          <strong>“Product”</strong> means the Cloud Service, Software, and Documentation.
        </TypographyP>
        <TypographyP>
          <strong>“Prohibited Data”</strong> means (a) patient, medical, or other protected health
          information regulated by HIPAA or similar health privacy laws; (b) credit, debit, bank
          account, or other financial account numbers; (c) social security numbers, tax file
          numbers, driver’s license numbers, or other unique and private government ID numbers; (d)
          special categories of data as defined in the GDPR; and (e) other similar categories of
          sensitive information as set forth in Applicable Data Protection Laws.
        </TypographyP>
        <TypographyP>
          <strong>“Protected Party”</strong> means a party to this Agreement when the party is
          receiving the benefit of protection for a particular Covered Claim.
        </TypographyP>
        <TypographyP>
          <strong>“Recipient”</strong> means a party to this Agreement when the party receives
          Confidential Information from the other party.
        </TypographyP>
        <TypographyP>
          <strong>“Software”</strong> means the client-side software or applications made available
          by Provider for Customer to install, download (whether onto a machine or in a browser), or
          execute as part of the Product, including the Hyperlocalise CLI where used with the Cloud
          Service.
        </TypographyP>
        <TypographyP>
          <strong>“Usage Data”</strong> means data and information about the provision, use, and
          performance of the Product and related offerings based on Customer’s or User’s use of the
          Product.
        </TypographyP>
        <TypographyP>
          <strong>“User”</strong> means any individual who uses the Product on Customer’s behalf or
          through Customer’s account.
        </TypographyP>
      </LegalSection>

      <LegalSection title="Contact">
        <TypographyP>
          For legal questions about these terms, contact: <code>{SUPPORT_EMAIL}</code>
        </TypographyP>
        <TypographyP>
          For data processing agreement requests, contact: <code>{SUPPORT_EMAIL}</code>
        </TypographyP>
        <TypographyP>
          Effective date: <code>2026-08-10</code>
        </TypographyP>
      </LegalSection>
    </>
  );
}
