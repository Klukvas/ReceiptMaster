import { Link } from "react-router-dom";
import { LegalLayout } from "../components/legal/LegalLayout";

const lastUpdated = new Date("2026-03-01");

export const PrivacyPage = () => {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated={lastUpdated}>
      <h2>1. Introduction</h2>
      <p>
        This Privacy Policy describes how FOP Pavlenko Andrii Volodymyrovych
        ("we", "us", "our"), operating as ReceiptMaster, collects, uses, and
        protects your personal data when you use our service at{" "}
        <a href="https://receiptmaster.org">receiptmaster.org</a> ("Service").
      </p>
      <p>
        We are committed to protecting your privacy and complying with the
        General Data Protection Regulation (GDPR) and applicable Ukrainian data
        protection laws.
      </p>

      <h2>2. Data Controller</h2>
      <p>The data controller responsible for your personal data is:</p>
      <ul>
        <li>
          <strong>Name:</strong> FOP Pavlenko Andrii Volodymyrovych
        </li>
        <li>
          <strong>Location:</strong> Brovary, Kyiv Oblast, Ukraine
        </li>
        <li>
          <strong>Email:</strong>{" "}
          <a href="mailto:fluxlab@flux-lab.dev">fluxlab@flux-lab.dev</a>
        </li>
      </ul>

      <h2>3. Data We Collect</h2>

      <h3>3.1 Account Data</h3>
      <p>When you register for an account, we collect:</p>
      <ul>
        <li>Email address</li>
        <li>Password (stored in hashed form, never in plain text)</li>
        <li>Full name (if provided)</li>
      </ul>

      <h3>3.2 Business Data</h3>
      <p>When you use the Service, you may provide:</p>
      <ul>
        <li>Company name and contact information</li>
        <li>Company logo</li>
        <li>Product catalog data (names, prices, descriptions)</li>
        <li>Order and transaction records</li>
        <li>Recipient/customer information</li>
        <li>Supplier information</li>
      </ul>

      <h3>3.3 Usage Data</h3>
      <p>We automatically collect:</p>
      <ul>
        <li>IP address</li>
        <li>Browser type and version</li>
        <li>Pages visited and features used</li>
        <li>Date and time of access</li>
        <li>Device information</li>
      </ul>

      <h3>3.4 Payment Data</h3>
      <p>
        We do <strong>not</strong> directly collect or store payment card
        information. All payment processing is handled by our payment provider,
        Paddle.com (Paddle Payments Ltd), which acts as the Merchant of Record.
        When you purchase a subscription, Paddle collects and processes your
        payment information according to their own{" "}
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
        From Paddle, we receive only: your Paddle customer ID, subscription
        status, and billing period dates. We never see your credit card number
        or bank details.
      </p>

      <h2>4. How We Use Your Data</h2>
      <p>We use your personal data to:</p>
      <ul>
        <li>Provide, maintain, and improve the Service</li>
        <li>Authenticate your identity and manage your account</li>
        <li>Process subscriptions and manage billing through Paddle</li>
        <li>
          Send transactional emails (account verification, password reset,
          subscription updates)
        </li>
        <li>Provide customer support</li>
        <li>Detect and prevent fraud or abuse</li>
        <li>Comply with legal obligations</li>
      </ul>
      <p>
        We do <strong>not</strong> sell your personal data to third parties. We
        do <strong>not</strong> use your data for advertising or profiling
        purposes.
      </p>

      <h2>5. Legal Basis for Processing</h2>
      <p>Under GDPR, we process your data based on:</p>
      <ul>
        <li>
          <strong>Contract performance</strong> (Art. 6(1)(b)): Processing
          necessary to provide the Service you have subscribed to
        </li>
        <li>
          <strong>Legitimate interest</strong> (Art. 6(1)(f)): Service
          improvement, security, and fraud prevention
        </li>
        <li>
          <strong>Legal obligation</strong> (Art. 6(1)(c)): Compliance with
          applicable laws and regulations
        </li>
        <li>
          <strong>Consent</strong> (Art. 6(1)(a)): Where applicable, for
          optional communications
        </li>
      </ul>

      <h2>6. Third-Party Services</h2>
      <p>We share data with the following third-party services:</p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Purpose</th>
              <th>Data Shared</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Paddle.com</td>
              <td>Payment processing (Merchant of Record)</td>
              <td>Email, user ID, subscription plan</td>
            </tr>
            <tr>
              <td>Cloud hosting provider</td>
              <td>Infrastructure and data storage</td>
              <td>All service data (encrypted at rest)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Each third-party service processes data according to their own privacy
        policy and is bound by applicable data protection regulations.
      </p>

      <h2>7. Data Retention</h2>
      <p>We retain your data as follows:</p>
      <ul>
        <li>
          <strong>Account data:</strong> Retained for the duration of your
          account. Deleted within 30 days of account deletion request.
        </li>
        <li>
          <strong>Business data:</strong> Retained for the duration of your
          account. Deleted within 30 days of account deletion request.
        </li>
        <li>
          <strong>Usage logs:</strong> Retained for up to 12 months for security
          and analytics purposes.
        </li>
        <li>
          <strong>Billing records:</strong> Retained as required by applicable
          tax and accounting laws (typically 5-7 years).
        </li>
      </ul>

      <h2>8. Your Rights</h2>
      <p>Under GDPR, you have the following rights:</p>
      <ul>
        <li>
          <strong>Right of access:</strong> Request a copy of the personal data
          we hold about you
        </li>
        <li>
          <strong>Right to rectification:</strong> Request correction of
          inaccurate personal data
        </li>
        <li>
          <strong>Right to erasure:</strong> Request deletion of your personal
          data ("right to be forgotten")
        </li>
        <li>
          <strong>Right to restriction:</strong> Request restriction of
          processing of your personal data
        </li>
        <li>
          <strong>Right to data portability:</strong> Request your data in a
          structured, commonly used, machine-readable format
        </li>
        <li>
          <strong>Right to object:</strong> Object to processing of your
          personal data based on legitimate interests
        </li>
        <li>
          <strong>Right to withdraw consent:</strong> Where processing is based
          on consent, you may withdraw it at any time
        </li>
      </ul>
      <p>
        To exercise any of these rights, contact us at{" "}
        <a href="mailto:fluxlab@flux-lab.dev">fluxlab@flux-lab.dev</a>. We will
        respond to your request within 30 days.
      </p>

      <h2>9. Cookies</h2>
      <p>
        We use cookies and similar technologies to operate the Service. For
        detailed information, please see our{" "}
        <Link to="/cookie-policy">Cookie Policy</Link>.
      </p>

      <h2>10. Data Security</h2>
      <p>
        We implement appropriate technical and organizational measures to
        protect your data, including:
      </p>
      <ul>
        <li>Encryption of data in transit (TLS/HTTPS)</li>
        <li>Encryption of data at rest</li>
        <li>Secure password hashing (bcrypt)</li>
        <li>Regular security updates and monitoring</li>
        <li>Access controls and authentication mechanisms</li>
        <li>Row-level security in the database</li>
      </ul>
      <p>
        While we strive to protect your data, no method of transmission over the
        Internet or electronic storage is 100% secure. We cannot guarantee
        absolute security.
      </p>

      <h2>11. International Data Transfers</h2>
      <p>
        Your data may be processed in countries outside of Ukraine or the
        European Economic Area (EEA). Where such transfers occur, we ensure
        appropriate safeguards are in place, such as Standard Contractual
        Clauses approved by the European Commission.
      </p>

      <h2>12. Children's Privacy</h2>
      <p>
        The Service is not intended for children under 18 years of age. We do
        not knowingly collect personal data from children. If you believe a
        child has provided us with personal data, please contact us and we will
        delete it.
      </p>

      <h2>13. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will notify you
        of material changes by email or through the Service at least 30 days
        before they take effect. The "Last updated" date at the top of this page
        indicates when this policy was last revised.
      </p>

      <h2>14. Contact Us</h2>
      <p>
        If you have any questions about this Privacy Policy or our data
        practices, please contact us:
      </p>
      <ul>
        <li>
          <strong>Email:</strong>{" "}
          <a href="mailto:fluxlab@flux-lab.dev">fluxlab@flux-lab.dev</a>
        </li>
        <li>
          <strong>Operator:</strong> FOP Pavlenko Andrii Volodymyrovych
        </li>
        <li>
          <strong>Location:</strong> Brovary, Kyiv Oblast, Ukraine
        </li>
      </ul>
      <p>
        If you are unsatisfied with our response, you have the right to lodge a
        complaint with a supervisory authority, including the Ukrainian
        Parliament Commissioner for Human Rights (Ombudsman).
      </p>
    </LegalLayout>
  );
};
