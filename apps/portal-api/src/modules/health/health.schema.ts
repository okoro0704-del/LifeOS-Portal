import { Type, type Static } from "@sinclair/typebox";

export const LivenessResponse = Type.Object({
  ok: Type.Literal(true),
  service: Type.String(),
  trustIdMode: Type.String(),
  trustIdAuthMode: Type.String(),
  installMode: Type.String(),
  gatewayMode: Type.String(),
  primitives: Type.Array(Type.String()),
});

export const UpstreamState = Type.Union([Type.Literal("UP"), Type.Literal("DOWN")]);
/** A dependency that is switched off is reported as such, never as a probed-healthy UP. */
export const OptionalUpstreamState = Type.Union([Type.Literal("UP"), Type.Literal("DOWN"), Type.Literal("DISABLED")]);

export const ReadinessResponse = Type.Object({
  status: Type.Union([Type.Literal("healthy"), Type.Literal("degraded")]),
  timestamp: Type.String({ format: "date-time" }),
  upstreams: Type.Object({
    datazone: UpstreamState,
    trustId: OptionalUpstreamState,
    finprove: UpstreamState,
  }),
});

export const ReadyResponse = Type.Intersect([
  ReadinessResponse,
  Type.Object({
    ready: Type.Boolean(),
    service: Type.String(),
    mode: Type.String(),
  }),
]);

export type LivenessResponse = Static<typeof LivenessResponse>;
export type ReadinessResponse = Static<typeof ReadinessResponse>;
export type ReadyResponse = Static<typeof ReadyResponse>;
