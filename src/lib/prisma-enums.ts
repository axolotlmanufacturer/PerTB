import type { $Enums } from '@prisma/client';
import type { FormFactor } from './taxonomy';

/**
 * Form-factor translation at the Prisma boundary.
 *
 * The taxonomy keys `3.5` and `2.5` cannot be Prisma enum identifiers — a
 * Prisma enum member may not start with a digit — so the schema declares them
 * as `ff_3_5 @map("3.5")` and `ff_2_5 @map("2.5")`.
 *
 * The value STORED IN POSTGRES is still `3.5`, which is what keeps the URL
 * parameters, the API surface and the database column identical (the drift
 * test in taxonomy.test.ts checks exactly that, resolving @map). Only the
 * generated TypeScript identifier differs, and only here.
 *
 * Every other axis maps identically and needs no translation.
 */

const TO_PRISMA: Record<FormFactor, $Enums.FormFactor> = {
  '3.5': 'ff_3_5',
  '2.5': 'ff_2_5',
  m2_2280: 'm2_2280',
  m2_2230: 'm2_2230',
  u2: 'u2',
  ext_desktop: 'ext_desktop',
  ext_portable: 'ext_portable',
};

const FROM_PRISMA = Object.fromEntries(
  Object.entries(TO_PRISMA).map(([key, value]) => [value, key]),
) as Record<$Enums.FormFactor, FormFactor>;

export function toPrismaFormFactor(value: FormFactor): $Enums.FormFactor;
export function toPrismaFormFactor(value: FormFactor | null): $Enums.FormFactor | null;
export function toPrismaFormFactor(value: FormFactor | null): $Enums.FormFactor | null {
  return value === null ? null : TO_PRISMA[value];
}

export function fromPrismaFormFactor(value: $Enums.FormFactor): FormFactor;
export function fromPrismaFormFactor(value: $Enums.FormFactor | null): FormFactor | null;
export function fromPrismaFormFactor(value: $Enums.FormFactor | null): FormFactor | null {
  return value === null ? null : FROM_PRISMA[value];
}
