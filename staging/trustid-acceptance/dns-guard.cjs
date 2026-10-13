/**
 * Staging egress guard (preload with --require). Resolves trustid.staging.test to the local edge
 * and refuses every other non-loopback name, so a staging API process cannot reach any external or
 * production service even if configured to. Loopback addresses are untouched.
 */
const dns = require("node:dns");
const MAP = { "trustid.staging.test": "127.0.0.1" };
const LOOPBACK = new Set(["localhost", "127.0.0.1", "127.0.0.2", "::1"]);
const original = dns.lookup;

function refuse(hostname, cb) {
  const err = Object.assign(new Error(`staging egress blocked: ${hostname}`), { code: "ENOTFOUND", hostname });
  process.nextTick(() => cb(err));
}

dns.lookup = function guardedLookup(hostname, options, callback) {
  const cb = typeof options === "function" ? options : callback;
  const opts = typeof options === "function" ? {} : typeof options === "number" ? { family: options } : options ?? {};
  if (MAP[hostname]) {
    const address = MAP[hostname];
    return process.nextTick(() => (opts.all ? cb(null, [{ address, family: 4 }]) : cb(null, address, 4)));
  }
  if (LOOPBACK.has(hostname)) return original.call(dns, hostname, options, callback);
  return refuse(hostname, cb);
};
dns.promises.lookup = async (hostname, options = {}) => {
  if (MAP[hostname]) return options.all ? [{ address: MAP[hostname], family: 4 }] : { address: MAP[hostname], family: 4 };
  if (LOOPBACK.has(hostname)) return original.__promisify__ ? original.__promisify__(hostname, options) : { address: hostname, family: 4 };
  throw Object.assign(new Error(`staging egress blocked: ${hostname}`), { code: "ENOTFOUND", hostname });
};
