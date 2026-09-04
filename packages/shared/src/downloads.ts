export type DownloadKind = "web" | "desktop" | "android";

export type OsDownload = {
  osId: string;
  displayName: string;
  description: string;
  filename: string;
  kind: DownloadKind;
  version: string;
};

export const OS_DOWNLOADS: OsDownload[] = [
  {
    osId: "lifeos",
    displayName: "LifeOS",
    description: "Personal life shell for standalone portal testing.",
    filename: "LifeOS-tester.zip",
    kind: "desktop",
    version: "0.1.0-test",
  },
  {
    osId: "financeos",
    displayName: "FinanceOS",
    description: "Finance operations shell. Test package only.",
    filename: "FinanceOS-tester.zip",
    kind: "desktop",
    version: "0.1.0-test",
  },
  {
    osId: "realestateos",
    displayName: "RealEstateOS",
    description: "Property and listings shell. Test package only.",
    filename: "RealEstateOS-tester.zip",
    kind: "desktop",
    version: "0.1.0-test",
  },
  {
    osId: "ellfstream",
    displayName: "ellFStream",
    description: "Streaming and media shell. Test package only.",
    filename: "ellFStream-tester.apk",
    kind: "android",
    version: "0.1.0-test",
  },
  {
    osId: "liveos",
    displayName: "LiveOS",
    description: "Live operations shell. Test package only.",
    filename: "LiveOS-tester.zip",
    kind: "web",
    version: "0.1.0-test",
  },
  {
    osId: "hospitalityos",
    displayName: "HospitalityOS",
    description: "Hotels, dining, and venue verticals.",
    filename: "HospitalityOS-tester.zip",
    kind: "web",
    version: "0.1.0-test",
  },
  {
    osId: "ecommerceos",
    displayName: "ECommerceOS",
    description: "Storefront and commerce verticals.",
    filename: "ECommerceOS-tester.zip",
    kind: "web",
    version: "0.1.0-test",
  },
  {
    osId: "transportationos",
    displayName: "TransportationOS",
    description: "Logistics, rentals, and hub verticals.",
    filename: "TransportationOS-tester.zip",
    kind: "web",
    version: "0.1.0-test",
  },
];

export function getOsDownload(osId: string): OsDownload | undefined {
  return OS_DOWNLOADS.find((row) => row.osId === osId);
}
