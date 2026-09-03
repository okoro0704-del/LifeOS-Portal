import fp from "fastify-plugin";
import { ZodError } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { HttpError } from "../lib/http.js";

export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  error: string;
  message: string;
};

function problem(
  req: FastifyRequest,
  status: number,
  code: string,
  detail: string,
): ProblemDetails {
  return {
    type: `https://lifeos.app/problems/${code}`,
    title: detail,
    status,
    detail,
    instance: req.url,
    error: code,
    message: detail,
  };
}

/**
 * RFC 7807-shaped errors. `error` + `message` stay for existing clients.
 * Stack traces stay in logs, never in production responses.
 */
async function errorHandlerPlugin(app: FastifyInstance) {
  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).type("application/problem+json").send(
        problem(req, err.statusCode, err.code, err.message),
      );
    }

    if (err instanceof ZodError) {
      const detail = err.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      return reply.code(400).type("application/problem+json").send(problem(req, 400, "invalid_body", detail));
    }

    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    const exposed = status < 500 ? err.message : "Internal server error";
    const code = typeof err.code === "string" && err.code ? err.code : status === 500 ? "internal_error" : "request_error";

    req.log.error({ err, url: req.url }, status >= 500 ? "unhandled_error" : "request_error");

    if (env.nodeEnv !== "production" && status >= 500) {
      return reply.code(status).type("application/problem+json").send({
        ...problem(req, status, code, exposed),
        debug: err.message,
      });
    }

    return reply.code(status).type("application/problem+json").send(problem(req, status, code, exposed));
  });
}

export default fp(errorHandlerPlugin, { name: "lifeos-error-handler" });
