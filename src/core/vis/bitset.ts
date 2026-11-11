/**
 * Fixed-size bit set backed by a Uint32Array.
 *
 * Used for portal and leaf visibility rows. The hex encoding is byte-oriented
 * and little-endian per bit (bit `i` lives in byte `i >> 3` at bit `i & 7`),
 * which matches the classic Quake PVS row layout and is easy to decode in any
 * engine.
 */
export class BitSet {
  readonly size: number;
  readonly words: Uint32Array;

  constructor(size: number, words?: Uint32Array) {
    this.size = size;
    this.words = words ?? new Uint32Array((size + 31) >>> 5);
  }

  has(i: number): boolean {
    return (this.words[i >>> 5] & (1 << (i & 31))) !== 0;
  }

  set(i: number): void {
    this.words[i >>> 5] |= 1 << (i & 31);
  }

  clear(i: number): void {
    this.words[i >>> 5] &= ~(1 << (i & 31));
  }

  clone(): BitSet {
    return new BitSet(this.size, this.words.slice());
  }

  /** Number of set bits. */
  count(): number {
    let c = 0;
    for (let w of this.words) {
      w = w - ((w >>> 1) & 0x55555555);
      w = (w & 0x33333333) + ((w >>> 2) & 0x33333333);
      c += (((w + (w >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
    }
    return c;
  }

  /** In-place union. */
  orWith(other: BitSet): this {
    for (let i = 0; i < this.words.length; i++) this.words[i] |= other.words[i];
    return this;
  }

  /** In-place intersection. */
  andWith(other: BitSet): this {
    for (let i = 0; i < this.words.length; i++) this.words[i] &= other.words[i];
    return this;
  }

  /** New set = this ∩ other. */
  and(other: BitSet): BitSet {
    return this.clone().andWith(other);
  }

  /** True if this set contains any bit that `other` does not (this ⊄ other). */
  hasAnyNotIn(other: BitSet): boolean {
    for (let i = 0; i < this.words.length; i++) if ((this.words[i] & ~other.words[i]) !== 0) return true;
    return false;
  }

  equals(other: BitSet): boolean {
    if (other.size !== this.size) return false;
    for (let i = 0; i < this.words.length; i++) if (this.words[i] !== other.words[i]) return false;
    return true;
  }

  /** Indices of set bits, ascending. */
  toArray(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.size; i++) if (this.has(i)) out.push(i);
    return out;
  }

  /** Byte-wise hex string (2 chars per byte, `ceil(size / 8)` bytes). */
  toHex(): string {
    const bytes = (this.size + 7) >>> 3;
    let s = "";
    for (let b = 0; b < bytes; b++) {
      const byte = (this.words[b >>> 2] >>> ((b & 3) * 8)) & 0xff;
      s += byte.toString(16).padStart(2, "0");
    }
    return s;
  }

  static fromHex(size: number, hex: string): BitSet {
    const set = new BitSet(size);
    for (let b = 0; b * 2 < hex.length; b++) {
      const byte = parseInt(hex.substr(b * 2, 2), 16);
      set.words[b >>> 2] |= byte << ((b & 3) * 8);
    }
    return set;
  }

  static fromIndices(size: number, indices: Iterable<number>): BitSet {
    const set = new BitSet(size);
    for (const i of indices) set.set(i);
    return set;
  }
}
