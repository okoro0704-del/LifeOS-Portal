import { XMLParser, XMLValidator } from "fast-xml-parser";

export type XmlNode = Record<string, unknown>;

export type NamecheapEnvelope = {
  status: "OK" | "ERROR";
  errors: Array<{ number: string; message: string }>;
  warnings: string[];
  command: string | null;
  commandResponse: XmlNode;
};

export class NamecheapXmlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NamecheapXmlError";
  }
}

const ARRAY_TAGS = new Set([
  "Error",
  "Warning",
  "DomainCheckResult",
  "Domain",
  "host",
  "Host",
  "ProductType",
  "ProductCategory",
  "Product",
  "Price",
]);

const MAX_XML_BYTES = 2_000_000;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  processEntities: false,
  htmlEntities: false,
  allowBooleanAttributes: false,
  isArray: (name) => ARRAY_TAGS.has(name),
});

/**
 * Parse a Namecheap XML response. DTDs/entities are refused outright so no
 * external entity or expansion attack can reach the parser.
 */
export function parseNamecheapXml(xml: string): NamecheapEnvelope {
  if (typeof xml !== "string" || !xml.trim()) throw new NamecheapXmlError("empty_response");
  if (xml.length > MAX_XML_BYTES) throw new NamecheapXmlError("response_too_large");
  if (/<!DOCTYPE/i.test(xml) || /<!ENTITY/i.test(xml)) throw new NamecheapXmlError("dtd_not_allowed");
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new NamecheapXmlError("malformed_xml");

  let doc: XmlNode;
  try {
    doc = parser.parse(xml) as XmlNode;
  } catch {
    throw new NamecheapXmlError("malformed_xml");
  }
  const root = doc.ApiResponse as XmlNode | undefined;
  if (!root || typeof root !== "object") throw new NamecheapXmlError("missing_api_response");

  const statusRaw = String(root["@_Status"] ?? "").toUpperCase();
  if (statusRaw !== "OK" && statusRaw !== "ERROR") throw new NamecheapXmlError("unknown_status");

  const errors: NamecheapEnvelope["errors"] = [];
  const errorsNode = root.Errors as XmlNode | string | undefined;
  if (errorsNode && typeof errorsNode === "object") {
    for (const item of asArray(errorsNode.Error)) {
      if (item && typeof item === "object") {
        const node = item as XmlNode;
        errors.push({ number: String(node["@_Number"] ?? ""), message: textOf(node) });
      } else if (item != null) {
        errors.push({ number: "", message: String(item) });
      }
    }
  }
  const warnings: string[] = [];
  const warningsNode = root.Warnings as XmlNode | string | undefined;
  if (warningsNode && typeof warningsNode === "object") {
    for (const item of asArray(warningsNode.Warning)) warnings.push(typeof item === "object" ? textOf(item as XmlNode) : String(item));
  }

  const commandResponse = (root.CommandResponse && typeof root.CommandResponse === "object"
    ? root.CommandResponse
    : {}) as XmlNode;
  if (statusRaw === "OK" && !root.CommandResponse) throw new NamecheapXmlError("missing_command_response");

  return {
    status: statusRaw,
    errors,
    warnings,
    command: root.RequestedCommand == null ? null : String(root.RequestedCommand),
    commandResponse,
  };
}

export function asArray(value: unknown): unknown[] {
  if (value == null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

export function textOf(node: XmlNode): string {
  const text = node["#text"];
  return text == null ? "" : String(text);
}

export function attr(node: unknown, name: string): string | null {
  if (!node || typeof node !== "object") return null;
  const value = (node as XmlNode)[`@_${name}`];
  return value == null ? null : String(value);
}

export function boolAttr(node: unknown, name: string): boolean | null {
  const value = attr(node, name);
  if (value == null) return null;
  const v = value.trim().toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

export function child(node: unknown, name: string): XmlNode | null {
  if (!node || typeof node !== "object") return null;
  const value = (node as XmlNode)[name];
  if (Array.isArray(value)) return (value[0] as XmlNode) ?? null;
  return value && typeof value === "object" ? (value as XmlNode) : null;
}

export function children(node: unknown, name: string): XmlNode[] {
  if (!node || typeof node !== "object") return [];
  return asArray((node as XmlNode)[name]).filter((v): v is XmlNode => Boolean(v) && typeof v === "object");
}
