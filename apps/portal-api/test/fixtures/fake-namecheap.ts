/**
 * In-process stand-in for the Namecheap XML API. Never touches the network.
 * Behaviour follows the official response shapes for each command.
 */
import type { InfraDnsRecord } from "@lifeos-portal/shared";

type Failure =
  | "timeout"
  | "network"
  | "http500"
  | "malformed"
  | "doctype"
  | { number: string; message: string };

type HostRow = InfraDnsRecord;

export type FakeCall = { endpoint: string; command: string; params: Record<string, string> };

function esc(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function ok(command: string, inner: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<ApiResponse xmlns="http://api.namecheap.com/xml.response" Status="OK">
  <Errors/>
  <Warnings/>
  <RequestedCommand>${command}</RequestedCommand>
  <CommandResponse Type="${command}">${inner}</CommandResponse>
  <Server>FAKE</Server>
  <GMTTimeDifference>+0:00</GMTTimeDifference>
  <ExecutionTime>0.01</ExecutionTime>
</ApiResponse>`;
}

function error(command: string, number: string, message: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<ApiResponse xmlns="http://api.namecheap.com/xml.response" Status="ERROR">
  <Errors><Error Number="${number}">${esc(message)}</Error></Errors>
  <Warnings/>
  <RequestedCommand>${command}</RequestedCommand>
  <Server>FAKE</Server>
  <GMTTimeDifference>+0:00</GMTTimeDifference>
  <ExecutionTime>0.01</ExecutionTime>
</ApiResponse>`;
}

function timeoutError() {
  const err = new Error("The operation was aborted due to timeout");
  err.name = "TimeoutError";
  return err;
}

export class FakeNamecheap {
  calls: FakeCall[] = [];
  /** Domains already registered by someone else. */
  taken = new Set<string>(["google.com"]);
  premium = new Map<string, { register: string; renew: string }>();
  pricing: Record<string, { register: string; renew: string; icann?: string; currency?: string }> = {
    com: { register: "10.98", renew: "15.88", icann: "0.18" },
    net: { register: "12.98", renew: "16.98", icann: "0.18" },
    org: { register: "9.98", renew: "15.98", icann: "0.18" },
    app: { register: "14.98", renew: "16.98" },
    io: { register: "39.98", renew: "59.98" },
    co: { register: "12.98", renew: "28.98" },
  };
  /** Domains in "our" registrar account. */
  account = new Map<string, { id: string; created: string; expires: string; privacy: boolean }>();
  hosts = new Map<string, { records: HostRow[]; emailType: string | null; usingOurDns: boolean }>();
  failures = new Map<string, Failure[]>();
  /** Registrar commits the registration, then the response is lost. */
  createCommitsThenTimesOut = false;
  /** setHosts reports success but silently drops this record type. */
  setHostsDropsType: string | null = null;
  private nextId = 1000;

  failNext(command: string, failure: Failure) {
    const list = this.failures.get(command) ?? [];
    list.push(failure);
    this.failures.set(command, list);
  }

  count(command: string) {
    return this.calls.filter((c) => c.command === command).length;
  }

  seedHosts(domain: string, records: HostRow[], emailType: string | null = null) {
    this.hosts.set(domain, { records: records.map((r) => ({ ...r })), emailType, usingOurDns: true });
  }

  fetch = async (input: string, init: RequestInit): Promise<Response> => {
    const params = Object.fromEntries(new URLSearchParams(String(init.body ?? "")));
    const command = params.Command ?? "";
    this.calls.push({ endpoint: input, command, params });

    const failure = this.failures.get(command)?.shift();
    if (failure === "timeout") throw timeoutError();
    if (failure === "network") throw new TypeError("fetch failed");
    if (failure === "http500") return new Response("upstream error", { status: 500 });
    if (failure === "malformed") return new Response("<ApiResponse Status=\"OK\"><CommandResponse>", { status: 200 });
    if (failure === "doctype") {
      return new Response(
        `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><ApiResponse Status="OK"><CommandResponse>&x;</CommandResponse></ApiResponse>`,
        { status: 200 },
      );
    }
    if (failure && typeof failure === "object") return new Response(error(command, failure.number, failure.message), { status: 200 });

    return new Response(this.handle(command, params), { status: 200, headers: { "Content-Type": "text/xml" } });
  };

  private handle(command: string, p: Record<string, string>): string {
    switch (command) {
      case "namecheap.domains.check": {
        const rows = (p.DomainList ?? "").split(",").map((domain) => {
          const d = domain.toLowerCase();
          const premium = this.premium.get(d);
          const available = !this.taken.has(d) && !this.account.has(d);
          return `<DomainCheckResult Domain="${d}" Available="${available}" ErrorNo="0" Description="" IsPremiumName="${Boolean(premium)}" PremiumRegistrationPrice="${premium?.register ?? "0"}" PremiumRenewalPrice="${premium?.renew ?? "0"}" PremiumRestorePrice="0" PremiumTransferPrice="0" IcannFee="${premium ? "0.18" : "0"}" EapFee="0.0000"/>`;
        });
        return ok(command, rows.join(""));
      }
      case "namecheap.users.getPricing": {
        const tld = (p.ProductName ?? "").toLowerCase();
        const action = (p.ActionName ?? "REGISTER").toUpperCase();
        const price = this.pricing[tld];
        if (!price) return ok(command, `<UserGetPricingResult><ProductType Name="DOMAIN"></ProductType></UserGetPricingResult>`);
        const value = action === "RENEW" ? price.renew : price.register;
        const extra = price.icann ? ` YourAdditonalCost="${price.icann}"` : "";
        return ok(
          command,
          `<UserGetPricingResult><ProductType Name="DOMAIN"><ProductCategory Name="${action.toLowerCase()}"><Product Name="${tld}"><Price Duration="1" DurationType="YEAR" Price="${value}" RegularPrice="${value}" YourPrice="${value}" CouponPrice="" Currency="${price.currency ?? "USD"}"${extra}/><Price Duration="2" DurationType="YEAR" Price="99.00" RegularPrice="99.00" YourPrice="99.00" CouponPrice="" Currency="USD"/></Product></ProductCategory></ProductType></UserGetPricingResult>`,
        );
      }
      case "namecheap.domains.create": {
        const d = (p.DomainName ?? "").toLowerCase();
        if (this.taken.has(d) || this.account.has(d)) return error(command, "3019166", "Domain not available");
        if (!/^\+\d{1,3}\.\d+$/.test(p.RegistrantPhone ?? "")) return error(command, "2015182", "Contact phone is invalid");
        const id = String(this.nextId++);
        this.account.set(d, { id, created: "10/04/2026", expires: "10/04/2027", privacy: p.WGEnabled === "yes" });
        this.hosts.set(d, {
          records: [
            { name: "@", type: "URL", address: "http://www.example-parking.test/", ttl: 1800 },
            { name: "www", type: "CNAME", address: "parkingpage.namecheap.com.", ttl: 1800 },
          ],
          emailType: null,
          usingOurDns: true,
        });
        if (this.createCommitsThenTimesOut) {
          this.createCommitsThenTimesOut = false;
          throw timeoutError();
        }
        const charged = this.premium.get(d)?.register ?? this.pricing[d.split(".").slice(1).join(".")]?.register ?? "0";
        return ok(
          command,
          `<DomainCreateResult Domain="${d}" Registered="true" ChargedAmount="${charged}" DomainID="${id}" OrderID="${Number(id) + 5000}" TransactionID="${Number(id) + 9000}" WhoisguardEnable="${p.WGEnabled === "yes"}" NonRealTimeDomain="false"/>`,
        );
      }
      case "namecheap.domains.getList": {
        const term = (p.SearchTerm ?? "").toLowerCase();
        const rows = [...this.account.entries()]
          .filter(([d]) => !term || d.includes(term))
          .map(
            ([d, row]) =>
              `<Domain ID="${row.id}" Name="${d}" User="fake" Created="${row.created}" Expires="${row.expires}" IsExpired="false" IsLocked="false" AutoRenew="false" WhoisGuard="${row.privacy ? "ENABLED" : "NOTPRESENT"}" IsPremium="false" IsOurDNS="true"/>`,
          );
        return ok(command, `<DomainGetListResult>${rows.join("")}</DomainGetListResult><Paging><TotalItems>${rows.length}</TotalItems></Paging>`);
      }
      case "namecheap.domains.dns.getHosts": {
        const d = `${p.SLD}.${p.TLD}`.toLowerCase();
        const zone = this.hosts.get(d);
        if (!zone) return error(command, "2019166", "Domain not found");
        if (!zone.usingOurDns) return error(command, "2030288", "Cannot complete this command as this domain is not using proper DNS servers");
        const rows = zone.records
          .map(
            (r, i) =>
              `<host HostId="${i + 1}" Name="${esc(r.name)}" Type="${r.type}" Address="${esc(r.address)}" MXPref="${r.mxPref ?? 10}" TTL="${r.ttl}" AssociatedAppTitle="" FriendlyName="" IsActive="true" IsDDNSEnabled="false"/>`,
          )
          .join("");
        const email = zone.emailType ? ` EmailType="${zone.emailType}"` : "";
        return ok(command, `<DomainDNSGetHostsResult Domain="${d}"${email} IsUsingOurDNS="true">${rows}</DomainDNSGetHostsResult>`);
      }
      case "namecheap.domains.dns.setHosts": {
        const d = `${p.SLD}.${p.TLD}`.toLowerCase();
        const zone = this.hosts.get(d);
        if (!zone) return error(command, "2019166", "Domain not found");
        const records: HostRow[] = [];
        for (let n = 1; p[`HostName${n}`] != null; n += 1) {
          const type = p[`RecordType${n}`] as HostRow["type"];
          if (this.setHostsDropsType === type) continue;
          const row: HostRow = { name: p[`HostName${n}`]!, type, address: p[`Address${n}`]!, ttl: Number(p[`TTL${n}`] ?? 1800) };
          if (type === "MX" || type === "MXE") row.mxPref = Number(p[`MXPref${n}`] ?? 10);
          records.push(row);
        }
        // Namecheap drops MX records unless EmailType=MX is supplied.
        const keepMx = (p.EmailType ?? "").toUpperCase() === "MX";
        zone.records = records.filter((r) => r.type !== "MX" || keepMx);
        zone.emailType = p.EmailType ?? null;
        return ok(command, `<DomainDNSSetHostsResult Domain="${d}" IsSuccess="true"/>`);
      }
      default:
        return error(command, "1010104", "Command is not supported by fake");
    }
  }
}
