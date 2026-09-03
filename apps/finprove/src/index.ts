import { buildFinproveApp } from "./app.js";

const railway = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_ENVIRONMENT_NAME ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_PRIVATE_DOMAIN,
);

/**
 * Railway injects PORT. Private networking needs dual-stack `::`.
 * Local default stays loopback so :4220 is not on a public interface.
 */
const port = Number(process.env.PORT || 4220);
const host = process.env.HOST ?? (railway ? "::" : "127.0.0.1");
const app = await buildFinproveApp();

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

await app.listen({ port, host });
app.log.info({ host, port, railway }, "Finprove listening");
