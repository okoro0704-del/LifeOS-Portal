import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { DomainBindingTarget, DomainPublic, InfraDnsRecord, InfraDnsRecordType } from "@lifeos-portal/shared";
import { domainsApi, type DomainDetail } from "../../lib/api";
import { describeError, StatusBadge } from "./common";
import { RegistrantForm } from "./RegistrantForm";

const TABS = ["Overview", "App Binding", "DNS", "Renewal", "Privacy", "Registrant", "Provider status", "Audit"] as const;
type Tab = (typeof TABS)[number];

function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

function RecordsTable({ records, onDelete }: { records: InfraDnsRecord[]; onDelete?: (r: InfraDnsRecord) => void }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Host</th>
          <th>Type</th>
          <th>Value</th>
          <th>TTL</th>
          {onDelete ? <th></th> : null}
        </tr>
      </thead>
      <tbody>
        {records.map((r) => (
          <tr key={`${r.name}|${r.type}|${r.address}`}>
            <td className="mono">{r.name}</td>
            <td>{r.type}</td>
            <td className="mono">
              {r.mxPref !== undefined ? `${r.mxPref} ` : ""}
              {r.address}
            </td>
            <td>{r.ttl}</td>
            {onDelete ? (
              <td>
                <button type="button" className="linkish" onClick={() => onDelete(r)}>
                  Delete
                </button>
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DomainManagePage() {
  const { id = "" } = useParams();
  const [tab, setTab] = useState<Tab>("Overview");
  const [detail, setDetail] = useState<DomainDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await domainsApi.detail(id));
    } catch (err) {
      setError(describeError(err, "Could not load domain."));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(label: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (done) setNotice(done);
      await load();
    } catch (err) {
      setError(describeError(err, "Request failed."));
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!detail) {
    return (
      <div className="page">
        {error ? <p className="banner-error">{error}</p> : <p className="muted">Loading…</p>}
      </div>
    );
  }
  const d = detail.domain;

  return (
    <div className="page marketplace">
      <header className="page-head">
        <p className="eyebrow">
          <Link to="/infrastructure/domains">Infrastructure · Domains</Link>
        </p>
        <h1 className="mono">{d.fqdn}</h1>
        <p>
          <StatusBadge value={d.status} />
          {d.providerEnvironment === "SANDBOX" ? <span className="badge badge-warn">Sandbox</span> : null}
        </p>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      {notice ? <p className="banner-info">{notice}</p> : null}

      <div className="marketplace-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`marketplace-tab${tab === t ? " marketplace-tab--active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" ? <Overview domain={d} busy={busy} run={run} /> : null}
      {tab === "App Binding" ? <Binding domain={d} busy={busy} run={run} /> : null}
      {tab === "DNS" ? <Dns domain={d} busy={busy} run={run} /> : null}
      {tab === "Renewal" ? (
        <dl className="meta">
          <div>
            <dt>Registered</dt>
            <dd>{date(d.registrationDate)}</dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd>{date(d.expirationDate)}</dd>
          </div>
          <div>
            <dt>Auto-renew at registrar</dt>
            <dd>{d.autoRenew === null ? "Unknown" : d.autoRenew ? "On" : "Off"}</dd>
          </div>
          <div>
            <dt>Renewal</dt>
            <dd className="small">
              Renewals are paid at the registrar in V1. Portal shows expiry and refreshes it from the registrar; it
              does not renew automatically.
            </dd>
          </div>
        </dl>
      ) : null}
      {tab === "Privacy" ? (
        <dl className="meta">
          <div>
            <dt>WHOIS privacy</dt>
            <dd>
              <StatusBadge value={d.privacyStatus} />
            </dd>
          </div>
          <div>
            <dt>Note</dt>
            <dd className="small">
              {d.privacyStatus === "UNSUPPORTED"
                ? "The registrar does not offer free privacy for this TLD."
                : "Privacy status is reported by the registrar. Refresh from Provider status to update it."}
            </dd>
          </div>
        </dl>
      ) : null}
      {tab === "Registrant" ? (
        detail.registrant ? (
          <>
            <dl className="meta">
              <div>
                <dt>Profile</dt>
                <dd>
                  {detail.registrant.label} · {detail.registrant.country} · {detail.registrant.emailMasked}
                </dd>
              </div>
            </dl>
            <RegistrantForm profileId={detail.registrant.id} onSaved={() => void load()} />
            <p className="hint">
              Editing this profile updates future purchases. Contact changes for an existing registration are made at
              the registrar.
            </p>
          </>
        ) : (
          <p className="muted">No registrant profile on file (connected domains keep their existing registrar contacts).</p>
        )
      ) : null}
      {tab === "Provider status" ? (
        <>
          <dl className="meta">
            <div>
              <dt>Provider</dt>
              <dd>
                {d.provider === "namecheap" ? "Namecheap" : "External registrar"} · {d.providerEnvironment}
              </dd>
            </div>
            <div>
              <dt>Registrar domain ID</dt>
              <dd className="mono">{d.providerDomainId ?? "—"}</dd>
            </div>
            <div>
              <dt>DNS managed by</dt>
              <dd>{d.dnsManagement}</dd>
            </div>
            {detail.purchase ? (
              <div>
                <dt>Purchase</dt>
                <dd>
                  {detail.purchase.status} · {detail.purchase.registrationStatus} · order{" "}
                  <span className="mono">{detail.purchase.providerOrderId ?? "—"}</span>
                </dd>
              </div>
            ) : null}
          </dl>
          {d.source === "PURCHASED" ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy !== null}
              onClick={() => void run("refresh", () => domainsApi.refresh(d.id), "Refreshed from the registrar.")}
            >
              Refresh from registrar
            </button>
          ) : null}
        </>
      ) : null}
      {tab === "Audit" ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Result</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {detail.audit.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.at).toLocaleString()}</td>
                <td className="mono">{e.action}</td>
                <td>{e.result}</td>
                <td className="small">
                  {e.failureCode ? `${e.failureCode} ` : ""}
                  {e.dnsDiff ? `DNS +${e.dnsDiff.added.length} / -${e.dnsDiff.removed.length}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

type SectionProps = {
  domain: DomainPublic;
  busy: string | null;
  run: (label: string, fn: () => Promise<unknown>, done?: string) => Promise<void>;
};

function Overview({ domain: d, busy, run }: SectionProps) {
  return (
    <>
      <dl className="meta">
        <div>
          <dt>Source</dt>
          <dd>{d.source === "PURCHASED" ? "Purchased through Portal" : "Connected (registered elsewhere)"}</dd>
        </div>
        <div>
          <dt>Ownership</dt>
          <dd>{d.ownershipVerified ? "Verified" : "Verification pending"}</dd>
        </div>
        <div>
          <dt>Expires</dt>
          <dd>{date(d.expirationDate)}</dd>
        </div>
        <div>
          <dt>Bound App</dt>
          <dd>
            {d.bindings
              .filter((b) => b.status !== "REMOVED")
              .map((b) => `${b.hostname} → ${b.targetLabel} (${b.status}, HTTPS ${b.httpsStatus})`)
              .join("; ") || "None"}
          </dd>
        </div>
      </dl>
      {!d.ownershipVerified && d.ownershipRecord ? (
        <section className="card">
          <h2>Verify ownership</h2>
          <p className="small">Add this TXT record at your DNS host, wait for it to propagate, then verify.</p>
          <RecordsTable records={[d.ownershipRecord]} />
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy !== null}
            onClick={() => void run("verify", () => domainsApi.verifyOwnership(d.id), "Ownership verified.")}
          >
            {busy === "verify" ? "Checking…" : "Verify ownership"}
          </button>
        </section>
      ) : null}
    </>
  );
}

function Binding({ domain: d, busy, run }: SectionProps) {
  const [targets, setTargets] = useState<DomainBindingTarget[]>([]);
  const [targetId, setTargetId] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [includeWww, setIncludeWww] = useState(true);
  const active = d.bindings.filter((b) => b.status !== "REMOVED");

  useEffect(() => {
    void domainsApi.targets().then(({ targets: rows }) => setTargets(rows)).catch(() => setTargets([]));
  }, []);

  function bind(e: FormEvent) {
    e.preventDefault();
    void run(
      "bind",
      () => domainsApi.bind(d.id, { targetId, subdomain: subdomain.trim() || null, includeWww }),
      "Binding created. Continue setup to configure DNS and hosting.",
    );
  }

  return (
    <>
      {active.map((b) => (
        <section className="card" key={b.id}>
          <h2 className="mono">{b.hostname}</h2>
          <p>
            → {b.targetLabel} · <StatusBadge value={b.status} /> · HTTPS {b.httpsStatus}
          </p>
          {b.nextAction ? <p className="small">{b.nextAction}</p> : null}
          {b.requiredRecords.length ? (
            <>
              <p className="small muted">Records this binding needs (existing email and verification records are kept):</p>
              <RecordsTable records={b.requiredRecords} />
            </>
          ) : null}
          <div className="actions">
            {b.status !== "ACTIVE" ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy !== null}
                onClick={() => void run("advance", () => domainsApi.advanceBinding(d.id, b.id))}
              >
                {busy === "advance" ? "Working…" : "Continue setup"}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy !== null}
              onClick={() => {
                if (window.confirm(`Unbind ${b.hostname} from ${b.targetLabel}? DNS records are left in place.`)) {
                  void run("unbind", () => domainsApi.removeBinding(d.id, b.id), "Binding removed.");
                }
              }}
            >
              Remove binding
            </button>
          </div>
        </section>
      ))}

      {!d.ownershipVerified ? (
        <p className="muted">Verify ownership on the Overview tab before binding this domain to an App.</p>
      ) : (
        <form className="form" onSubmit={bind}>
          <h2 className="section-title">Where should this domain go?</h2>
          <label>
            App
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} required>
              <option value="">Select an App</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} ({t.hostname})
                </option>
              ))}
            </select>
          </label>
          <label>
            Subdomain (optional)
            <input value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder="leave empty for the root domain" />
            <span className="hint">e.g. “tv” binds tv.{d.fqdn}. Leave empty to use {d.fqdn}.</span>
          </label>
          {!subdomain.trim() ? (
            <label className="check">
              <input type="checkbox" checked={includeWww} onChange={(e) => setIncludeWww(e.target.checked)} />
              Also route www.{d.fqdn}
            </label>
          ) : null}
          <button className="btn btn-primary" disabled={!targetId || busy !== null}>
            Bind to App
          </button>
          <p className="hint">No DNS is changed until you continue setup on the binding.</p>
        </form>
      )}
    </>
  );
}

const RECORD_TYPES: InfraDnsRecordType[] = ["A", "AAAA", "CNAME", "TXT", "MX", "CAA", "ALIAS", "URL", "URL301"];

function Dns({ domain: d, busy, run }: SectionProps) {
  const [state, setState] = useState<{ managed: boolean; records: InfraDnsRecord[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; type: InfraDnsRecordType; address: string; ttl: string; mxPref: string }>({
    name: "@",
    type: "TXT",
    address: "",
    ttl: "1800",
    mxPref: "10",
  });

  const load = useCallback(async () => {
    try {
      setState(await domainsApi.dns(d.id));
      setError(null);
    } catch (err) {
      setError(describeError(err, "Could not read DNS."));
    }
  }, [d.id]);

  useEffect(() => {
    void load();
  }, [load]);

  function add(e: FormEvent) {
    e.preventDefault();
    const record: InfraDnsRecord = {
      name: draft.name.trim() || "@",
      type: draft.type,
      address: draft.address.trim(),
      ttl: Number(draft.ttl) || 1800,
      ...(draft.type === "MX" ? { mxPref: Number(draft.mxPref) || 10 } : {}),
    };
    void run("dns", () => domainsApi.changeDns(d.id, [{ op: "upsert", record }]), "DNS updated and verified.").then(load);
  }

  function remove(r: InfraDnsRecord) {
    if (!window.confirm(`Delete ${r.type} ${r.name} → ${r.address}? All other records are kept.`)) return;
    void run(
      "dns",
      () => domainsApi.changeDns(d.id, [{ op: "delete", record: { name: r.name, type: r.type, address: r.address } }]),
      "Record deleted and DNS verified.",
    ).then(load);
  }

  if (error) return <p className="banner-error">{error}</p>;
  if (!state) return <p className="muted">Reading DNS from the registrar…</p>;
  if (!state.managed) {
    return (
      <p className="muted">
        DNS for this domain is not managed through Portal ({d.source === "CONNECTED" ? "connected domain" : "custom nameservers"}).
        Add the records shown on the App Binding tab at your DNS host.
      </p>
    );
  }
  return (
    <>
      <p className="small muted">
        Every change reads the full record set, merges your edit, writes it back and re-reads it to verify. Email (MX,
        SPF, DKIM, DMARC) and verification records are never dropped.
      </p>
      <RecordsTable records={state.records} onDelete={remove} />
      <form className="form" onSubmit={add}>
        <h2 className="section-title">Add or update a record</h2>
        <label>
          Host
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label>
          Type
          <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as InfraDnsRecordType })}>
            {RECORD_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Value
          <input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} required />
        </label>
        {draft.type === "MX" ? (
          <label>
            MX priority
            <input value={draft.mxPref} onChange={(e) => setDraft({ ...draft, mxPref: e.target.value })} />
          </label>
        ) : null}
        <label>
          TTL (seconds)
          <input value={draft.ttl} onChange={(e) => setDraft({ ...draft, ttl: e.target.value })} />
        </label>
        <button className="btn btn-primary" disabled={busy !== null}>
          Save record
        </button>
        <p className="hint">Manual DNS changes require owner/administrator authority and TrustID step-up.</p>
      </form>
    </>
  );
}
