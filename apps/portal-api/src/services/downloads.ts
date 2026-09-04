import { getOsDownload, type OsDownload } from "@lifeos-portal/shared";

export function downloadArtifact(os: OsDownload): Buffer {
  return Buffer.from(
    [
      `LifeOS Portal test artifact`,
      `osId: ${os.osId}`,
      `name: ${os.displayName}`,
      `version: ${os.version}`,
      `kind: ${os.kind}`,
      ``,
      `This is a standalone tester package. TrustID is not required.`,
      `Replace this file with a real APK, Electron build, or web installer when publishing.`,
    ].join("\n"),
  );
}

export function resolveDownload(osId: string): OsDownload | undefined {
  return getOsDownload(osId);
}
