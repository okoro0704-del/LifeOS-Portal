import { createHash } from "node:crypto";
import type { Station, StationPackage, StationProgram, StationPlaylist, ChannelState } from "./types.js";

export function stationIdForSlug(slug: string): string {
  return `station:${slug.trim().toLowerCase()}`;
}

export function channelState(
  station: Station,
  channelType: "TV" | "RADIO",
  versions: { scheduleVersion: number; packageVersion: number; contentVersion: number },
): ChannelState {
  const enabled = channelType === "TV" ? station.tvEnabled : station.radioEnabled;
  return {
    stationId: station.id,
    channelType,
    status: enabled ? station.status : "PAUSED",
    scheduleVersion: versions.scheduleVersion,
    packageVersion: versions.packageVersion,
    contentVersion: versions.contentVersion,
    currentProgramId: null,
    fallbackPlaylistId: `${station.id}:${channelType.toLowerCase()}:fallback`,
  };
}

export function buildStationPackage(input: {
  station: Station;
  programs: StationProgram[];
  playlists: StationPlaylist[];
  scheduleVersion: number;
  packageVersion: number;
  contentVersion: number;
}): StationPackage {
  const versions = {
    scheduleVersion: input.scheduleVersion,
    packageVersion: input.packageVersion,
    contentVersion: input.contentVersion,
  };
  const payload = {
    stationId: input.station.id,
    slug: input.station.slug,
    packageVersion: versions.packageVersion,
    scheduleVersion: versions.scheduleVersion,
    contentVersion: versions.contentVersion,
    generatedAt: new Date().toISOString(),
    station: input.station,
    tv: channelState(input.station, "TV", versions),
    radio: channelState(input.station, "RADIO", versions),
    programs: input.programs,
    playlists: input.playlists,
  };
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return {
    ...payload,
    integrity: { algo: "sha256", hash },
  };
}

export function deliverableFromStation(station: Station | null): {
  tv: import("./types.js").DeliverableStatus;
  radio: import("./types.js").DeliverableStatus;
  stationId: string | null;
} {
  if (!station) {
    return { tv: "NOT_PROVISIONED", radio: "NOT_PROVISIONED", stationId: null };
  }
  if (station.status === "PROVISIONING") {
    return { tv: "PROVISIONING", radio: "PROVISIONING", stationId: station.id };
  }
  if (station.status === "FAILED") {
    return { tv: "FAILED", radio: "FAILED", stationId: station.id };
  }
  return {
    tv: station.tvEnabled ? (station.status === "PAUSED" ? "PAUSED" : "ACTIVE") : "PAUSED",
    radio: station.radioEnabled ? (station.status === "PAUSED" ? "PAUSED" : "ACTIVE") : "PAUSED",
    stationId: station.id,
  };
}
