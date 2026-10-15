import type { PortalStore } from "../store.js";
import { signServiceToken, type ServiceSigner } from "../lib/service-token.js";

export const DDI_INSTALL_EVENTS_CONTRACT = "portal.install-events.v1";
const MAX_ATTEMPTS = 50;

/**
 * Delivers the durable install-state outbox to DDI (at-least-once). DDI is
 * idempotent by event id and ordered by sequence, so retries and reordering are
 * safe. A 4xx contract rejection is terminal (DEAD); auth failures, 5xx and
 * network errors back off and retry. Events stay in the store until delivered,
 * and DDI's reconciliation covers anything that never arrives.
 */
export async function deliverDdiInstallEvents(input: { store: PortalStore; url: string; signer: ServiceSigner; fetchImpl?: typeof fetch; now?: () => Date; limit?: number; timeoutMs?: number }) {
  const now = input.now?.() ?? new Date();
  const summary = { delivered: 0, retried: 0, dead: 0 };
  const due = input.store.listDdiInstallEvents().filter((event) => event.status === "PENDING" && Date.parse(event.nextAttemptAt) <= now.getTime()).slice(0, input.limit ?? 50);
  const path = new URL(input.url).pathname;
  for (const event of due) {
    const attempts = event.attempts + 1;
    let status = 0;
    let outcome: string | undefined;
    try {
      const response = await (input.fetchImpl ?? fetch)(input.url, {
        method: "POST",
        signal: AbortSignal.timeout(input.timeoutMs ?? 10_000),
        headers: { "content-type": "application/json", authorization: `Bearer ${signServiceToken(input.signer, { audience: "ddi", method: "POST", path })}`, "x-correlation-id": event.correlationId },
        body: JSON.stringify({ contractVersion: DDI_INSTALL_EVENTS_CONTRACT, eventId: event.id, type: event.type, installId: event.installId, externalReference: event.externalReference, ownerSubject: event.ownerSubject, sequence: event.sequence, state: event.state, correlationId: event.correlationId, occurredAt: event.occurredAt }),
      });
      status = response.status;
      const body = (await response.json().catch(() => ({}))) as { outcome?: string; code?: string };
      outcome = body.outcome ?? body.code;
    } catch {
      status = 0;
    }
    if (status >= 200 && status < 300) {
      input.store.updateDdiInstallEvent(event.id, { status: "DELIVERED", attempts, deliveredAt: now.toISOString(), outcome, lastError: undefined });
      summary.delivered++;
    } else if ((status === 400 || status === 422) || attempts >= MAX_ATTEMPTS) {
      input.store.updateDdiInstallEvent(event.id, { status: "DEAD", attempts, lastError: outcome ?? `HTTP_${status}` });
      summary.dead++;
    } else {
      const delay = Math.min(1_000 * 2 ** (attempts - 1), 15 * 60_000);
      input.store.updateDdiInstallEvent(event.id, { attempts, nextAttemptAt: new Date(now.getTime() + delay).toISOString(), lastError: status ? `HTTP_${status}` : "NETWORK" });
      summary.retried++;
    }
  }
  return summary;
}
