import { randomBytes } from "crypto";

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const INVITE_TOKEN_LENGTH = 32;

export function generateInviteToken(): string {
  const bytes = randomBytes(INVITE_TOKEN_LENGTH);
  let out = "";
  for (let i = 0; i < INVITE_TOKEN_LENGTH; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export const INVITE_TTL_DAYS = 7;
