export type FulfillmentChoice = {
  fulfillment: "walk_in" | "takeaway";
  tableName: string;
  seats: number;
  address: string;
  lat?: number;
  lng?: number;
};

export type SeatTable = { id: string; name: string; seats: number };

export function emptyFulfillment(tables: SeatTable[] = []): FulfillmentChoice {
  const first = tables[0];
  return {
    fulfillment: "walk_in",
    tableName: first?.name ?? "",
    seats: first?.seats ?? 2,
    address: "",
  };
}

export function OrderFulfillment({
  tables,
  value,
  onChange,
}: {
  tables: SeatTable[];
  value: FulfillmentChoice;
  onChange: (next: FulfillmentChoice) => void;
}) {
  const selected = tables.find((table) => table.name === value.tableName);
  const maxSeats = selected?.seats ?? 8;

  function pinLiveMap() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          ...value,
          fulfillment: "takeaway",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  return (
    <div className="fulfillment" data-testid="order-fulfillment">
      <p className="eyebrow">How this order leaves</p>
      <div className="fulfillment-tabs">
        <button
          type="button"
          className={value.fulfillment === "walk_in" ? "active" : ""}
          onClick={() => onChange({ ...value, fulfillment: "walk_in" })}
        >
          Walk-in
        </button>
        <button
          type="button"
          className={value.fulfillment === "takeaway" ? "active" : ""}
          onClick={() => onChange({ ...value, fulfillment: "takeaway" })}
        >
          Takeaway
        </button>
      </div>
      {value.fulfillment === "walk_in" ? (
        tables.length ? (
          <>
            <label>
              Table
              <select
                value={value.tableName}
                onChange={(e) => {
                  const table = tables.find((row) => row.name === e.target.value);
                  onChange({ ...value, tableName: e.target.value, seats: table?.seats ?? value.seats });
                }}
              >
                {tables.map((table) => (
                  <option key={table.id} value={table.name}>
                    {table.name} · {table.seats} chairs
                  </option>
                ))}
              </select>
            </label>
            <label>
              Chairs
              <input
                type="number"
                min={1}
                max={maxSeats}
                value={value.seats}
                onChange={(e) => onChange({ ...value, seats: Math.max(1, Math.min(maxSeats, Number(e.target.value) || 1)) })}
              />
            </label>
            <p className="hint">Walk-in stays in the room. Kitchen plates to this table.</p>
          </>
        ) : (
          <p className="hint">Walk-in pickup at the house. No table needed.</p>
        )
      ) : (
        <>
          <label>
            Written location
            <input
              value={value.address}
              onChange={(e) => onChange({ ...value, address: e.target.value })}
              placeholder="Street, estate, landmark"
            />
          </label>
          <button className="btn btn-ghost" type="button" onClick={pinLiveMap}>
            Use live map
          </button>
          {value.lat != null && value.lng != null ? (
            <iframe
              className="live-map"
              title="Takeaway location"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${value.lng - 0.01}%2C${value.lat - 0.01}%2C${value.lng + 0.01}%2C${value.lat + 0.01}&layer=mapnik&marker=${value.lat}%2C${value.lng}`}
            />
          ) : (
            <p className="hint">Pin the drop on a live map, or leave a written address. A rider takes this ticket.</p>
          )}
        </>
      )}
    </div>
  );
}

export function fulfillmentPayload(value: FulfillmentChoice) {
  if (value.fulfillment === "walk_in") {
    return {
      fulfillment: "walk_in" as const,
      tableName: value.tableName || undefined,
      seats: value.seats || undefined,
    };
  }
  return {
    fulfillment: "takeaway" as const,
    address: value.address || undefined,
    lat: value.lat,
    lng: value.lng,
  };
}

export function fulfillmentLabel(order: {
  fulfillment?: string;
  tableName?: string;
  seats?: number;
  address?: string;
  lat?: number;
  lng?: number;
}) {
  if (order.fulfillment === "takeaway" || order.address || order.lat != null) {
    const pin = order.lat != null && order.lng != null ? `${order.lat.toFixed(4)}, ${order.lng.toFixed(4)}` : "";
    return ["Takeaway", order.address, pin].filter(Boolean).join(" · ");
  }
  if (order.tableName) return `Walk-in · ${order.tableName}${order.seats ? ` · ${order.seats} chairs` : ""}`;
  return "Walk-in";
}
