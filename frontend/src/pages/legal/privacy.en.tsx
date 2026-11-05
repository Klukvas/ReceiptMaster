import { Link } from "react-router-dom";
import type { LegalContent } from "./types";

export const privacyEn: LegalContent = {
  title: "Privacy Policy",
  seoDescription:
    "Privacy Policy for ReceiptMaster — how we collect, use, and protect your personal data.",
  body: (
    <>
      <h2>1. Introduction</h2>
      <p>
        This Privacy Policy describes how FOP Pavlenko Andrii Volodymyrovych
        ("we","us","our"), operating as ReceiptMaster, collects, uses, and
        protects your personal data when you use our service at{" "}
        <a href="https://receiptmaster.org">receiptmaster.org</a> ("Service").
      </p>
      <p>
        We aim to protect your privacy and to handle personal data in line with
        the General Data Protection Regulation (GDPR) and applicable Ukrainian
        data protection laws.
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
          <strong>Email:</strong>
          {" "}
          <a href="mailto:fluxlab@flux-lab.dev">fluxlab@flux-lab.dev</a>
        </li>
      </ul>

      <h2>3. Data We Collect</h2>

      <h3>3.1 Account Data</h3>
      <p>When you register for an account, we collect:</p>
      <ul>
        <li>Email address</li>
        <li>Password (stored in hashed form, never in plain text)</li>
      </ul>

      <h3>3.2 Business Data</h3>
      <p>When you use the Service, you may provide:</p>
      <ul>
        <li>Company name and contact information</li>
        <li>Company logo</li>
        <li>Product catalog data (names, prices, descriptions)</li>
        <li>Order and transaction records</li>
        <li>Recipient/customer information</li>
        <li>
          Telegram details of customers who order through a Telegram bot (ID,
          username and name), if you use that feature
        </li>
        <li>Supplier information</li>
        <li>
          Your company's details used in documents (tax ID, legal form,
          bank name, IBAN/SWIFT, VAT number, name and position of the person
          who signs, default payment term)
        </li>
        <li>
          Details of your customers and counterparties that you enter (legal
          name, tax ID, IBAN, bank name, legal address)
        </li>
        <li>
          Documents you generate — delivery notes, payment invoices, acts of
          completed work, sales receipts and packing lists (stored as PDF files that contain the details of both
          parties as they were when the document was generated), including a
          public link to a document if you choose to share one
        </li>
      </ul>
      <p>
        <strong>Data of your customers and counterparties.</strong> You enter
        this data yourself. For it you act as the controller, and we process it
        on your behalf to provide the Service and keep it secure (including
        the security log described in section 3.3). You are responsible for
        having a legal basis for entering it and for informing the people
        concerned.
      </p>
      <p>
        <strong>Public links.</strong> A link works for anyone who has it until
        you revoke it, the document is voided, its order is cancelled, or the
        document is removed under the storage limit. We do not set an expiry
        date. The PDF opened through the link may contain details of both
        parties, such as tax numbers, the seller's bank account number (IBAN)
        and addresses. We ask search engines not to index these pages, but
        anyone who has the link can still open it.
      </p>

      <h3>3.3 Usage Data</h3>
      <p>
        When you create, change or delete data in the Service, we record the
        request in a security log:
      </p>
      <ul>
        <li>IP address</li>
        <li>Browser type and version (user agent)</li>
        <li>Date and time of the request</li>
        <li>
          The data submitted with the request, except passwords, tokens and
          counterparty and bank details (tax numbers, IBAN, bank names,
          legal names, addresses), which are masked before saving
        </li>
      </ul>
      <p>
        We do not track the pages you visit or run analytics on your use of the
        Service.
      </p>

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
        ID, subscription status, and billing period dates. We never see your credit card number
        or bank details.
      </p>

      <h2>4. How We Use Your Data</h2>
      <p>We use your personal data to:</p>
      <ul>
        <li>Provide, maintain, and improve the Service</li>
        <li>Authenticate your identity and manage your account</li>
        <li>Process subscriptions and manage billing through Paddle</li>
        <li>Provide customer support and answer the emails you send us</li>
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
              <td>
                User ID and chosen plan (you enter your email and payment
                details directly at Paddle's checkout)
              </td>
            </tr>
            <tr>
              <td>Hetzner (hosting and object storage, Germany)</td>
              <td>Infrastructure, database, and storage of files</td>
              <td>
                All service data, including logos and generated documents
              </td>
            </tr>
            <tr>
              <td>Telegram</td>
              <td>Order and shop messages, only if you use the Telegram bot</td>
              <td>The messages the bot sends and receives</td>
            </tr>
            <tr>
              <td>Google Fonts</td>
              <td>Delivering the fonts used by our pages</td>
              <td>IP address and browser details when a page loads</td>
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
          account. You can ask us to delete your account by email; we delete it
          from our live systems within 30 days of the request. Backup copies
          are removed when the backups expire.
        </li>
        <li>
          <strong>Business data:</strong> Retained for the duration of your
          account and deleted together with it. Products and orders you delete
          are only hidden from you until then.
        </li>
        <li>
          <strong>Documents:</strong> We keep the 10 most recent active (not
          voided) generated documents of each type (delivery note, payment
          invoice, act of completed work, sales receipt, packing list) of your account. Generating a new one
          permanently removes the oldest active document of the same type: its share link stops
          working at once and its PDF file is deleted from storage shortly
          afterwards. Voided and failed documents do not count towards this
          limit; we keep them, with their numbers, for as long as your account
          exists. We are not an archive, so save copies of the documents
          you are required to keep.
        </li>
        <li>
          <strong>Security logs:</strong> Kept while your account exists and
          deleted together with your data.
        </li>
        <li>
          <strong>Billing records:</strong> Paddle, as Merchant of Record,
          keeps these as required by applicable tax and accounting laws
          (typically 5-7 years). We keep only your Paddle customer and
          subscription IDs and the subscription status.
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
        <li>Secure password hashing (bcrypt)</li>
        <li>Regular security updates</li>
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
        Our servers are located in Germany. Paddle (United Kingdom) and, if you
        use it, Telegram may process data in other countries as well. Where
        data leaves Ukraine or the European Economic Area (EEA), we rely on the
        transfer safeguards of these providers and their own policies.
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
        of material changes by posting them on this page and, where possible, by
        email at least 30 days before they take effect. The "Last updated" date at the top of this page
        indicates when this policy was last revised.
      </p>

      <h2>14. Contact Us</h2>
      <p>
        If you have any questions about this Privacy Policy or our data
        practices, please contact us:
      </p>
      <ul>
        <li>
          <strong>Email:</strong>
          {" "}
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
    
    </>
  ),
};
