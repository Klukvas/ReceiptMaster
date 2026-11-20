// The public share page (/r/:token) is opened by a document's recipient, who is not a customer:
// nothing about billing is asked for or shown there.
const PUBLIC_SHARE_PREFIX = "/r/";

// The router matches paths case-insensitively, so /R/<token> renders the same public page.
export const isBillingAllowedOn = (pathname: string): boolean =>
  !pathname.toLowerCase().startsWith(PUBLIC_SHARE_PREFIX);
