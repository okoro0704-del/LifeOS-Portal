import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export type HomeTestimonial = { name: string; quote: string; visit: string };
export type HomeLink = { to: string; eyebrow: string; title: string; copy: string };

export function BusinessHome({
  name,
  hostname,
  accent: _accent,
  logoUrl,
  backgroundUrl,
  heroTitle,
  writeup,
  quotesEyebrow,
  phone,
  email,
  address,
  story,
  primaryCta,
  secondaryCta,
  links,
  testimonials,
  featured,
}: {
  name: string;
  hostname?: string;
  accent?: string;
  logoUrl?: string;
  backgroundUrl?: string;
  heroTitle?: string;
  writeup?: string;
  quotesEyebrow?: string;
  phone?: string;
  email?: string;
  address?: string;
  story: string;
  primaryCta: { to: string; label: string };
  secondaryCta: { to: string; label: string };
  links: HomeLink[];
  testimonials: HomeTestimonial[];
  featured?: ReactNode;
}) {
  return (
    <main className="site-home" data-testid="business-home">
      <section className="site-hero" style={backgroundUrl ? { backgroundImage: `url(${backgroundUrl})` } : undefined}>
        <div className="site-hero-copy">
          {logoUrl ? <img className="guest-logo" src={logoUrl} alt={name} /> : null}
          {hostname ? <p className="eyebrow">{hostname}</p> : <p className="eyebrow">{name}</p>}
          <h2>{heroTitle || `Welcome to ${name}`}</h2>
          <p className="lead">{writeup || story}</p>
          <div className="site-cta">
            <Link className="btn btn-primary" to={primaryCta.to}>
              {primaryCta.label}
            </Link>
            <Link className="btn btn-ghost" to={secondaryCta.to}>
              {secondaryCta.label}
            </Link>
          </div>
        </div>
      </section>
      <section className="site-quotes" data-testid="home-testimonials">
        <p className="eyebrow">{quotesEyebrow || "From people who already came back"}</p>
        <h3>What patrons say</h3>
        <div className="quote-grid">
          {testimonials.slice(0, 3).map((row, index) => (
            <blockquote key={`${row.name}-${index}`}>
              <p>“{row.quote}”</p>
              <footer>
                <strong>{row.name}</strong>
                <span>{row.visit}</span>
              </footer>
            </blockquote>
          ))}
        </div>
      </section>
      <section className="site-strip">
        {links.map((link) => (
          <article key={link.title}>
            <p className="eyebrow">{link.eyebrow}</p>
            <h3>{link.title}</h3>
            <p className="muted">{link.copy}</p>
            <Link to={link.to}>Open {link.title.toLowerCase()}</Link>
          </article>
        ))}
      </section>
      {featured}
      {phone || email || address ? (
        <section className="site-contact">
          <p className="eyebrow">Talk to the house</p>
          {phone ? <p>{phone}</p> : null}
          {email ? <p>{email}</p> : null}
          {address ? <p>{address}</p> : null}
        </section>
      ) : null}
    </main>
  );
}
