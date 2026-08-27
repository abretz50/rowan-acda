import { randomBytes } from 'node:crypto';

// Avoid ambiguous characters (0/O, 1/I/L) so codes are easy to read off a
// projector/whiteboard and re-type on a phone.
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCheckinCode(length = 6) {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += CHARSET[bytes[i] % CHARSET.length];
  return out;
}
