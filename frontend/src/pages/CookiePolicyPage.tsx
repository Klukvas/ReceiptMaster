import { LegalLayout } from"../components/legal/LegalLayout";

const lastUpdated = new Date("2026-03-01");

export const CookiePolicyPage = () => {
 return (
 <LegalLayout title="Cookie Policy" lastUpdated={lastUpdated}>
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

 <h3>2.1 Strictly Necessary Cookies</h3>
 <p>
 These cookies are essential for the Service to function and cannot be
 disabled. They include:
 </p>
 <div className="overflow-x-auto">
 <table>
 <thead>
 <tr>
 <th>Cookie</th>
 <th>Purpose</th>
 <th>Duration</th>
 </tr>
 </thead>
 <tbody>
 <tr>
 <td>CSRF token</td>
 <td>Prevents cross-site request forgery attacks</td>
 <td>Session</td>
 </tr>
 <tr>
 <td>Theme preference</td>
 <td>Remembers your light/dark mode preference</td>
 <td>1 year</td>
 </tr>
 <tr>
 <td>Language preference</td>
 <td>Remembers your selected language</td>
 <td>1 year</td>
 </tr>
 </tbody>
 </table>
 </div>

 <h3>2.2 Functional Cookies</h3>
 <p>These cookies enable enhanced functionality and personalization:</p>
 <div className="overflow-x-auto">
 <table>
 <thead>
 <tr>
 <th>Cookie</th>
 <th>Purpose</th>
 <th>Duration</th>
 </tr>
 </thead>
 <tbody>
 <tr>
 <td>UI state</td>
 <td>
 Remembers sidebar state, table preferences, and filter settings
 </td>
 <td>1 year</td>
 </tr>
 </tbody>
 </table>
 </div>

 <h3>2.3 Third-Party Cookies</h3>
 <p>
 When you interact with the Paddle checkout overlay, Paddle may set
 cookies for payment processing and fraud prevention. These cookies are
 governed by{""}
 <a
 href="https://www.paddle.com/legal/privacy"
 target="_blank"
 rel="noopener noreferrer"
 >
 Paddle's Privacy Policy
 </a>
 .
 </p>

 <h2>3. Local Storage</h2>
 <p>In addition to cookies, we use browser local storage to store:</p>
 <ul>
 <li>
 Authentication tokens (JWT) — keeps you signed in to your account
 </li>
 <li>User preferences (theme, language)</li>
 <li>Cached application state for performance</li>
 </ul>
 <p>
 Local storage data remains on your device until you clear your browser
 data or sign out of the Service.
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
 Please note that blocking strictly necessary cookies may prevent the
 Service from functioning correctly (e.g., you will not be able to stay
 signed in).
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
 posted on this page with an updated"Last updated" date.
 </p>

 <h2>7. Contact</h2>
 <p>If you have questions about our use of cookies, please contact us:</p>
 <ul>
 <li>
 <strong>Email:</strong>{""}
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
