import { createHash, randomUUID } from "node:crypto";
import type { DistributorBootstrapResult } from "@lifeos-portal/shared";

/**
 * D3D-A: one atomic install claim per subdomain, shared by every Portal instance (remote mode).
 *
 * An install claims its subdomain before anything is created, fixing the Master Distributor tenant
 * id and the exact bootstrap payload. MD's result is checkpointed on the claim (the Portal's durable
 * record of MD completion), and the claim is committed with the install id once the install is ready.
 * Master Distributor is idempotent per tenant id, so redoing a claim always reaches the same MD tenant.
 * - Same owner, app and domain, committed -> already installed (no new installation).
 * - Different owner, app or domain        -> conflict: the subdomain belongs to another installation.
 * - Claimed by a live attempt             -> in progress (caller retries).
 * - Claimed by a crashed attempt          -> taken over after its lease, with the stored tenant id,
 *                                            payload and any checkpointed MD result.
 * - Abandoned after a failure             -> taken over at once by the same owner.
 * - Released (nothing can exist at MD)    -> gone.
 */
export type InstallPayload = Record<string, unknown> & { tenantId: string; subdomain: string };

export type InstallClaimOutcome =
  | { kind: "claimed"; leaseToken: string; tenantId: string; payload: InstallPayload; bootstrap: DistributorBootstrapResult | null }
  | { kind: "committed"; installId: string; tenantId: string }
  | { kind: "conflict" }
  | { kind: "in_progress" };

export type InstallClaimInput = { subdomain: string; fingerprint: string; payload: InstallPayload; leaseMs: number };

export type InstallClaimStore = {
  claim(input: InstallClaimInput): Promise<InstallClaimOutcome>;
  /** Records MD's bootstrap result; false when this attempt no longer holds the claim. */
  checkpoint(subdomain: string, leaseToken: string, result: DistributorBootstrapResult): Promise<boolean>;
  /** Binds the claim to the ready install; false when this attempt no longer holds the claim. */
  commit(subdomain: string, leaseToken: string, installId: string): Promise<boolean>;
  /** Failure after MD may have acted: keep tenant id and checkpoint; the same owner may retry at once. */
  abandon(subdomain: string, leaseToken: string): Promise<void>;
  /** Failure before anything can exist at MD: drop the claim. */
  release(subdomain: string, leaseToken: string): Promise<void>;
};

/** What identifies the installation a subdomain is claimed for. Cosmetic fields are not part of it. */
export function installClaimFingerprint(input: { ownerSubject?: string; appId?: string; subdomain: string; customDomain?: string }): string {
  return createHash("sha256")
    .update(JSON.stringify([input.ownerSubject ?? "", input.appId ?? "", input.subdomain.toLowerCase(), input.customDomain?.toLowerCase() ?? ""]))
    .digest("hex");
}

type Row = { fingerprint: string; tenantId: string; payload: InstallPayload; state: "CLAIMED" | "COMMITTED"; leaseToken: string | null; claimedAt: number; bootstrap: DistributorBootstrapResult | null; installId: string | null };

function decide(row: { fingerprint: string; state: string; installId: string | null; tenantId: string }, input: InstallClaimInput, ageMs: number): InstallClaimOutcome | "take_over" {
  if (row.fingerprint !== input.fingerprint) return { kind: "conflict" };
  if (row.state === "COMMITTED") return { kind: "committed", installId: row.installId!, tenantId: row.tenantId };
  return ageMs < input.leaseMs ? { kind: "in_progress" } : "take_over";
}

/** Single-process store (development and tests). Same semantics as the PostgreSQL store. */
export class MemoryInstallClaimStore implements InstallClaimStore {
  private rows = new Map<string, Row>();

  async claim(input: InstallClaimInput): Promise<InstallClaimOutcome> {
    const now = Date.now();
    const key = input.subdomain.toLowerCase();
    const existing = this.rows.get(key);
    if (!existing) {
      const leaseToken = randomUUID();
      this.rows.set(key, { fingerprint: input.fingerprint, tenantId: input.payload.tenantId, payload: input.payload, state: "CLAIMED", leaseToken, claimedAt: now, bootstrap: null, installId: null });
      return { kind: "claimed", leaseToken, tenantId: input.payload.tenantId, payload: input.payload, bootstrap: null };
    }
    const decision = decide(existing, input, now - existing.claimedAt);
    if (decision !== "take_over") return decision;
    existing.leaseToken = randomUUID();
    existing.claimedAt = now;
    return { kind: "claimed", leaseToken: existing.leaseToken, tenantId: existing.tenantId, payload: existing.payload, bootstrap: existing.bootstrap };
  }

  private held(subdomain: string, leaseToken: string) {
    const row = this.rows.get(subdomain.toLowerCase());
    return row && row.state === "CLAIMED" && row.leaseToken === leaseToken ? row : undefined;
  }

  async checkpoint(subdomain: string, leaseToken: string, result: DistributorBootstrapResult) {
    const row = this.held(subdomain, leaseToken);
    if (!row) return false;
    row.bootstrap = result;
    return true;
  }

  async commit(subdomain: string, leaseToken: string, installId: string) {
    const row = this.held(subdomain, leaseToken);
    if (!row) return false;
    Object.assign(row, { state: "COMMITTED", installId, leaseToken: null });
    return true;
  }

  async abandon(subdomain: string, leaseToken: string) {
    const row = this.held(subdomain, leaseToken);
    if (row) row.claimedAt = 0;
  }

  async release(subdomain: string, leaseToken: string) {
    if (this.held(subdomain, leaseToken)) this.rows.delete(subdomain.toLowerCase());
  }
}

type Db = { query<R = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }> };
type PgRow = { fingerprint: string; tenant_id: string; payload: InstallPayload; state: "CLAIMED" | "COMMITTED"; lease_token: string | null; bootstrap: DistributorBootstrapResult | null; install_id: string | null; age_ms: string };

/** Cross-instance store on the Portal's PostgreSQL database (`portal.install_claims`). */
export class PostgresInstallClaimStore implements InstallClaimStore {
  constructor(private readonly db: Db) {}

  async claim(input: InstallClaimInput): Promise<InstallClaimOutcome> {
    const leaseToken = randomUUID();
    // Atomic: the subdomain primary key decides every race.
    const inserted = await this.db.query(
      `INSERT INTO portal.install_claims (subdomain, fingerprint, tenant_id, payload, state, lease_token, claimed_at)
       VALUES (lower($1), $2, $3, $4::jsonb, 'CLAIMED', $5, now()) ON CONFLICT DO NOTHING`,
      [input.subdomain, input.fingerprint, input.payload.tenantId, JSON.stringify(input.payload), leaseToken],
    );
    if (inserted.rowCount === 1) return { kind: "claimed", leaseToken, tenantId: input.payload.tenantId, payload: input.payload, bootstrap: null };
    const found = await this.db.query<PgRow>(
      `SELECT fingerprint, tenant_id, payload, state, lease_token, bootstrap, install_id,
              (EXTRACT(EPOCH FROM (now() - claimed_at)) * 1000)::bigint::text AS age_ms
       FROM portal.install_claims WHERE subdomain = lower($1)`,
      [input.subdomain],
    );
    const row = found.rows[0];
    // Released between the insert and the read: the caller retries.
    if (!row) return { kind: "in_progress" };
    const decision = decide({ fingerprint: row.fingerprint, state: row.state, installId: row.install_id, tenantId: row.tenant_id }, input, Number(row.age_ms));
    if (decision !== "take_over") return decision;
    // Stale or abandoned claim: take it over atomically, once, keeping the original tenant id.
    const taken = await this.db.query(
      `UPDATE portal.install_claims SET lease_token = $3, claimed_at = now()
       WHERE subdomain = lower($1) AND state = 'CLAIMED' AND lease_token IS NOT DISTINCT FROM $2`,
      [input.subdomain, row.lease_token, leaseToken],
    );
    return taken.rowCount === 1
      ? { kind: "claimed", leaseToken, tenantId: row.tenant_id, payload: row.payload, bootstrap: row.bootstrap }
      : { kind: "in_progress" };
  }

  async checkpoint(subdomain: string, leaseToken: string, result: DistributorBootstrapResult) {
    const updated = await this.db.query(
      `UPDATE portal.install_claims SET bootstrap = $3::jsonb WHERE subdomain = lower($1) AND state = 'CLAIMED' AND lease_token = $2`,
      [subdomain, leaseToken, JSON.stringify(result)],
    );
    return updated.rowCount === 1;
  }

  async commit(subdomain: string, leaseToken: string, installId: string) {
    const updated = await this.db.query(
      `UPDATE portal.install_claims SET state = 'COMMITTED', install_id = $3, committed_at = now(), lease_token = NULL
       WHERE subdomain = lower($1) AND state = 'CLAIMED' AND lease_token = $2`,
      [subdomain, leaseToken, installId],
    );
    return updated.rowCount === 1;
  }

  async abandon(subdomain: string, leaseToken: string) {
    await this.db.query(`UPDATE portal.install_claims SET claimed_at = 'epoch' WHERE subdomain = lower($1) AND state = 'CLAIMED' AND lease_token = $2`, [subdomain, leaseToken]);
  }

  async release(subdomain: string, leaseToken: string) {
    await this.db.query(`DELETE FROM portal.install_claims WHERE subdomain = lower($1) AND state = 'CLAIMED' AND lease_token = $2`, [subdomain, leaseToken]);
  }
}
