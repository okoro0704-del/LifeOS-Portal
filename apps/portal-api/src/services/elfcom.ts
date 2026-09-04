import { config } from "../config.js";

const ELFCOM_APP_ID = "life_os";

const tokens = new Map<string, { userId: string; pushToken: string; appId: string; updatedAt: string }>();

export function registerPushToken(userId: string, pushToken: string) {
  const row = {
    userId,
    pushToken,
    appId: ELFCOM_APP_ID,
    updatedAt: new Date().toISOString(),
  };
  tokens.set(userId, row);
  return row;
}

export function getPushToken(userId: string) {
  return tokens.get(userId);
}

export async function notifyElfCom(userId: string, pushToken: string): Promise<{ forwarded: boolean }> {
  if (!config.elfcomApiUrl || !config.elfcomBaasApiKey) {
    return { forwarded: false };
  }
  const res = await fetch(`${config.elfcomApiUrl.replace(/\/$/, "")}/v1/devices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.elfcomBaasApiKey}`,
    },
    body: JSON.stringify({
      userId,
      pushToken,
      appId: ELFCOM_APP_ID,
    }),
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) {
    throw new Error(`ElfCom register failed: HTTP ${res.status}`);
  }
  return { forwarded: true };
}
