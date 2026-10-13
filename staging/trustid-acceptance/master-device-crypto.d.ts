// Types for the Trust Center module loaded at runtime from TRUSTID_REPO/apps/web/src/lib/masterDeviceCrypto.ts.
export declare function generateDeviceKey(): Promise<{ privateKey: CryptoKey; publicKeySpki: string }>;
export declare function newDeviceFingerprint(): string;
export declare function signPayload(privateKey: CryptoKey, payload: string): Promise<string>;
export declare function assertStepUpPayloadMatches(payload: string, shown: { challenge_id: string; action: string; expires_at: string; method: string }, expected: { trustId: string; masterDeviceId: string }, now?: Date): void;
export declare function assertEnrollmentPayloadMatches(payload: string, expected: { trustId: string; publicKeySpki: string }): Promise<void>;
export declare function revokePayload(trustId: string, masterDeviceId: string): string;
export declare function keyThumbprint(publicKeySpki: string): Promise<string>;
