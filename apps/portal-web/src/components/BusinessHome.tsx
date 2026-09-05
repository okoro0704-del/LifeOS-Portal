import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export type HomeTestimonial = { name: string; quote: string; visit: string };

export function BusinessHome({
  name,
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
  testimonials,
}: {
  name: string;
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
  secondaryCta?: { to: string; label: string };
  testimonials: HomeTestimonial[];
  featured?: ReactNode;
}) {
  return (
    <main className="site-home" data-testid="business-home">
      <section
        className="site-hero site-hero-tall"
        style={backgroundUrl ? { backgroundImage: `url(${backgroundUrl})` } : undefined}
      >
        <div className="site-hero-copy">
          {logoUrl ? <img className="guest-logo" src={logoUrl} alt={name} /> : null}
          <p className="eyebrow">Home</p>
          <h2>{heroTitle || `Welcome to ${name}`}</h2>
          <p className="lead">{writeup || story}</p>
          {phone || email || address ? (
            <div className="site-hero-meta">
              {phone ? <p>{phone}</p> : null}
              {email ? <p>{email}</p> : null}
              {address ? <p>{address}</p> : null}
            </div>
          ) : null}
          <div className="site-cta">
            <Link className="btn btn-primary" to={primaryCta.to}>
              {primaryCta.label}
            </Link>
            {secondaryCta ? (
              <Link className="btn btn-ghost" to={secondaryCta.to}>
                {secondaryCta.label}
              </Link>
            ) : null}
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
    </main>
  );
}
