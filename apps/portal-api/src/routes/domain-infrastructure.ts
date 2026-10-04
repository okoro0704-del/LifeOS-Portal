import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z, ZodError } from "zod";
import { config } from "../config.js";
import { hasRole, requireSession } from "../lib/auth.js";
import { isFirstPartyOrigin } from "../lib/origins.js";
import { isDevAuthEnabled } from "../lib/dev-auth.js";
import { GUEST_ADMIN_ID, GUEST_TESTER_ID } from "../lib/guest-auth.js";
import { HttpError } from "../lib/http.js";
import { identitySubject } from "../lib/local-auth.js";
import { checkMasterDeviceBinding } from "../services/trustid-stepup.js";
import { DomainInfraError } from "../domains/errors.js";
import type { DomainActor, DomainInfrastructureService } from "../domains/service.js";
import { registrantProfileInputSchema } from "../domains/registrant.js";

const PREFIX = "/v1/infrastructure/domains";

type Authority = "read" | "write" | "strong";

function isGuestPrincipal(req: FastifyRequest) {
  const user = req.portalUser;
  if (!user) return true;
  if (user.id === GUEST_TESTER_ID || user.id === GUEST_ADMIN_ID) return true;
  return !req.portalSessionToken;
}

function headerSession(req: FastifyRequest) {
  const header = req.headers[config.sessionHeaderName];
  return (typeof header === "string" && header.trim().length > 0) || Boolean(req.headers.authorization?.startsWith("Portal "));
}

function actorOf(req: FastifyRequest): DomainActor {
  const user = req.portalUser!;
  return {
    userId: user.id,
    subject: identitySubject(user),
    isAdmin: user.role === "ADMIN" || hasRole(user, "platform_admin"),
  };
}

/**
 * domain.search/quote/dns.read → read
 * domain.bind / registrant / connect / purchase-intent → write (real session, trusted origin)
 * domain.purchase / domain.dns.write (manual) → strong (+ platform admin + TrustID Master Device step-up)
 *
 * `insecureAuth`: PRODUCTION registrar + development sign-in enabled. /auth/dev-session can mint
 * admin sessions for anyone in that mode, so every production domain change is refused.
 */
async function authorize(
  req: FastifyRequest,
  reply: FastifyReply,
  level: Authority,
  insecureAuth = false,
): Promise<DomainActor | null> {
  if (!requireSession(req, reply)) return null;
  if (level === "read") return actorOf(req);

  if (isGuestPrincipal(req)) {
    reply.code(403).send({
      error: "guest_not_permitted",
      message: "Sign in with your Portal account. Guest/test sessions cannot change domains.",
    });
    return null;
  }
  if (insecureAuth) {
    reply.code(403).send({
      error: "insecure_auth_mode",
      message:
        "Production domain changes are disabled while development sign-in (BYPASS_TRUST_ID / dev-session) is enabled on the gateway.",
    });
    return null;
  }
  const origin = req.headers.origin;
  if (origin) {
    if (!isFirstPartyOrigin(origin)) {
      reply.code(403).send({ error: "origin_not_allowed", message: "Request origin is not trusted for domain changes." });
      return null;
    }
  } else if (!headerSession(req)) {
    reply.code(403).send({ error: "origin_required", message: "Cookie-only domain changes require a trusted Origin." });
    return null;
  }
  if (level === "strong") {
    const actor = actorOf(req);
    if (!actor.isAdmin) {
      reply.code(403).send({
        error: "FORBIDDEN",
        message: "Domain purchases and manual DNS changes require Portal owner/administrator authority.",
      });
      return null;
    }
    if (!(await checkMasterDeviceBinding(req, reply))) return null;
  }
  return actorOf(req);
}

function sendError(req: FastifyRequest, reply: FastifyReply, err: unknown) {
  if (err instanceof DomainInfraError) {
    if (err.diagnostic) req.log?.warn?.({ domainError: err.code, diagnostic: err.diagnostic }, "domain infrastructure error");
    const admin = req.portalUser && (req.portalUser.role === "ADMIN" || hasRole(req.portalUser, "platform_admin"));
    return reply.code(err.statusCode === 202 ? 409 : err.statusCode).send({
      error: err.code,
      message: err.message,
      ...(admin && err.diagnostic ? { diagnostic: err.diagnostic } : {}),
    });
  }
  if (err instanceof ZodError) {
    return reply.code(400).send({
      error: "validation_error",
      message: err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "),
    });
  }
  if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.code, message: err.message });
  req.log?.error?.({ err: err instanceof Error ? err.message : String(err) }, "domain infrastructure failure");
  return reply.code(500).send({ error: "internal_error", message: "Domain infrastructure request failed." });
}

const searchBody = z.object({ query: z.string().min(1).max(253), tlds: z.array(z.string().max(24)).max(12).optional() });
const quoteBody = z.object({ domain: z.string().min(3).max(253), years: z.number().int().min(1).max(1).optional() });
const intentBody = z.object({ quoteId: z.string().min(3).max(64), idempotencyKey: z.string().min(16).max(128) });
const confirmBody = z.object({
  confirmDomain: z.string().min(3).max(253),
  confirmTotal: z.object({ amount: z.string().max(24), currency: z.string().length(3) }),
  registrantProfileId: z.string().min(3).max(64),
  requestPrivacy: z.boolean().default(true),
});
const connectBody = z.object({ domain: z.string().min(3).max(253) });
const bindingBody = z.object({
  targetId: z.string().min(1).max(64),
  subdomain: z.string().max(63).nullable().optional(),
  includeWww: z.boolean().optional(),
});
const dnsRecord = z.object({
  name: z.string().min(1).max(253),
  type: z.enum(["A", "AAAA", "ALIAS", "CAA", "CNAME", "MX", "MXE", "NS", "TXT", "URL", "URL301", "FRAME"]),
  address: z.string().min(1).max(2048),
  ttl: z.number().int().min(60).max(60000).default(1800),
  mxPref: z.number().int().min(0).max(65535).optional(),
});
const dnsBody = z.object({
  changes: z
    .array(
      z.discriminatedUnion("op", [
        z.object({ op: z.literal("upsert"), record: dnsRecord }),
        z.object({ op: z.literal("delete"), record: dnsRecord.pick({ name: true, type: true, address: true }) }),
      ]),
    )
    .min(1)
    .max(20),
});

export type DomainRouteOptions = {
  /** Defaults to the gateway's real dev-session switch. */
  devAuthEnabled?: () => boolean;
};

export async function registerDomainInfrastructureRoutes(
  app: FastifyInstance,
  service: DomainInfrastructureService,
  options: DomainRouteOptions = {},
) {
  const devAuthEnabled = options.devAuthEnabled ?? (() => isDevAuthEnabled(config));
  const insecureAuth = () => service.status(null).environment === "PRODUCTION" && devAuthEnabled();
  const guard = (req: FastifyRequest, reply: FastifyReply, level: Authority) =>
    authorize(req, reply, level, insecureAuth());

  app.get(`${PREFIX}/status`, async (req, reply) => {
    if (!requireSession(req, reply)) return;
    const status = service.status(actorOf(req));
    return { status: insecureAuth() ? { ...status, purchasesEnabled: false, insecureAuth: true } : status };
  });

  app.get(`${PREFIX}/status/egress`, async (req, reply) => {
    const actor = await guard(req, reply, "read");
    if (!actor) return;
    if (!actor.isAdmin) return reply.code(403).send({ error: "FORBIDDEN", message: "Administrator access required." });
    if (process.env.NODE_ENV === "test") return { observedIp: null, note: "network disabled in tests" };
    try {
      const res = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(8000) });
      const body = (await res.json()) as { ip?: string };
      return {
        observedIp: body.ip ?? null,
        note: "A single observation does not prove a static IP. Whitelist only a provider-guaranteed static egress IPv4.",
      };
    } catch {
      return { observedIp: null, note: "Could not observe egress IP." };
    }
  });

  app.post(`${PREFIX}/search`, async (req, reply) => {
    const actor = await guard(req, reply, "read");
    if (!actor) return;
    try {
      const body = searchBody.parse(req.body ?? {});
      return { results: await service.search(actor, body.query, body.tlds) };
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.post(`${PREFIX}/quotes`, async (req, reply) => {
    const actor = await guard(req, reply, "read");
    if (!actor) return;
    try {
      const body = quoteBody.parse(req.body ?? {});
      return { quote: await service.createQuote(actor, body.domain, body.years ?? 1) };
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.get(`${PREFIX}/quotes/:id`, async (req, reply) => {
    const actor = await guard(req, reply, "read");
    if (!actor) return;
    try {
      return { quote: service.getQuote(actor, (req.params as { id: string }).id) };
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.post(`${PREFIX}/purchase-intents`, async (req, reply) => {
    const actor = await guard(req, reply, "write");
    if (!actor) return;
    try {
      const body = intentBody.parse(req.body ?? {});
      return { intent: service.createIntent(actor, body) };
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.get(`${PREFIX}/purchase-intents/:id`, async (req, reply) => {
    const actor = await guard(req, reply, "read");
    if (!actor) return;
    try {
      return { intent: service.getIntent(actor, (req.params as { id: string }).id) };
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.post(`${PREFIX}/purchase-intents/:id/confirm`, async (req, reply) => {
    const actor = await guard(req, reply, "strong");
    if (!actor) return;
    try {
      const body = confirmBody.parse(req.body ?? {});
      return { intent: await service.confirmIntent(actor, (req.params as { id: string }).id, body) };
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.post(`${PREFIX}/purchase-intents/:id/reconcile`, async (req, reply) => {
    const actor = await guard(req, reply, "write");
    if (!actor) return;
    try {
      return { intent: await service.reconcileIntent(actor, (req.params as { id: string }).id) };
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.post(`${PREFIX}/purchase-intents/:id/cancel`, async (req, reply) => {
    const actor = await guard(req, reply, "write");
    if (!actor) return;
    try {
      return { intent: service.cancelIntent(actor, (req.params as { id: string }).id) };
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.get(`${PREFIX}/registrant-profiles`, async (req, reply) => {
    const actor = await guard(req, reply, "read");
    if (!actor) return;
    return { profiles: service.listRegistrants(actor) };
  });

  app.get(`${PREFIX}/registrant-profiles/:id`, async (req, reply) => {
    const actor = await guard(req, reply, "write");
    if (!actor) return;
    try {
      return { profile: service.getRegistrant(actor, (req.params as { id: string }).id) };
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.post(`${PREFIX}/registrant-profiles`, async (req, reply) => {
    const actor = await guard(req, reply, "write");
    if (!actor) return;
    try {
      return { profile: service.saveRegistrant(actor, registrantProfileInputSchema.parse(req.body ?? {})) };
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.put(`${PREFIX}/registrant-profiles/:id`, async (req, reply) => {
    const actor = await guard(req, reply, "write");
    if (!actor) return;
    try {
      return {
        profile: service.saveRegistrant(
          actor,
          registrantProfileInputSchema.parse(req.body ?? {}),
          (req.params as { id: string }).id,
        ),
      };
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.get(`${PREFIX}/targets`, async (req, reply) => {
    const actor = await guard(req, reply, "read");
    if (!actor) return;
    return { targets: service.listTargets(actor) };
  });

  app.get(`${PREFIX}/audit`, async (req, reply) => {
    const actor = await guard(req, reply, "read");
    if (!actor) return;
    return { events: service.listAudit(actor) };
  });

  app.get(PREFIX, async (req, reply) => {
    const actor = await guard(req, reply, "read");
    if (!actor) return;
    return { domains: service.listDomains(actor) };
  });

  app.post(`${PREFIX}/connect`, async (req, reply) => {
    const actor = await guard(req, reply, "write");
    if (!actor) return;
    try {
      return { domain: service.connectExisting(actor, connectBody.parse(req.body ?? {}).domain) };
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.get(`${PREFIX}/:id`, async (req, reply) => {
    const actor = await guard(req, reply, "read");
    if (!actor) return;
    try {
      return service.domainDetail(actor, (req.params as { id: string }).id);
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.post(`${PREFIX}/:id/refresh`, async (req, reply) => {
    const actor = await guard(req, reply, "write");
    if (!actor) return;
    try {
      return { domain: await service.refreshDomain(actor, (req.params as { id: string }).id) };
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.post(`${PREFIX}/:id/verify-ownership`, async (req, reply) => {
    const actor = await guard(req, reply, "write");
    if (!actor) return;
    try {
      return { domain: await service.verifyOwnership(actor, (req.params as { id: string }).id) };
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.post(`${PREFIX}/:id/bindings`, async (req, reply) => {
    const actor = await guard(req, reply, "write");
    if (!actor) return;
    try {
      return { domain: service.createBinding(actor, (req.params as { id: string }).id, bindingBody.parse(req.body ?? {})) };
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.post(`${PREFIX}/:id/bindings/:bindingId/advance`, async (req, reply) => {
    const actor = await guard(req, reply, "write");
    if (!actor) return;
    const { id, bindingId } = req.params as { id: string; bindingId: string };
    try {
      return { domain: await service.advanceBinding(actor, id, bindingId) };
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.delete(`${PREFIX}/:id/bindings/:bindingId`, async (req, reply) => {
    const actor = await guard(req, reply, "write");
    if (!actor) return;
    const { id, bindingId } = req.params as { id: string; bindingId: string };
    try {
      return { domain: service.removeBinding(actor, id, bindingId) };
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.get(`${PREFIX}/:id/dns`, async (req, reply) => {
    const actor = await guard(req, reply, "read");
    if (!actor) return;
    try {
      return await service.getDns(actor, (req.params as { id: string }).id);
    } catch (err) {
      return sendError(req, reply, err);
    }
  });

  app.post(`${PREFIX}/:id/dns`, async (req, reply) => {
    const actor = await guard(req, reply, "strong");
    if (!actor) return;
    try {
      const body = dnsBody.parse(req.body ?? {});
      return await service.changeDns(actor, (req.params as { id: string }).id, body.changes);
    } catch (err) {
      return sendError(req, reply, err);
    }
  });
}
