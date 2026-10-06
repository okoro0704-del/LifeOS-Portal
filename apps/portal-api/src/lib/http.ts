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

/**
 * Time budgets for every dependency Portal calls over HTTP. One table instead of literals at each call
 * site; a call that does not name a budget gets `default`. The budget covers the whole exchange
 * (connect, headers and body), because the abort signal stays attached while the body is read.
 */
export const UPSTREAM_TIMEOUTS_MS = {
  default: 12_000,
  /** Provisioning calls that create tenant resources upstream. */
  provisioning: 20_000,
  /** Netlify API (domain aliases). */
  netlify: 15_000,
  /** ElfCom device registration (fire-and-forget push binding). */
  push: 4_000,
  /** Offline Kernel service (stations, channels, reconciliation). */
  offlineKernel: 10_000,
} as const;

function isAbort(err: unknown) {
  const name = (err as { name?: string } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

/**
 * fetch with a mandatory deadline and safe error mapping. Network failures and timeouts both become
 * `503 upstream_unavailable` (callers such as os-mode treat that code as "fall back"); the message
 * names the dependency, never the internal URL. A caller-supplied signal still cancels the request.
 */
export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit & { timeoutMs?: number; dependency?: string } = {},
): Promise<Response> {
  const { timeoutMs = UPSTREAM_TIMEOUTS_MS.default, dependency = "Upstream service", signal, ...rest } = init;
  const deadline = AbortSignal.timeout(timeoutMs);
  try {
    return await fetch(input, { ...rest, signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
  } catch (err) {
    if (isAbort(err) && deadline.aborted) {
      throw new HttpError(`${dependency} did not respond in time.`, 503, "upstream_unavailable");
    }
    throw new HttpError(`${dependency} is unreachable.`, 503, "upstream_unavailable");
  }
}

/** A fetch with a fixed budget, for clients that accept an injected fetch (e.g. the Offline Kernel client). */
export function boundedFetch(dependency: string, timeoutMs: number): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input;
    return fetchWithTimeout(url, { ...init, timeoutMs, dependency });
  }) as typeof fetch;
}

export async function httpJson<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit & { timeoutMs?: number; dependency?: string },
): Promise<T> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const res = await fetchWithTimeout(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  let text: string;
  try {
    text = await res.text();
  } catch {
    // The deadline can fire while the body is still streaming.
    throw new HttpError(`${init?.dependency ?? "Upstream service"} did not respond in time.`, 503, "upstream_unavailable");
  }
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
