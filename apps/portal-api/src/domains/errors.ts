import type { DomainErrorCode } from "@lifeos-portal/shared";

const STATUS: Record<DomainErrorCode, number> = {
  DOMAIN_UNAVAILABLE: 409,
  DOMAIN_INVALID: 400,
  QUOTE_EXPIRED: 409,
  PREMIUM_DOMAIN: 409,
  PRICE_UNAVAILABLE: 409,
  INVALID_REGISTRANT: 400,
  PROVIDER_NOT_CONFIGURED: 503,
  PROVIDER_AUTH_FAILED: 502,
  PROVIDER_IP_NOT_WHITELISTED: 502,
  PROVIDER_UNAVAILABLE: 503,
  PROVIDER_ERROR: 502,
  INSUFFICIENT_PROVIDER_BALANCE: 402,
  REGISTRATION_REJECTED: 422,
  REGISTRATION_UNCERTAIN: 202,
  PURCHASES_DISABLED: 403,
  PURCHASE_IN_PROGRESS: 409,
  CONFIRMATION_MISMATCH: 409,
  DNS_NOT_PROVIDER_MANAGED: 409,
  DNS_READ_FAILED: 502,
  DNS_WRITE_FAILED: 502,
  DNS_VERIFICATION_FAILED: 502,
  DNS_UNSAFE_MUTATION: 422,
  HOST_BINDING_FAILED: 502,
  OWNERSHIP_UNVERIFIED: 409,
  TLS_PENDING: 202,
  TLS_FAILED: 502,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  CONFLICT: 409,
};

const USER_MESSAGE: Partial<Record<DomainErrorCode, string>> = {
  DOMAIN_UNAVAILABLE: "That domain is not available for registration.",
  QUOTE_EXPIRED: "This price quote has expired. Get a fresh quote before purchasing.",
  PREMIUM_DOMAIN: "This is a premium domain with special pricing.",
  PRICE_UNAVAILABLE: "The registrar did not return a reliable price, so this domain cannot be purchased yet.",
  INVALID_REGISTRANT: "Registrant details are incomplete or invalid.",
  PROVIDER_NOT_CONFIGURED: "Domain provider is not configured on the server.",
  PROVIDER_AUTH_FAILED: "The domain provider rejected the server credentials.",
  PROVIDER_IP_NOT_WHITELISTED: "The domain provider rejected this server's IP address (not whitelisted).",
  PROVIDER_UNAVAILABLE: "The domain provider is temporarily unreachable.",
  PROVIDER_ERROR: "The domain provider returned an error.",
  INSUFFICIENT_PROVIDER_BALANCE: "The registrar account does not have enough balance for this purchase.",
  REGISTRATION_REJECTED: "The registrar rejected the registration.",
  REGISTRATION_UNCERTAIN:
    "The registrar did not confirm the outcome. Nothing will be resubmitted until the registration state is reconciled.",
  PURCHASES_DISABLED: "Production domain purchases are not enabled on this server.",
  PURCHASE_IN_PROGRESS: "A purchase for this domain is already in progress.",
  CONFIRMATION_MISMATCH: "The confirmed domain or total does not match the quote.",
  DNS_NOT_PROVIDER_MANAGED: "This domain does not use the registrar's DNS, so records must be configured manually.",
  DNS_READ_FAILED: "Could not read the current DNS records.",
  DNS_WRITE_FAILED: "Could not write DNS records.",
  DNS_VERIFICATION_FAILED: "DNS records did not match after writing.",
  DNS_UNSAFE_MUTATION: "That DNS change would remove records it should preserve.",
  HOST_BINDING_FAILED: "Could not attach the domain to the hosting provider.",
  OWNERSHIP_UNVERIFIED: "Domain ownership has not been verified yet.",
  TLS_PENDING: "HTTPS certificate is not active yet.",
  TLS_FAILED: "HTTPS verification failed.",
  NOT_FOUND: "Not found.",
  FORBIDDEN: "You do not have authority for this domain action.",
};

/** Normalized domain error. `diagnostic` is sanitized provider detail, never secrets or raw XML. */
export class DomainInfraError extends Error {
  readonly statusCode: number;
  constructor(
    readonly code: DomainErrorCode,
    message?: string,
    readonly diagnostic?: string,
  ) {
    super(message ?? USER_MESSAGE[code] ?? code);
    this.name = "DomainInfraError";
    this.statusCode = STATUS[code];
  }
}

export function domainErrorMessage(code: DomainErrorCode) {
  return USER_MESSAGE[code] ?? code;
}
