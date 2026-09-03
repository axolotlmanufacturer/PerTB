'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { toPrismaFormFactor } from '@/lib/prisma-enums';
import {
  isFormFactor,
  isInterface,
  isTechnology,
  type FormFactor,
  type Interface,
  type Technology,
} from '@/lib/taxonomy';

/**
 * The three review actions (ticket 7.2).
 *
 * Server Actions posted from real <form> elements, so they work with JavaScript
 * disabled like the rest of the site. The gate is the middleware on /admin —
 * these are reachable only through it.
 *
 * All three set `reviewedAt`, which is what stops the next ingest sweep undoing
 * the decision three hours later.
 */

/** Confidence assigned by a human who read the listing. Not a parser output. */
const HUMAN_VERIFIED = 1;

function readAxis<T extends string>(
  data: FormData,
  field: string,
  guard: (v: unknown) => v is T,
): T | null {
  const value = data.get(field);
  return typeof value === 'string' && guard(value) ? value : null;
}

/**
 * Publish it as parsed.
 *
 * For the case where the parser read the drive correctly and only lacked the
 * confidence to say so — an unusual title, a family not in the dictionary. The
 * reviewer has checked the listing; that is a verification, not a guess, which
 * is why it is allowed to raise confidence (CLAUDE.md §1.1).
 */
export async function promoteProduct(formData: FormData): Promise<void> {
  const id = String(formData.get('productId') ?? '');
  if (!id) return;

  await prisma.product.update({
    where: { id },
    data: {
      confidence: HUMAN_VERIFIED,
      reviewedAt: new Date(),
      reviewedNote: 'Promoted as parsed',
    },
  });
  revalidatePath('/admin/quarantine');
}

/** Fix the axes, then publish. Blank fields stay unknown rather than guessed. */
export async function correctProduct(formData: FormData): Promise<void> {
  const id = String(formData.get('productId') ?? '');
  if (!id) return;

  const technology = readAxis<Technology>(formData, 'technology', isTechnology);
  const formFactor = readAxis<FormFactor>(formData, 'formFactor', isFormFactor);
  const iface = readAxis<Interface>(formData, 'interface', isInterface);
  const note = String(formData.get('note') ?? '').slice(0, 500);

  await prisma.product.update({
    where: { id },
    data: {
      technology,
      formFactor: toPrismaFormFactor(formFactor),
      interface: iface,
      confidence: HUMAN_VERIFIED,
      reviewedAt: new Date(),
      reviewedNote: note || 'Corrected in review',
    },
  });
  revalidatePath('/admin/quarantine');
}

/**
 * Not a drive, or not fixable.
 *
 * Flagged rather than deleted: the next sweep would re-create a deleted row
 * within three hours and put it straight back in the queue. The offers are
 * removed so nothing about it can reach a read path, and the flag survives.
 */
export async function rejectProduct(formData: FormData): Promise<void> {
  const id = String(formData.get('productId') ?? '');
  if (!id) return;

  const note = String(formData.get('note') ?? '').slice(0, 500);

  await prisma.product.update({
    where: { id },
    data: {
      rejected: true,
      reviewedAt: new Date(),
      reviewedNote: note || 'Rejected in review',
    },
  });
  revalidatePath('/admin/quarantine');
}
