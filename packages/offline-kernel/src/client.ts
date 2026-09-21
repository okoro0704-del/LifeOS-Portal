import type {
  ChannelState,
  ConsumptionEvent,
  KernelHealth,
  ProvisionStationInput,
  Station,
  StationChannel,
  StationPackage,
  StationProgram,
  StationPlaylist,
} from "./types.js";

export type OfflineKernelClientOptions = {
  baseUrl: string;
  /** Service-to-service bearer for privileged writes. Never ship to browsers. */
  serviceToken?: string;
  fetchImpl?: typeof fetch;
};

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export class OfflineKernelClient {
  private readonly baseUrl: string;
  private readonly serviceToken?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OfflineKernelClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.serviceToken = opts.serviceToken;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private headers(privileged = false): HeadersInit {
    const h: Record<string, string> = { Accept: "application/json" };
    if (privileged && this.serviceToken) {
      h.Authorization = `Bearer ${this.serviceToken}`;
    }
    return h;
  }

  async health(): Promise<KernelHealth> {
    const res = await this.fetchImpl(joinUrl(this.baseUrl, "/health"));
    if (!res.ok) throw new Error(`kernel_health_${res.status}`);
    return (await res.json()) as KernelHealth;
  }

  async ready(): Promise<KernelHealth> {
    const res = await this.fetchImpl(joinUrl(this.baseUrl, "/ready"));
    if (!res.ok) throw new Error(`kernel_ready_${res.status}`);
    return (await res.json()) as KernelHealth;
  }

  async getStation(stationId: string): Promise<Station> {
    const res = await this.fetchImpl(joinUrl(this.baseUrl, `/v1/stations/${encodeURIComponent(stationId)}`));
    if (!res.ok) throw new Error(`station_${res.status}`);
    return (await res.json()) as Station;
  }

  async getStationBySlug(slug: string): Promise<Station> {
    const res = await this.fetchImpl(
      joinUrl(this.baseUrl, `/v1/stations/by-slug/${encodeURIComponent(slug)}`),
    );
    if (!res.ok) throw new Error(`station_slug_${res.status}`);
    return (await res.json()) as Station;
  }

  async getChannel(stationId: string, channel: StationChannel): Promise<ChannelState> {
    const path = `/v1/stations/${encodeURIComponent(stationId)}/${channel.toLowerCase()}`;
    const res = await this.fetchImpl(joinUrl(this.baseUrl, path));
    if (!res.ok) throw new Error(`channel_${res.status}`);
    return (await res.json()) as ChannelState;
  }

  async getSchedule(stationId: string, channel?: StationChannel): Promise<StationProgram[]> {
    const q = channel ? `?channel=${channel}` : "";
    const res = await this.fetchImpl(
      joinUrl(this.baseUrl, `/v1/stations/${encodeURIComponent(stationId)}/schedule${q}`),
    );
    if (!res.ok) throw new Error(`schedule_${res.status}`);
    const body = (await res.json()) as { programs: StationProgram[] };
    return body.programs;
  }

  async getPackage(stationId: string): Promise<StationPackage> {
    const res = await this.fetchImpl(
      joinUrl(this.baseUrl, `/v1/stations/${encodeURIComponent(stationId)}/package`),
    );
    if (!res.ok) throw new Error(`package_${res.status}`);
    return (await res.json()) as StationPackage;
  }

  async provisionStation(input: ProvisionStationInput): Promise<Station> {
    const res = await this.fetchImpl(joinUrl(this.baseUrl, "/v1/stations"), {
      method: "POST",
      headers: { ...this.headers(true), "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`provision_${res.status}:${text.slice(0, 200)}`);
    }
    return (await res.json()) as Station;
  }

  async addPrograms(
    stationId: string,
    programs: Array<
      Omit<StationProgram, "id" | "stationId" | "createdAt"> & { id?: string }
    >,
  ): Promise<StationProgram[]> {
    const res = await this.fetchImpl(
      joinUrl(this.baseUrl, `/v1/stations/${encodeURIComponent(stationId)}/programs`),
      {
        method: "POST",
        headers: { ...this.headers(true), "Content-Type": "application/json" },
        body: JSON.stringify({ programs }),
      },
    );
    if (!res.ok) throw new Error(`programs_${res.status}`);
    const body = (await res.json()) as { programs: StationProgram[] };
    return body.programs;
  }

  async upsertPlaylist(
    stationId: string,
    playlist: Omit<StationPlaylist, "stationId" | "updatedAt"> & { updatedAt?: string },
  ): Promise<StationPlaylist> {
    const res = await this.fetchImpl(
      joinUrl(this.baseUrl, `/v1/stations/${encodeURIComponent(stationId)}/playlists`),
      {
        method: "POST",
        headers: { ...this.headers(true), "Content-Type": "application/json" },
        body: JSON.stringify(playlist),
      },
    );
    if (!res.ok) throw new Error(`playlist_${res.status}`);
    return (await res.json()) as StationPlaylist;
  }

  async publishStation(stationId: string): Promise<StationPackage> {
    const res = await this.fetchImpl(
      joinUrl(this.baseUrl, `/v1/stations/${encodeURIComponent(stationId)}/publish`),
      {
        method: "POST",
        headers: this.headers(true),
      },
    );
    if (!res.ok) throw new Error(`publish_${res.status}`);
    return (await res.json()) as StationPackage;
  }

  async reconcileConsumption(events: ConsumptionEvent[]): Promise<{ accepted: number }> {
    const res = await this.fetchImpl(joinUrl(this.baseUrl, "/v1/reconcile/consumption"), {
      method: "POST",
      headers: { ...this.headers(true), "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    });
    if (!res.ok) throw new Error(`reconcile_${res.status}`);
    return (await res.json()) as { accepted: number };
  }
}

export function createOfflineKernelClient(opts: OfflineKernelClientOptions): OfflineKernelClient {
  return new OfflineKernelClient(opts);
}
