import { LegalLayout } from "../components/legal/LegalLayout";
import { SEO } from "../components/seo/SEO";

const lastUpdated = new Date("2026-03-01");

export const RefundPolicyPage = () => {
  return (
    <LegalLayout title="Refund Policy" lastUpdated={lastUpdated}>
      <SEO
        title="Refund Policy"
        description="Refund Policy for ReceiptMaster subscriptions. Learn about cancellation and billing."
        path="/refund-policy"
      />
      <h2>1. Overview</h2>
      <p>
        This Refund Policy applies to all subscription purchases made through
        ReceiptMaster (<a href="https://receiptmaster.org">receiptmaster.org</a>
        ), operated by FOP Pavlenko Andrii Volodymyrovych.
      </p>
      <p>
        All payments are processed by{""}
        <a
          href="https://www.paddle.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Paddle.com
        </a>
        {""}
        (Paddle Payments Ltd), which acts as the Merchant of Record for all
        transactions.
      </p>

      <h2>2. No Refunds</h2>
      <p>
        <strong>All sales are final.</strong> We do not offer refunds for
        subscription payments, including but not limited to:
      </p>
      <ul>
        <li>Monthly or annual subscription fees</li>
        <li>Plan upgrades</li>
        <li>Partial billing periods</li>
      </ul>
      <p>
        We encourage you to use the <strong>Free plan</strong> to evaluate the
        Service before purchasing a paid subscription. The Free plan includes
        core features with limited usage, allowing you to determine if the
        Service meets your needs.
      </p>

      <h2>3. Cancellation</h2>
      <p>
        You may cancel your subscription at any time through the Paddle billing
        portal (accessible from Settings &rarr; Subscription &rarr; Manage
        Subscription).
      </p>
      <p>When you cancel:</p>
      <ul>
        <li>
          <strong>No further charges</strong> will be made to your payment
          method
        </li>
        <li>
          <strong>You retain access</strong> to all paid features until the end
          of your current billing period
        </li>
        <li>
          <strong>After the billing period ends</strong>, your account is
          automatically downgraded to the Free plan
        </li>
        <li>
          <strong>Your data is preserved</strong> — nothing is deleted when you
          downgrade
        </li>
      </ul>

      <h2>4. Exceptional Circumstances</h2>
      <p>
        In rare cases, we may consider exceptions to this policy at our sole
        discretion, such as:
      </p>
      <ul>
        <li>
          Extended service outage caused by us that significantly impacted your
          use
        </li>
        <li>Duplicate charges due to a technical error</li>
        <li>Charges made after a confirmed cancellation</li>
      </ul>
      <p>
        If you believe you qualify for an exception, please contact us within 7
        days of the charge at{""}
        <a href="mailto:fluxlab@flux-lab.dev">fluxlab@flux-lab.dev</a> with your
        account email and a description of the issue.
      </p>

      <h2>5. Chargebacks</h2>
      <p>
        Before initiating a chargeback with your bank or payment provider, we
        strongly encourage you to contact us first. We are committed to
        resolving billing disputes fairly and promptly. Unwarranted chargebacks
        may result in account suspension.
      </p>

      <h2>6. Contact</h2>
      <p>For any billing questions or concerns, please contact us:</p>
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
