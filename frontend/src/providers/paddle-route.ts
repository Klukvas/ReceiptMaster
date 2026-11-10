// The public share page (/r/:token) is opened by a document's recipient, who is not a customer.
// Loading the payment SDK there would hand a third-party script the capability URL and the
// recipient's visit for nothing.
const PUBLIC_SHARE_PREFIX = "/r/";

// The router matches paths case-insensitively, so /R/<token> renders the same public page.
export const isPaddleAllowedOn = (pathname: string): boolean =>
  !pathname.toLowerCase().startsWith(PUBLIC_SHARE_PREFIX);
