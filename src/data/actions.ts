import type { Op } from '../domain/satka';
import { t } from '../i18n/bg';
import { enqueue } from './outbox';
import { isOnline, syncNow } from './sync';

export const newId = (): string => crypto.randomUUID();
export const nowISO = (): string => new Date().toISOString();

/**
 * Saves a change: applied on this device immediately and sent to the server
 * now or as soon as there is signal. Throws DomainError if not allowed.
 * Returns the message to show the user.
 */
export async function perform(op: Op, userName: string): Promise<string> {
  await enqueue(op, userName);
  void syncNow();
  return isOnline() ? t.sync.saved : t.sync.savedOffline;
}

/**
 * Saves several changes in order (e.g. creating a whole line of satki).
 * Changes that are not allowed are skipped. Returns how many were saved.
 */
export async function performMany(ops: Op[], userName: string): Promise<number> {
  let saved = 0;
  for (const op of ops) {
    try {
      await enqueue(op, userName);
      saved++;
    } catch {
      // e.g. the position was taken meanwhile — skip it
    }
  }
  void syncNow();
  return saved;
}
