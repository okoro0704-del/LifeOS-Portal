import { randomUUID } from "node:crypto";

/**
 * D3C-C: atomic idempotency claims for DDI provisioning.
 *
 * A request first claims its Idempotency-Key, then performs the binding, then commits.
 * - Same key, same fingerprint, committed  -> the original reference (replay).
 * - Same key, different fingerprint        -> conflict.
 * - Another key already holding the install -> install conflict (one binding per install).
 * - Same key claimed by a live request      -> in progress (caller retries).
 * - Same key claimed by a crashed request   -> taken over once its lease expires; the
 *   binding is idempotent for the same license, so redoing it is safe.
 */
export type ClaimOutcome =
  | { kind: "claimed"; leaseToken: string }
  | { kind: "committed"; reference: string }
  | { kind: "conflict" }
  | { kind: "install_conflict" }
  | { kind: "in_progress" };

export type ClaimInput = { key: string; fingerprint: string; installId: string; licenseId: string; leaseMs: number };

export type ProvisioningClaimStore = {
  /** Read-only: a committed outcome for this key, or a fingerprint conflict. Never creates a claim. */
  peek(key: string, fingerprint: string): Promise<{ kind: "committed"; reference: string } | { kind: "conflict" } | null>;
  claim(input: ClaimInput): Promise<ClaimOutcome>;
  commit(key: string, leaseToken: string, reference: string): Promise<boolean>;
};

type Row = { key: string; fingerprint: string; installId: string; licenseId: string; state: "CLAIMED" | "COMMITTED"; leaseToken: string | null; claimedAt: number; reference: string | null };

/** Single-process store (development and tests). Same semantics as the PostgreSQL store. */
export class MemoryProvisioningClaimStore implements ProvisioningClaimStore {
  private rows = new Map<string, Row>();

  async peek(key: string, fingerprint: string) {
    const row = this.rows.get(key);
    if (!row) return null;
    if (row.fingerprint !== fingerprint) return { kind: "conflict" as const };
    return row.state === "COMMITTED" ? { kind: "committed" as const, reference: row.reference! } : null;
  }

  async claim(input: ClaimInput): Promise<ClaimOutcome> {
    const now = Date.now();
    const existing = this.rows.get(input.key);
    if (!existing) {
      if ([...this.rows.values()].some((row) => row.installId === input.installId)) return { kind: "install_conflict" };
      const leaseToken = randomUUID();
      this.rows.set(input.key, { key: input.key, fingerprint: input.fingerprint, installId: input.installId, licenseId: input.licenseId, state: "CLAIMED", leaseToken, claimedAt: now, reference: null });
      return { kind: "claimed", leaseToken };
    }
    return decide(existing, input, now, () => {
      const leaseToken = randomUUID();
      existing.leaseToken = leaseToken;
      existing.claimedAt = now;
      return leaseToken;
    });
  }

  async commit(key: string, leaseToken: string, reference: string) {
    const row = this.rows.get(key);
    if (!row || row.state !== "CLAIMED" || row.leaseToken !== leaseToken) return false;
    row.state = "COMMITTED";
    row.reference = reference;
    row.leaseToken = null;
    return true;
  }
}

function decide(row: Row, input: ClaimInput, now: number, takeOver: () => string | null): ClaimOutcome {
  if (row.fingerprint !== input.fingerprint) return { kind: "conflict" };
  if (row.state === "COMMITTED") return { kind: "committed", reference: row.reference! };
  if (now - row.claimedAt < input.leaseMs) return { kind: "in_progress" };
  const leaseToken = takeOver();
  return leaseToken ? { kind: "claimed", leaseToken } : { kind: "in_progress" };
}

type Db = { query<R = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }> };

/** Cross-instance store on the Portal's existing PostgreSQL database. */
export class PostgresProvisioningClaimStore implements ProvisioningClaimStore {
  constructor(private readonly db: Db) {}

  async peek(key: string, fingerprint: string) {
    const found = await this.db.query<{ fingerprint: string; state: string; reference: string | null }>(`SELECT fingerprint, state, reference FROM portal.ddi_provisioning_claims WHERE idempotency_key = $1`, [key]);
    const row = found.rows[0];
    if (!row) return null;
    if (row.fingerprint !== fingerprint) return { kind: "conflict" as const };
    return row.state === "COMMITTED" ? { kind: "committed" as const, reference: row.reference! } : null;
  }

  async claim(input: ClaimInput): Promise<ClaimOutcome> {
    const leaseToken = randomUUID();
    // Atomic: the primary key and the install index decide every race.
    const inserted = await this.db.query(
      `INSERT INTO portal.ddi_provisioning_claims (idempotency_key, fingerprint, install_id, license_id, state, lease_token, claimed_at)
       VALUES ($1, $2, $3, $4, 'CLAIMED', $5, now()) ON CONFLICT DO NOTHING`,
      [input.key, input.fingerprint, input.installId, input.licenseId, leaseToken],
    );
    if (inserted.rowCount === 1) return { kind: "claimed", leaseToken };
    const found = await this.db.query<{ fingerprint: string; state: "CLAIMED" | "COMMITTED"; lease_token: string | null; reference: string | null; age_ms: string }>(
      `SELECT fingerprint, state, lease_token, reference, (EXTRACT(EPOCH FROM (now() - claimed_at)) * 1000)::bigint::text AS age_ms
       FROM portal.ddi_provisioning_claims WHERE idempotency_key = $1`,
      [input.key],
    );
    const row = found.rows[0];
    // The key is free, so another key holds this install.
    if (!row) return { kind: "install_conflict" };
    if (row.fingerprint !== input.fingerprint) return { kind: "conflict" };
    if (row.state === "COMMITTED") return { kind: "committed", reference: row.reference! };
    if (Number(row.age_ms) < input.leaseMs) return { kind: "in_progress" };
    // Stale claim (crashed or timed-out request): take it over atomically, once.
    const taken = await this.db.query(
      `UPDATE portal.ddi_provisioning_claims SET lease_token = $3, claimed_at = now()
       WHERE idempotency_key = $1 AND state = 'CLAIMED' AND lease_token IS NOT DISTINCT FROM $2`,
      [input.key, row.lease_token, leaseToken],
    );
    return taken.rowCount === 1 ? { kind: "claimed", leaseToken } : { kind: "in_progress" };
  }

  async commit(key: string, leaseToken: string, reference: string) {
    const result = await this.db.query(
      `UPDATE portal.ddi_provisioning_claims SET state = 'COMMITTED', reference = $3, committed_at = now(), lease_token = NULL
       WHERE idempotency_key = $1 AND state = 'CLAIMED' AND lease_token = $2`,
      [key, leaseToken, reference],
    );
    return result.rowCount === 1;
  }
}
