import type { LegalContent } from "./types";

export const cookiePolicyEn: LegalContent = {
  title: "Cookie Policy",
  seoDescription:
    "Cookie Policy for ReceiptMaster — how we use cookies and local storage on our platform.",
  body: (
    <>
      <h2>1. What Are Cookies</h2>
      <p>
        Cookies are small text files placed on your device when you visit a
        website. They are widely used to make websites work efficiently and to
        provide information to website operators.
      </p>
      <p>
        This Cookie Policy explains how ReceiptMaster (
        <a href="https://receiptmaster.org">receiptmaster.org</a>), operated by
        FOP Pavlenko Andrii Volodymyrovych, uses cookies and similar
        technologies.
      </p>

      <h2>2. Cookies We Use</h2>
      <p>
        ReceiptMaster itself does <strong>not</strong> set any cookies. Staying
        signed in and remembering your preferences rely on your browser's local
        storage instead (see section 3). The only cookies that may be set while
        you use the Service come from our payment provider:
      </p>

      <h3>2.1 Third-Party Cookies</h3>
      <p>
        When billing is enabled and you open the Paddle checkout overlay,
        Paddle may set cookies for payment processing and fraud prevention.
        These cookies are governed by{" "}
        <a
          href="https://www.paddle.com/legal/privacy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Paddle's Privacy Policy
        </a>
        .
      </p>

      <h3>2.2 Third-Party Resources</h3>
      <p>
        Our pages load their fonts from Google Fonts (fonts.googleapis.com and
        fonts.gstatic.com). When a page loads, Google receives your IP address
        and browser details, as with any resource loaded from another server.
      </p>

      <h2>3. Browser Storage</h2>
      <p>
        We use your browser's local storage and session storage, which work
        like cookies but are not sent to our servers with every request. They
        hold:
      </p>
      <ul>
        <li>
          Sign-in tokens (an access token and a refresh token) — keep you
          signed in to your account
        </li>
        <li>Your theme (light/dark) and language choices</li>
        <li>Table settings, such as rows per page and visible columns</li>
        <li>
          Short-lived session storage flags, for example a notice that your
          session expired, and a guard that stops the page from reloading
          repeatedly after an update; these disappear when you close the tab
        </li>
      </ul>
      <p>
        Local storage data remains on your device until you sign out (which
        removes the sign-in tokens) or clear your browser's site data.
      </p>

      <h2>4. We Do Not Use</h2>
      <p>
        ReceiptMaster does <strong>not</strong> use:
      </p>
      <ul>
        <li>Advertising or tracking cookies</li>
        <li>Third-party analytics services (Google Analytics, etc.)</li>
        <li>Social media tracking pixels</li>
        <li>Cross-site tracking technologies</li>
      </ul>

      <h2>5. Managing Cookies</h2>
      <p>
        You can control and delete cookies through your browser settings. Most
        browsers allow you to:
      </p>
      <ul>
        <li>View and delete existing cookies</li>
        <li>Block all cookies or third-party cookies</li>
        <li>Set preferences for specific websites</li>
      </ul>
      <p>
        Because the Service sets no cookies of its own, blocking cookies does not
        affect it, although blocking Paddle's cookies may prevent the checkout
        from working. Clearing your browser's site data for receiptmaster.org
        signs you out and resets your saved preferences.
      </p>
      <p>For instructions on managing cookies in your browser:</p>
      <ul>
        <li>
          <a
            href="https://support.google.com/chrome/answer/95647"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Chrome
          </a>
        </li>
        <li>
          <a
            href="https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer"
            target="_blank"
            rel="noopener noreferrer"
          >
            Mozilla Firefox
          </a>
        </li>
        <li>
          <a
            href="https://support.apple.com/en-us/HT201265"
            target="_blank"
            rel="noopener noreferrer"
          >
            Safari
          </a>
        </li>
        <li>
          <a
            href="https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09"
            target="_blank"
            rel="noopener noreferrer"
          >
            Microsoft Edge
          </a>
        </li>
      </ul>

      <h2>6. Changes to This Policy</h2>
      <p>
        We may update this Cookie Policy from time to time. Changes will be
        posted on this page with an updated "Last updated" date.
      </p>

      <h2>7. Contact</h2>
      <p>If you have questions about our use of cookies, please contact us:</p>
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
    
    </>
  ),
};
