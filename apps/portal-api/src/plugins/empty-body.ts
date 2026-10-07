import fp from "fastify-plugin";
import { errorCodes, type FastifyInstance } from "fastify";

/**
 * Bodyless writes (logout, handoff, …) have no request body by contract. Fastify treats a POST as
 * bodyless only when it carries neither Transfer-Encoding nor a non-zero Content-Length; a proxy hop
 * (the Netlify same-origin /api rewrite) can forward an empty POST as `Transfer-Encoding: chunked`
 * with no Content-Type, which Fastify would reject with 415 before any route runs.
 *
 * Fastify's `*` parser is consulted for a missing Content-Type and for any type without a parser, so
 * this one is deliberately narrow: it accepts exactly "no Content-Type and zero bytes" (body stays
 * undefined, as for any bodyless request) and keeps the original 415 for everything else. JSON routes
 * still validate their body, and malformed JSON is still rejected by the JSON parser.
 */
const UNSUPPORTED_BODY_LIMIT = 64 * 1024;

async function emptyBodyPlugin(app: FastifyInstance) {
  app.addContentTypeParser("*", { parseAs: "buffer", bodyLimit: UNSUPPORTED_BODY_LIMIT }, (req, body, done) => {
    const empty = (body as Buffer).length === 0;
    if (empty && req.headers["content-type"] === undefined) {
      done(null, undefined);
      return;
    }
    done(new errorCodes.FST_ERR_CTP_INVALID_MEDIA_TYPE());
  });
}

export default fp(emptyBodyPlugin, { name: "lifeos-empty-body" });
