import { createHash, randomBytes, randomUUID } from "node:crypto";

export function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function newId(prefix = ""): string {
  const id = randomUUID().replace(/-/g, "").slice(0, 16);
  return prefix ? `${prefix}_${id}` : id;
}

export function publicDisplayName(trustId: string) {
  if (trustId.length <= 10) return trustId;
  return `${trustId.slice(0, 4)}…${trustId.slice(-4)}`;
}
