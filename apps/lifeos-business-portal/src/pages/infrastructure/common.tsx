import type { DomainInfrastructureStatus } from "@lifeos-portal/shared";
import { ApiError } from "../../lib/api";

const FRIENDLY: Record<string, string> = {
  guest_not_permitted: "Sign in with your Portal account. Guest/test sessions cannot change domains.",
  insecure_auth_mode: "Production domain changes are locked while development sign-in is enabled on the gateway.",
  origin_not_allowed: "This page is not a trusted origin for domain changes.",
  master_device_required: "This action needs TrustID confirmation on your bound Master Device.",
  biometric_required: "This action needs TrustID biometric confirmation.",
};

export function describeError(err: unknown, fallback: string) {
  if (err instanceof ApiError) return FRIENDLY[err.code] ?? err.message;
  return err instanceof Error ? err.message : fallback;
}

export function ProviderBanner({ status }: { status: DomainInfrastructureStatus | null }) {
  if (!status) return null;
  const sandbox = status.environment === "SANDBOX";
  return (
    <div className={status.capability === "READY" ? "banner-info" : "banner-error"}>
      <strong>
        Provider: {status.providerLabel} · Mode: {sandbox ? "SANDBOX (test registrations, no real domains)" : "PRODUCTION"}
      </strong>
      {status.capability !== "READY" ? (
        <p className="small">
          Domain capability is {status.capability === "NOT_CONFIGURED" ? "not configured" : "misconfigured"} on the
          gateway. Search and purchase are unavailable; the rest of Portal is unaffected.
          {status.missing?.length ? (
            <>
              {" "}
              Missing: <span className="mono">{status.missing.join(", ")}</span>
            </>
          ) : null}
        </p>
      ) : null}
      {status.insecureAuth ? (
        <p className="small">
          Production domain changes are locked: the gateway still allows development sign-in. Turn off
          BYPASS_TRUST_ID and use a real owner sign-in first.
        </p>
      ) : !sandbox && !status.purchasesEnabled ? (
        <p className="small">Production purchases are switched off (DOMAIN_PURCHASES_ENABLED).</p>
      ) : null}
      <p className="small muted">
        Purchase mode: owner/admin test purchase. Payment is not collected from customers yet; the registrar account
        balance pays for registrations.
      </p>
    </div>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const tone =
    value === "ACTIVE" || value === "REGISTERED" || value === "OWNERSHIP_VERIFIED" || value === "VERIFIED"
      ? " badge-ok"
      : value === "FAILED" || value === "EXPIRED" || value === "SUSPENDED" || value === "REJECTED"
        ? " badge-bad"
        : "";
  return <span className={`badge${tone}`}>{value.replaceAll("_", " ")}</span>;
}
