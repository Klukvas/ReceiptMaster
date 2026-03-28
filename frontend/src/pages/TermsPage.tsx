import { Link } from "react-router-dom";
import { LegalLayout } from "../components/legal/LegalLayout";
import { SEO } from "../components/seo/SEO";

const lastUpdated = new Date("2026-03-01");

export const TermsPage = () => {
  return (
    <LegalLayout title="Terms of Service" lastUpdated={lastUpdated}>
      <SEO
        title="Terms of Service"
        description="Terms of Service for ReceiptMaster — cloud-based platform for digital receipts and invoices."
        path="/terms"
      />
      <h2>1. Introduction</h2>
      <p>
        These Terms of Service ("Terms") govern your access to and use of
        ReceiptMaster ("Service"), operated by FOP Pavlenko Andrii
        Volodymyrovych ("we","us","our"), a sole proprietor registered in
        Ukraine, located in Brovary, Kyiv Oblast, Ukraine.
      </p>
      <p>
        By creating an account or using the Service, you agree to be bound by
        these Terms. If you do not agree, do not use the Service.
      </p>

      <h2>2. Description of Service</h2>
      <p>
        ReceiptMaster is a cloud-based platform that allows businesses to
        create, manage, and share digital receipts and invoices. The Service
        includes product catalog management, order processing, receipt
        generation with customizable templates, and analytics dashboards.
      </p>

      <h2>3. Account Registration</h2>
      <p>
        To use the Service, you must create an account by providing a valid
        email address and password. You are responsible for:
      </p>
      <ul>
        <li>Maintaining the confidentiality of your account credentials</li>
        <li>All activities that occur under your account</li>
        <li>
          Notifying us immediately of any unauthorized use of your account
        </li>
      </ul>
      <p>
        You must be at least 18 years old or the age of legal majority in your
        jurisdiction to create an account.
      </p>

      <h2>4. Subscription Plans and Billing</h2>
      <p>
        ReceiptMaster offers subscription plans (Free, Pro, Business) with
        varying features and usage limits. Paid subscriptions are billed on a
        recurring basis (monthly or annually) depending on the plan selected.
      </p>
      <p>
        <strong>Payment Processing:</strong> All payments are processed by{""}
        <a
          href="https://www.paddle.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Paddle.com
        </a>
        , which acts as the Merchant of Record for all transactions. By
        purchasing a subscription, you also agree to Paddle's{""}
        <a
          href="https://www.paddle.com/legal/terms"
          target="_blank"
          rel="noopener noreferrer"
        >
          Terms of Use
        </a>
        {""}
        and{""}
        <a
          href="https://www.paddle.com/legal/privacy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy Policy
        </a>
        .
      </p>
      <p>
        <strong>Automatic Renewal:</strong> Paid subscriptions automatically
        renew at the end of each billing period unless you cancel before the
        renewal date.
      </p>
      <p>
        <strong>Price Changes:</strong> We may adjust subscription prices with
        at least 30 days' written notice. If you do not agree with the new
        pricing, you may cancel your subscription before the next billing cycle.
      </p>

      <h2>5. Cancellation</h2>
      <p>
        You may cancel your subscription at any time through the Paddle billing
        portal accessible from your account settings. Upon cancellation:
      </p>
      <ul>
        <li>
          You retain access to paid features until the end of the current
          billing period
        </li>
        <li>
          Your account will be downgraded to the Free plan after the period ends
        </li>
        <li>
          Your data will be retained according to our data retention policy
        </li>
      </ul>

      <h2>6. Refunds</h2>
      <p>
        All sales are final. We generally do not offer refunds for subscription
        payments, though limited exceptions may apply. Please review our{""}
        <Link to="/refund-policy">Refund Policy</Link> for complete details,
        including exceptional circumstances.
      </p>

      <h2>7. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>
          Use the Service for any unlawful purpose or in violation of any
          applicable laws
        </li>
        <li>
          Attempt to gain unauthorized access to the Service or its related
          systems
        </li>
        <li>
          Interfere with or disrupt the integrity or performance of the Service
        </li>
        <li>Upload or transmit malicious code, viruses, or harmful data</li>
        <li>Use the Service to generate fraudulent receipts or documents</li>
        <li>
          Resell, sublicense, or redistribute the Service without our written
          consent
        </li>
        <li>
          Exceed the usage limits of your subscription plan through automated
          means
        </li>
      </ul>

      <h2>8. Intellectual Property</h2>
      <p>
        The Service, including its design, code, templates, and documentation,
        is owned by us and protected by intellectual property laws. You retain
        ownership of the data you upload to the Service (products, orders,
        company information).
      </p>
      <p>
        We grant you a limited, non-exclusive, non-transferable license to use
        the Service for its intended purpose during your subscription term.
      </p>

      <h2>9. Data and Privacy</h2>
      <p>
        Your use of the Service is also governed by our{""}
        <Link to="/privacy">Privacy Policy</Link>, which describes how we
        collect, use, and protect your personal data.
      </p>

      <h2>10. Service Availability</h2>
      <p>
        We strive to maintain high availability of the Service but do not
        guarantee uninterrupted access. The Service may be temporarily
        unavailable due to maintenance, updates, or circumstances beyond our
        control. We will make reasonable efforts to notify users of planned
        downtime.
      </p>

      <h2>11. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by applicable law, we shall not be
        liable for any indirect, incidental, special, consequential, or punitive
        damages, including but not limited to loss of profits, data, or business
        opportunities, arising from your use of or inability to use the Service.
      </p>
      <p>
        Our total liability for any claim arising from or related to the Service
        shall not exceed the amount you paid to us in the twelve (12) months
        preceding the claim.
      </p>

      <h2>12. Disclaimer of Warranties</h2>
      <p>
        The Service is provided"as is" and"as available" without warranties of
        any kind, whether express or implied, including but not limited to
        implied warranties of merchantability, fitness for a particular purpose,
        and non-infringement.
      </p>

      <h2>13. Indemnification</h2>
      <p>
        You agree to indemnify and hold us harmless from any claims, damages,
        losses, or expenses (including reasonable attorney's fees) arising from
        your use of the Service or violation of these Terms.
      </p>

      <h2>14. Modifications to Terms</h2>
      <p>
        We may update these Terms from time to time. We will notify you of
        material changes by email or through the Service at least 30 days before
        they take effect. Your continued use of the Service after changes become
        effective constitutes your acceptance of the revised Terms.
      </p>

      <h2>15. Termination</h2>
      <p>
        We reserve the right to suspend or terminate your account if you violate
        these Terms or engage in activity that harms the Service or other users.
        Upon termination, your right to use the Service ceases immediately, but
        provisions that by their nature should survive (such as limitation of
        liability and indemnification) will continue to apply.
      </p>

      <h2>16. Governing Law</h2>
      <p>
        These Terms are governed by and construed in accordance with the laws of
        Ukraine. Any disputes arising from these Terms shall be resolved in the
        courts of Ukraine.
      </p>

      <h2>17. Contact Information</h2>
      <p>If you have any questions about these Terms, please contact us:</p>
      <ul>
        <li>
          <strong>Email:</strong>
          {""}
          <a href="mailto:fluxlab@flux-lab.dev">fluxlab@flux-lab.dev</a>
        </li>
        <li>
          <strong>Operator:</strong> FOP Pavlenko Andrii Volodymyrovych
        </li>
        <li>
          <strong>Location:</strong> Brovary, Kyiv Oblast, Ukraine
        </li>
      </ul>
    </LegalLayout>
  );
};
