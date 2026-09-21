import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  buildStationPackage,
  stationIdForSlug,
  type ConsumptionEvent,
  type Station,
  type StationChannel,
  type StationPackage,
  type StationPlaylist,
  type StationProgram,
} from "@lifeos-portal/offline-kernel";
import { randomUUID } from "node:crypto";

export type KernelDb = {
  stations: Record<string, Station>;
  programs: Record<string, StationProgram>;
  playlists: Record<string, StationPlaylist>;
  packages: Record<string, StationPackage>;
  versions: Record<string, { scheduleVersion: number; packageVersion: number; contentVersion: number }>;
  consumption: ConsumptionEvent[];
};

function emptyDb(): KernelDb {
  return {
    stations: {},
    programs: {},
    playlists: {},
    packages: {},
    versions: {},
    consumption: [],
  };
}

function dataPath(): string {
  const root = process.env.OFFLINE_KERNEL_DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || "./data";
  return join(root, "offline-kernel.json");
}

export class KernelStore {
  private db: KernelDb;
  private path: string;
  ok = true;

  constructor(path = dataPath()) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) {
      try {
        this.db = { ...emptyDb(), ...(JSON.parse(readFileSync(path, "utf8")) as KernelDb) };
      } catch {
        this.db = emptyDb();
        this.ok = false;
      }
    } else {
      this.db = emptyDb();
      this.persist();
    }
  }

  private persist() {
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.db, null, 2), "utf8");
    renameSync(tmp, this.path);
    this.ok = true;
  }

  listStations(): Station[] {
    return Object.values(this.db.stations);
  }

  getStation(id: string): Station | null {
    return this.db.stations[id] ?? null;
  }

  getBySlug(slug: string): Station | null {
    const id = stationIdForSlug(slug);
    return this.db.stations[id] ?? Object.values(this.db.stations).find((s) => s.slug === slug) ?? null;
  }

  provision(input: {
    ownerId: string;
    slug: string;
    tvEnabled?: boolean;
    radioEnabled?: boolean;
  }): Station {
    const slug = input.slug.trim().toLowerCase();
    const existing = this.getBySlug(slug);
    if (existing) {
      const updated: Station = {
        ...existing,
        ownerId: input.ownerId || existing.ownerId,
        tvEnabled: input.tvEnabled ?? existing.tvEnabled,
        radioEnabled: input.radioEnabled ?? existing.radioEnabled,
        status: existing.status === "FAILED" ? "ACTIVE" : existing.status,
        updatedAt: new Date().toISOString(),
      };
      this.db.stations[existing.id] = updated;
      this.ensureChannels(updated);
      this.persist();
      return updated;
    }
    const now = new Date().toISOString();
    const station: Station = {
      id: stationIdForSlug(slug),
      ownerId: input.ownerId,
      slug,
      status: "ACTIVE",
      tvEnabled: input.tvEnabled !== false,
      radioEnabled: input.radioEnabled !== false,
      createdAt: now,
      updatedAt: now,
    };
    this.db.stations[station.id] = station;
    this.db.versions[station.id] = { scheduleVersion: 1, packageVersion: 1, contentVersion: 1 };
    this.ensureChannels(station);
    this.persist();
    return station;
  }

  private ensureChannels(station: Station) {
    for (const channelType of ["TV", "RADIO"] as const) {
      const id = `${station.id}:${channelType.toLowerCase()}:fallback`;
      if (!this.db.playlists[id]) {
        this.db.playlists[id] = {
          id,
          stationId: station.id,
          channelType,
          title: `${channelType} fallback`,
          itemIds: [],
          updatedAt: new Date().toISOString(),
        };
      }
    }
  }

  versions(stationId: string) {
    return this.db.versions[stationId] ?? { scheduleVersion: 1, packageVersion: 1, contentVersion: 1 };
  }

  programsFor(stationId: string, channel?: StationChannel): StationProgram[] {
    return Object.values(this.db.programs)
      .filter((p) => p.stationId === stationId && (!channel || p.channelType === channel))
      .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
  }

  addPrograms(
    stationId: string,
    rows: Array<Partial<StationProgram> & Pick<StationProgram, "channelType" | "title" | "kind">>,
  ): StationProgram[] {
    const station = this.getStation(stationId);
    if (!station) throw new Error("station_not_found");
    const out: StationProgram[] = [];
    const now = new Date().toISOString();
    let order = this.programsFor(stationId).length;
    for (const row of rows) {
      const id = row.id || `prog_${randomUUID().slice(0, 12)}`;
      const program: StationProgram = {
        id,
        stationId,
        channelType: row.channelType,
        kind: row.kind,
        title: row.title,
        assetId: row.assetId ?? null,
        mediaUrl: row.mediaUrl ?? null,
        coverUrl: row.coverUrl ?? null,
        durationMs: row.durationMs && row.durationMs > 0 ? row.durationMs : 180_000,
        startMinute: row.startMinute ?? null,
        sponsored: Boolean(row.sponsored),
        order: typeof row.order === "number" ? row.order : order++,
        createdAt: now,
      };
      this.db.programs[id] = program;
      out.push(program);
      const fallbackId = `${stationId}:${row.channelType.toLowerCase()}:fallback`;
      const pl = this.db.playlists[fallbackId];
      if (pl && !pl.itemIds.includes(id)) {
        pl.itemIds.push(id);
        pl.updatedAt = now;
      }
    }
    const v = this.versions(stationId);
    v.scheduleVersion += 1;
    v.contentVersion += 1;
    this.db.versions[stationId] = v;
    this.persist();
    return out;
  }

  upsertPlaylist(stationId: string, playlist: Omit<StationPlaylist, "stationId" | "updatedAt">): StationPlaylist {
    if (!this.getStation(stationId)) throw new Error("station_not_found");
    const row: StationPlaylist = {
      ...playlist,
      stationId,
      updatedAt: new Date().toISOString(),
    };
    this.db.playlists[row.id] = row;
    const v = this.versions(stationId);
    v.scheduleVersion += 1;
    this.db.versions[stationId] = v;
    this.persist();
    return row;
  }

  publish(stationId: string): StationPackage {
    const station = this.getStation(stationId);
    if (!station) throw new Error("station_not_found");
    const v = this.versions(stationId);
    v.packageVersion += 1;
    this.db.versions[stationId] = v;
    const pkg = buildStationPackage({
      station,
      programs: this.programsFor(stationId),
      playlists: Object.values(this.db.playlists).filter((p) => p.stationId === stationId),
      ...v,
    });
    this.db.packages[stationId] = pkg;
    this.persist();
    return pkg;
  }

  getPackage(stationId: string): StationPackage | null {
    if (this.db.packages[stationId]) return this.db.packages[stationId]!;
    const station = this.getStation(stationId);
    if (!station) return null;
    return this.publish(stationId);
  }

  reconcile(events: ConsumptionEvent[]): number {
    for (const ev of events) this.db.consumption.push(ev);
    if (this.db.consumption.length > 10_000) {
      this.db.consumption = this.db.consumption.slice(-10_000);
    }
    this.persist();
    return events.length;
  }
}
