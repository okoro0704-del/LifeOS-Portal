import type { MarketplaceVertical } from "../data/verticalCatalog";

type VerticalCardProps = {
  vertical: MarketplaceVertical;
  onInstall: (vertical: MarketplaceVertical) => void;
};

export function VerticalCard({ vertical, onInstall }: VerticalCardProps) {
  return (
    <article className="card vertical-card" data-testid="vertical-card" data-vertical-id={vertical.id}>
      <p className="vertical-card-icon" aria-hidden>
        {vertical.icon}
      </p>
      <p className="eyebrow">{vertical.engine}</p>
      <h2>{vertical.name}</h2>
      <p>{vertical.description}</p>
      <p className="muted small">Included features</p>
      <ul className="chips">
        {vertical.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      {vertical.available ? (
        <button
          type="button"
          className="btn btn-primary"
          data-testid="install-vertical"
          onClick={() => onInstall(vertical)}
        >
          Install Vertical
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-ghost"
          data-testid="install-vertical"
          onClick={() => onInstall(vertical)}
        >
          Preview in wizard
        </button>
      )}
    </article>
  );
}
