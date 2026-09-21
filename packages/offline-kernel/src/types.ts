/** Cloud Offline Kernel contracts — shared by service, Portal, LifeOS, mybrandOS. */

export const KERNEL_SERVICE_NAME = "offline-kernel" as const;

export const STATION_STATUSES = ["ACTIVE", "PAUSED", "PROVISIONING", "FAILED"] as const;
export type StationStatus = (typeof STATION_STATUSES)[number];

export const DELIVERABLE_STATUSES = [
  "NOT_PROVISIONED",
  "PROVISIONING",
  "ACTIVE",
  "PAUSED",
  "FAILED",
] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

export const STATION_CHANNELS = ["TV", "RADIO"] as const;
export type StationChannel = (typeof STATION_CHANNELS)[number];

export const PROGRAM_KINDS = [
  "CONTENT",
  "LIVE",
  "REPLAY",
  "ADVERTISEMENT",
  "PLAYLIST",
  "PRESENTER_SEGMENT",
] as const;
export type ProgramKind = (typeof PROGRAM_KINDS)[number];

export type Station = {
  id: string;
  ownerId: string;
  slug: string;
  status: StationStatus;
  tvEnabled: boolean;
  radioEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StationProgram = {
  id: string;
  stationId: string;
  channelType: StationChannel;
  kind: ProgramKind;
  title: string;
  assetId: string | null;
  mediaUrl: string | null;
  coverUrl: string | null;
  durationMs: number;
  startMinute: number | null;
  sponsored: boolean;
  order: number;
  createdAt: string;
};

export type StationPlaylist = {
  id: string;
  stationId: string;
  channelType: StationChannel;
  title: string;
  itemIds: string[];
  updatedAt: string;
};

export type ChannelState = {
  stationId: string;
  channelType: StationChannel;
  status: StationStatus;
  scheduleVersion: number;
  packageVersion: number;
  contentVersion: number;
  currentProgramId: string | null;
  fallbackPlaylistId: string | null;
};

export type StationPackage = {
  stationId: string;
  slug: string;
  packageVersion: number;
  scheduleVersion: number;
  contentVersion: number;
  generatedAt: string;
  integrity: {
    algo: "sha256";
    hash: string;
  };
  station: Station;
  tv: ChannelState;
  radio: ChannelState;
  programs: StationProgram[];
  playlists: StationPlaylist[];
};

export type ConsumptionEvent = {
  stationId: string;
  channelType: StationChannel;
  programId: string | null;
  assetId: string | null;
  deviceId: string;
  offsetMs: number;
  watchedMs: number;
  offline: boolean;
  at: string;
};

export type ProvisionStationInput = {
  ownerId: string;
  slug: string;
  tvEnabled?: boolean;
  radioEnabled?: boolean;
};

export type KernelHealth = {
  service: typeof KERNEL_SERVICE_NAME;
  status: "ok" | "degraded" | "error";
  database: boolean;
  scheduler: boolean;
  version: string;
  ready: boolean;
};

export type CreatorDeliverableStatuses = {
  space: DeliverableStatus;
  app: DeliverableStatus;
  diginews: DeliverableStatus;
  digipedia: DeliverableStatus;
  tv: DeliverableStatus;
  radio: DeliverableStatus;
  stationId: string | null;
};
