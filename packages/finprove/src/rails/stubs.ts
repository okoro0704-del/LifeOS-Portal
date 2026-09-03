import type { FinproveRailAdapter, FinproveRailName } from "../contracts.js";
import { FundzmanRailAdapter } from "../adapters/fundzman.adapter.js";

/**
 * Named rails for future wiring. Until a provider is configured they
 * delegate to the hidden FundzMan adapter so callers never talk to a rail.
 */
export function createRailAdapter(name: FinproveRailName): FinproveRailAdapter {
  const local = new FundzmanRailAdapter();
  return {
    name,
    createIntent: (payload) => local.createIntent(payload),
    processDisbursement: (payload) => local.processDisbursement(payload),
    verifyWebhook: (headers, body) => local.verifyWebhook(headers, body),
  };
}
