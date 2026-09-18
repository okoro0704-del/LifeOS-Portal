import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listPortalIndustryGroups } from "@lifeos-portal/shared";

export function ChooseLanePage() {
  const industries = listPortalIndustryGroups();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    navigate(q ? `/app/business?q=${encodeURIComponent(q)}` : "/app/business");
  }

  return (
    <div className="page industry-hub">
      <header className="page-head">
        <p className="eyebrow">LifeOS Portal</p>
        <h1>What do you want to build?</h1>
        <p className="lead">
          Choose an industry to browse software for your business — or search the full catalog.
        </p>
        <form className="marketplace-search" onSubmit={onSearch} style={{ marginTop: "1rem" }}>
          <label className="marketplace-search-label" htmlFor="industry-hub-search">
            Search businesses, software, industries
          </label>
          <input
            id="industry-hub-search"
            className="marketplace-search-input"
            type="search"
            placeholder="Search supermarket, hotel, creator…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </form>
      </header>

      <p className="eyebrow" style={{ marginTop: "1.5rem" }}>
        Industries
      </p>
      <div className="hos-grid industry-grid">
        {industries.map((industry) => (
          <article key={industry.id} className="card hos-card industry-card">
            <p className="eyebrow">Industry</p>
            <h2>{industry.label}</h2>
            <p className="muted">{industry.description}</p>
            <Link className="btn btn-primary" to={industry.href}>
              Open {industry.label}
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
