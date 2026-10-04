import { z } from "zod";
import type { RegistrantContact, RegistrantProfileSummary } from "@lifeos-portal/shared";
import { DomainInfraError } from "./errors.js";
import type { RegistrantContacts } from "./provider.js";
import type { RegistrantProfileRecord } from "./types.js";

const text = (max: number) => z.string().trim().min(1).max(max);
const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const registrantContactSchema = z.object({
  firstName: text(255),
  lastName: text(255),
  organizationName: optional(255),
  jobTitle: optional(255),
  address1: text(255),
  address2: optional(255),
  city: text(50),
  stateProvince: text(50),
  postalCode: text(50),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use a 2-letter country code"),
  phone: z.string().trim().regex(/^\+\d{1,3}\.\d{4,14}$/, "Use the format +CCC.NNNNNNNNNN"),
  email: z.string().trim().email().max(255),
});

export const registrantProfileInputSchema = z.object({
  label: z.string().trim().min(1).max(80),
  registrant: registrantContactSchema,
  admin: registrantContactSchema.nullable().optional(),
  tech: registrantContactSchema.nullable().optional(),
  billing: registrantContactSchema.nullable().optional(),
});

export type RegistrantProfileInput = z.infer<typeof registrantProfileInputSchema>;

export function profileComplete(profile: RegistrantProfileRecord) {
  return [profile.registrant, profile.admin, profile.tech, profile.billing]
    .filter((c): c is RegistrantContact => Boolean(c))
    .every((c) => registrantContactSchema.safeParse(c).success);
}

/** Admin/tech/billing reuse the registrant unless the owner supplied separate contacts. */
export function contactsFor(profile: RegistrantProfileRecord): RegistrantContacts {
  if (!profileComplete(profile)) throw new DomainInfraError("INVALID_REGISTRANT");
  return {
    registrant: profile.registrant,
    admin: profile.admin ?? profile.registrant,
    tech: profile.tech ?? profile.registrant,
    billing: profile.billing ?? profile.registrant,
  };
}

function maskEmail(email: string) {
  const [user = "", host = ""] = email.split("@");
  return `${user.slice(0, 1)}***@${host}`;
}

export function summarizeProfile(profile: RegistrantProfileRecord): RegistrantProfileSummary {
  return {
    id: profile.id,
    label: profile.label,
    complete: profileComplete(profile),
    country: profile.registrant.country,
    emailMasked: maskEmail(profile.registrant.email),
    contactsReuseRegistrant: !profile.admin && !profile.tech && !profile.billing,
    updatedAt: profile.updatedAt,
  };
}
