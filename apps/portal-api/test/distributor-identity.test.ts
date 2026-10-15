import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createServer, type IncomingHttpHeaders } from "node:http";
import test, { after } from "node:test";
import { config } from "../src/config.js";
import { createRemoteDistributor } from "../src/services/distributor.js";
import { ServiceTokenVerifier } from "../src/lib/service-token.js";

test("remote Master Distributor calls carry the Portal's service identity, never the user's token", async () => {
  const seen: Array<{ method?: string; url?: string; headers: IncomingHttpHeaders }> = [];
  const server = createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, headers: req.headers });
    req.resume();
    req.on("end", () => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ tenantId: "t1", domainId: "dom_x", manifest: {}, eventsEmitted: [], dnsStatus: "ACTIVE", sslStatus: "ACTIVE" })));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  after(() => server.close());
  const address = server.address();
  const previous = config.masterDistributorUrl;
  (config as { masterDistributorUrl: string }).masterDistributorUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  after(() => { (config as { masterDistributorUrl: string }).masterDistributorUrl = previous; });

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const distributor = createRemoteDistributor({ signer: { serviceId: "lifeos-portal", keyId: "test-lifeos-portal", privateKey } });
  await distributor.bootstrap({ tenantId: "t1", subdomain: "brand", displayName: "Brand", oauthDestinations: [], accessToken: "USER-TRUSTID-ACCESS-TOKEN", ownerSubject: "TD-OWNER" });
  await distributor.getDomainStatus("dom_x", "USER-TRUSTID-ACCESS-TOKEN");
  await distributor.provisionCustomDomain({ tenantId: "t1", subdomain: "brand", customDomain: "brand.example.com", accessToken: "USER-TRUSTID-ACCESS-TOKEN", ownerSubject: "local:usr_1" });

  // MD-side verification of exactly what the Portal sent.
  const md = new ServiceTokenVerifier({ audience: "master-distributor", services: { "lifeos-portal": { keys: { "test-lifeos-portal": publicKey }, permissions: ["tenants:provision", "tenants:read"] } } });
  for (const request of seen) {
    const auth = String(request.headers.authorization);
    assert.equal(auth.includes("USER-TRUSTID-ACCESS-TOKEN"), false, "the user token is never forwarded");
    assert.ok(auth.startsWith("Bearer "));
    const caller = await md.verify(auth.slice(7), { method: request.method!, path: request.url!.split("?")[0]! });
    assert.equal(caller?.serviceId, "lifeos-portal", `${request.method} ${request.url}`);
  }
  assert.equal(seen[0]!.headers["x-lifeos-owner-subject"], "TD-OWNER", "canonical owner subject as business context");
  assert.equal(seen[2]!.headers["x-lifeos-owner-subject"], undefined, "a Portal-local subject is never sent");
  assert.deepEqual(seen.map((r) => `${r.method} ${r.url}`), ["POST /v1/distributor/tenants/bootstrap", "GET /v1/distributor/domains/dom_x/status", "POST /v1/distributor/domains/provision"]);
});
