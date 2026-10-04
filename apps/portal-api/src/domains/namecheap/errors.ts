import type { DomainErrorCode } from "@lifeos-portal/shared";
import { DomainInfraError } from "../errors.js";

/** Global authentication failures documented for every Namecheap command. */
const AUTH_ERRORS = new Set([
  "1010101", // ApiUser missing
  "1010102", // ApiKey missing
  "1011102", // ApiKey invalid
  "1017101", // ApiUser disabled/locked
  "1019103", // UserName not available
  "1016103", // UserName unauthorized
  "1017103", // UserName disabled/locked
  "1017411", // too many login attempts
  "1050900", // unknown error validating ApiUser
  "2033409", // chargeable order for UserName not found (auth phase)
]);

const IP_ERRORS = new Set([
  "1010105", // ClientIp missing
  "1011105", // ClientIp invalid
  "1011150", // RequestIP invalid (not whitelisted)
  "1017150", // RequestIP disabled/locked
  "1017105", // ClientIp disabled/locked
]);

const CREATE_UNAVAILABLE = new Set(["3019166", "4019166"]);
const CREATE_INVALID_REGISTRANT = new Set(["2015182", "2010323", "2005", "2011322"]);
/** Provider says something failed but cannot say whether the order exists: reconcile, never resubmit. */
const CREATE_AMBIGUOUS = new Set(["3031166", "3031900", "5050900", "4023166", "4026312", "5026900", "3028166"]);

export type NamecheapCommandContext = "check" | "pricing" | "create" | "list" | "info" | "renew" | "dns.get" | "dns.set" | "dns.default";

export function mapNamecheapErrors(
  errors: Array<{ number: string; message: string }>,
  context: NamecheapCommandContext,
  sanitize: (value: string) => string,
): DomainInfraError {
  const diagnostic = sanitize(
    errors.map((e) => `${e.number || "?"}: ${e.message}`.slice(0, 300)).join(" | ") || "provider returned ERROR",
  );
  const numbers = errors.map((e) => e.number);
  const text = errors.map((e) => e.message).join(" ");
  const has = (set: Set<string>) => numbers.some((n) => set.has(n));

  let code: DomainErrorCode;
  if (has(IP_ERRORS) || /invalid request ip|ip.*whitelist/i.test(text)) code = "PROVIDER_IP_NOT_WHITELISTED";
  else if (has(AUTH_ERRORS) || /api ?key is invalid|apiuser|authentication/i.test(text)) code = "PROVIDER_AUTH_FAILED";
  else if (context === "create") {
    if (has(CREATE_UNAVAILABLE)) code = "DOMAIN_UNAVAILABLE";
    else if (/insufficient|not enough (funds|balance)|balance/i.test(text)) code = "INSUFFICIENT_PROVIDER_BALANCE";
    else if (has(CREATE_INVALID_REGISTRANT)) code = "INVALID_REGISTRANT";
    else if (numbers.includes("2515610")) code = "QUOTE_EXPIRED";
    else if (numbers.includes("2515623")) code = "PREMIUM_DOMAIN";
    else if (has(CREATE_AMBIGUOUS)) code = "REGISTRATION_UNCERTAIN";
    else code = "REGISTRATION_REJECTED";
  } else if (context === "dns.get") {
    code = numbers.includes("2030288") ? "DNS_NOT_PROVIDER_MANAGED" : "DNS_READ_FAILED";
  } else if (context === "dns.set" || context === "dns.default") {
    code = "DNS_WRITE_FAILED";
  } else {
    code = "PROVIDER_ERROR";
  }
  const error = new DomainInfraError(code, undefined, diagnostic);
  error.registrarErrors = numbers.filter((n) => /^\d{1,10}$/.test(n));
  return error;
}
