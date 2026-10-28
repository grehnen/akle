import type { Trip } from "../engine/game";

/** Every free-play mode, in the order the player is offered them. */
export const MODE_KINDS = ["standard", "unlimited", "timed", "tie-breaker"] as const;

export type ModeKind = (typeof MODE_KINDS)[number];

export const isModeKind = (value: unknown): value is ModeKind =>
  (MODE_KINDS as readonly unknown[]).includes(value);

/** A free-play trip's mode, with the thinking time a timed-mode trip is played with. */
export type ModeSetting =
  | { kind: Exclude<ModeKind, "timed"> }
  | { kind: "timed"; thinkingTime: number };

/** A free-play trip as a link carries it: its endpoints and its mode. */
export type LinkedTrip = Trip & { mode: ModeSetting };

/**
 * What a free-play link's payload holds (ADR 0007): the pinned graph version as its ordinal
 * among graph versions ordered by start trip, and one trip (a trip link) or several (an
 * itinerary link).
 */
export type LinkPayload = {
  versionOrdinal: number;
  trips: readonly LinkedTrip[];
};

/** Why a payload doesn't decode. The count's range and the trips' kommuner are checked by the link. */
export type PayloadProblem = "malformed" | "format-version" | "checksum" | "thinking-time";

export type DecodedPayload =
  | { ok: true; payload: LinkPayload }
  | { ok: false; problem: PayloadProblem };

/** The thinking times a timed-mode trip can have, in whole seconds. */
export const THINKING_TIME_RANGE = { min: 5, max: 60 } as const;

/** The most trips one payload can hold, set by the count field. */
export const MAX_PAYLOAD_TRIPS = 31;

const FORMAT_VERSION_BITS = 4;
/** Reserved as an escape to a longer format-version field; rejected until one is needed. */
const RESERVED_FORMAT_VERSION = 15;

/**
 * Format version 1, frozen since its release: a 6-bit version ordinal, a 5-bit trip count, per
 * trip a 14-bit start and destination SCB code, a 2-bit mode and, in timed mode only, a 6-bit
 * thinking time in raw seconds; then an 8-bit CRC-8 over every bit before it.
 */
const V1 = {
  ordinalBits: 6,
  countBits: 5,
  codeBits: 14,
  modeBits: 2,
  thinkingTimeBits: 6,
  checksumBits: 8,
  /**
   * Each mode's 2-bit id is its index here. Frozen with the layout, so it's its own list rather
   * than MODE_KINDS: offering the modes in another order must never change a link.
   */
  modes: ["standard", "unlimited", "timed", "tie-breaker"] as const satisfies readonly ModeKind[],
};

/** The format version the encoder writes. */
export const LATEST_FORMAT_VERSION = 1;

/**
 * Every format version ever released and its decoder, which reads all bits after the format
 * version and returns today's model. A released decoder is never changed or removed: links live
 * on in chats.
 */
const DECODERS: Readonly<Record<number, (reader: BitReader) => DecodedPayload>> = {
  1: decodeV1,
};

/** Packs a payload into the latest format, as unpadded base64url. */
export function encodeLinkPayload(payload: LinkPayload): string {
  const writer = new BitWriter();
  writer.write(LATEST_FORMAT_VERSION, FORMAT_VERSION_BITS);
  encodeV1(writer, payload);
  return toBase64Url(writer.bits);
}

/** Unpacks a payload of any released format version. */
export function decodeLinkPayload(text: string): DecodedPayload {
  const bits = fromBase64Url(text);
  if (bits === undefined) return { ok: false, problem: "malformed" };
  const reader = new BitReader(bits);
  const formatVersion = reader.read(FORMAT_VERSION_BITS);
  if (formatVersion === undefined) return { ok: false, problem: "malformed" };
  const decode = formatVersion === RESERVED_FORMAT_VERSION ? undefined : DECODERS[formatVersion];
  if (decode === undefined) return { ok: false, problem: "format-version" };
  return decode(reader);
}

function encodeV1(writer: BitWriter, { versionOrdinal, trips }: LinkPayload): void {
  writer.write(versionOrdinal, V1.ordinalBits);
  writer.write(trips.length, V1.countBits);
  for (const { start, destination, mode } of trips) {
    writer.write(codeNumber(start), V1.codeBits);
    writer.write(codeNumber(destination), V1.codeBits);
    writer.write(V1.modes.indexOf(mode.kind), V1.modeBits);
    if (mode.kind === "timed") {
      if (!isThinkingTime(mode.thinkingTime)) {
        throw new RangeError(`No thinking time of ${mode.thinkingTime} s`);
      }
      writer.write(mode.thinkingTime, V1.thinkingTimeBits);
    }
  }
  writer.write(crc8(writer.bits), V1.checksumBits);
}

function decodeV1(reader: BitReader): DecodedPayload {
  const versionOrdinal = reader.read(V1.ordinalBits);
  const count = reader.read(V1.countBits);
  if (versionOrdinal === undefined || count === undefined)
    return { ok: false, problem: "malformed" };
  const trips: LinkedTrip[] = [];
  let badThinkingTime = false;
  for (let index = 0; index < count; index++) {
    const start = reader.read(V1.codeBits);
    const destination = reader.read(V1.codeBits);
    const modeId = reader.read(V1.modeBits);
    if (start === undefined || destination === undefined || modeId === undefined) {
      return { ok: false, problem: "malformed" };
    }
    const kind = V1.modes[modeId];
    let mode: ModeSetting;
    if (kind === "timed") {
      const thinkingTime = reader.read(V1.thinkingTimeBits);
      if (thinkingTime === undefined) return { ok: false, problem: "malformed" };
      if (!isThinkingTime(thinkingTime)) badThinkingTime = true;
      mode = { kind, thinkingTime };
    } else {
      mode = { kind };
    }
    trips.push({ start: codeText(start), destination: codeText(destination), mode });
  }
  const checked = reader.position;
  const checksum = reader.read(V1.checksumBits);
  if (checksum === undefined || !reader.atPaddedEnd()) return { ok: false, problem: "malformed" };
  if (checksum !== crc8(reader.bits.slice(0, checked))) return { ok: false, problem: "checksum" };
  if (badThinkingTime) return { ok: false, problem: "thinking-time" };
  return { ok: true, payload: { versionOrdinal, trips } };
}

/** Whether a value is a thinking time a link can carry: whole seconds in `THINKING_TIME_RANGE`. */
export function isThinkingTime(seconds: unknown): seconds is number {
  return (
    Number.isInteger(seconds) &&
    (seconds as number) >= THINKING_TIME_RANGE.min &&
    (seconds as number) <= THINKING_TIME_RANGE.max
  );
}

/** An SCB code ("0180") as the number the payload holds. */
function codeNumber(code: string): number {
  if (!/^\d{4}$/.test(code)) throw new RangeError(`Not an SCB code: ${code}`);
  return Number(code);
}

/** The number the payload holds as an SCB code, padded to four digits. */
function codeText(number: number): string {
  return String(number).padStart(4, "0");
}

/**
 * CRC-8 with polynomial 0x07, initial value 0, no reflection and no final xor, over the bits
 * packed into bytes, the last byte padded with zero bits.
 */
function crc8(bits: readonly number[]): number {
  let crc = 0;
  for (let byteStart = 0; byteStart < bits.length; byteStart += 8) {
    let byte = 0;
    for (let offset = 0; offset < 8; offset++) byte = (byte << 1) | (bits[byteStart + offset] ?? 0);
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : crc << 1;
  }
  return crc;
}

class BitWriter {
  readonly bits: number[] = [];

  /** Appends `value` as `width` bits, most significant first. */
  write(value: number, width: number): void {
    if (!Number.isInteger(value) || value < 0 || value >= 2 ** width) {
      throw new RangeError(`${value} doesn't fit in ${width} bits`);
    }
    for (let bit = width - 1; bit >= 0; bit--) this.bits.push((value >> bit) & 1);
  }
}

class BitReader {
  position = 0;

  constructor(readonly bits: readonly number[]) {}

  /** The next `width` bits as a number, or undefined past the end. */
  read(width: number): number | undefined {
    if (this.position + width > this.bits.length) return undefined;
    let value = 0;
    for (let bit = 0; bit < width; bit++) value = value * 2 + (this.bits[this.position + bit] ?? 0);
    this.position += width;
    return value;
  }

  /** Whether only the zero bits that fill the last base64url character are left. */
  atPaddedEnd(): boolean {
    const rest = this.bits.slice(this.position);
    return rest.length < 6 && rest.every((bit) => bit === 0);
  }
}

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function toBase64Url(bits: readonly number[]): string {
  let text = "";
  for (let start = 0; start < bits.length; start += 6) {
    let value = 0;
    for (let offset = 0; offset < 6; offset++) value = value * 2 + (bits[start + offset] ?? 0);
    text += BASE64URL[value];
  }
  return text;
}

function fromBase64Url(text: string): number[] | undefined {
  const bits: number[] = [];
  for (const character of text) {
    const value = BASE64URL.indexOf(character);
    if (value < 0) return undefined;
    for (let bit = 5; bit >= 0; bit--) bits.push((value >> bit) & 1);
  }
  return bits;
}
