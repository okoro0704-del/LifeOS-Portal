export class HttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export async function httpJson<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const timeoutMs = init?.timeoutMs ?? 12_000;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new HttpError(
      `Upstream unreachable: ${url}`,
      503,
      "upstream_unavailable",
    );
  }

  const text = await res.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  if (!res.ok) {
    const msg =
      typeof body === "object" && body && "message" in body
        ? String((body as { message: unknown }).message)
        : typeof body === "object" && body && "error" in body
          ? String((body as { error: unknown }).error)
          : `HTTP ${res.status}`;
    throw new HttpError(msg, res.status, "upstream_error");
  }

  return body as T;
}
