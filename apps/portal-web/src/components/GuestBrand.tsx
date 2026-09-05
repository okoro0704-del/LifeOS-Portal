export type GuestBrandInfo = {
  name: string;
  logoUrl?: string;
  backgroundUrl?: string;
  heroTitle?: string;
  writeup?: string;
  phone?: string;
  email?: string;
  address?: string;
};

export function GuestBrand({ brand, fallback }: { brand: GuestBrandInfo; fallback: string }) {
  return (
    <section className="guest-brand">
      {brand.backgroundUrl ? (
        <div className="guest-brand-photo" style={{ backgroundImage: `url(${brand.backgroundUrl})` }} />
      ) : null}
      <div className="guest-brand-copy">
        {brand.logoUrl ? <img className="guest-logo" src={brand.logoUrl} alt={brand.name} /> : null}
        <p className="tap-hero">{brand.heroTitle || fallback}</p>
        {brand.writeup ? <p className="lead">{brand.writeup}</p> : null}
        {brand.phone || brand.email || brand.address ? (
          <ul className="guest-contacts">
            {brand.phone ? <li>{brand.phone}</li> : null}
            {brand.email ? <li>{brand.email}</li> : null}
            {brand.address ? <li>{brand.address}</li> : null}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
