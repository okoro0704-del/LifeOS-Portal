function greetingFor(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function GreetingsHeader({
  name,
  brand,
  role,
  onLogout,
}: {
  name: string;
  brand: string;
  role: string;
  onLogout: () => void;
}) {
  return (
    <header className="greet-head" data-testid="greetings-header">
      <div>
        <p>
          {greetingFor()}, {name}
        </p>
        <h1>
          {brand} · {role.replaceAll("_", " ")}
        </h1>
      </div>
      <button className="btn btn-ghost" type="button" onClick={onLogout}>
        Sign out
      </button>
    </header>
  );
}
