class ProtobufError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export interface Message {
  MergeFrom(d: Internal.Decoder): void;
  WriteTo(e: Internal.Encoder): void;
}

export function Unmarshal(raw: Uint8Array, m: Message): void {
  m.MergeFrom(new Internal.Decoder(raw));
}

export function Marshal(m: Message): Uint8Array {
  let e = new Internal.Encoder();
  m.WriteTo(e);
  return e.buffer();
}

export namespace Internal {
  export class Decoder {
    private buf: Uint8Array;
    private offset: number;
    constructor(buf: Uint8Array) {
      this.offset = 0;
      this.buf = buf;
    }

    // The output of this is always unsigned and is not clamped to 64 bits.
    readVarint(): bigint {
      let val = 0n;
      let shift = 0n;
      while (true) {
        if (this.isEOF()) {
          throw new ProtobufError("buffer overrun while reading varint-128");
        }
        let c = BigInt(this.buf[this.offset]);
        this.offset++;
        val += (c & 127n) << shift;
        shift += 7n;
        if (c < 128n) {
          break;
        }
      }
      return val;
    }

    readVarintSigned(): bigint {
      return BigInt.asIntN(64, this.readVarint());
    }

    readVarintSignedAsNumber(): number {
      return Number(this.readVarintSigned());
    }

    readVarintAsNumber(): number {
      return Number(this.readVarint());
    }

    readTag(): [number, number] {
      let k = this.readVarintAsNumber();
      let fn = k >> 3;
      if (fn == 0) {
        throw new ProtobufError("zero field number");
      }
      return [fn, k & 0x07];
    }

    readVarUint32(): number {
      return Number(this.readVarint() & 0xffffffffn);
    }

    readVarInt32(): number {
      return Number(BigInt.asIntN(32, this.readVarint() & 0xffffffffn));
    }

    readZigZag32(): number {
      let i = this.readVarintAsNumber();
      i |= i & 0xffffffff;
      return ((i >> 1) & 0x7fffffff) ^ -(i & 1);
    }

    readZigZag64(): bigint {
      let i = this.readVarint();
      return ((i >> 1n) & 0x7fffffffffffffffn) ^ -(i & 1n);
    }

    readInt64(): bigint {
      return BigInt.asIntN(64, this.readUint64());
    }

    readUint64(): bigint {
      let dv = this.readView(8);
      return (
        BigInt(dv.getUint32(0, true)) | (BigInt(dv.getUint32(4, true)) << 32n)
      );
    }

    readUint32(): number {
      return this.readView(4).getUint32(0, true);
    }

    readInt32(): number {
      return this.readView(4).getInt32(0, true);
    }

    readFloat(): number {
      return this.readView(4).getFloat32(0, true);
    }

    readDouble(): number {
      return this.readView(8).getFloat64(0, true);
    }

    readBool(): boolean {
      return this.readVarintAsNumber() != 0;
    }

    readString(): string {
      let dv = this.readView(this.readVarintAsNumber());
      return new TextDecoder("utf-8").decode(dv);
    }

    readBytes(): Uint8Array {
      let dv = this.readView(this.readVarintAsNumber());
      let buf = dv.buffer.slice(dv.byteOffset, dv.byteOffset + dv.byteLength);
      return new Uint8Array(buf);
    }

    readDecoder(): Decoder {
      let dv = this.readView(this.readVarintAsNumber());
      let ua = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      return new Decoder(ua);
    }

    readView(len: number): DataView {
      if (this.isEOF()) {
        throw new ProtobufError("buffer overrun while reading raw");
      }
      let noff = this.offset + len;
      if (noff > this.buf.length) {
        throw new ProtobufError("buffer overrun while reading raw: " + len);
      }
      let dv = new DataView(
        this.buf.buffer,
        this.buf.byteOffset + this.offset,
        len
      );
      this.offset = noff;
      return dv;
    }

    skipWireType(wt: number): void {
      switch (wt) {
        case 0:
          this.readVarintAsNumber();
          break; // We could technically optimize this to skip.
        case 1:
          this.offset += 8;
          break;
        case 2:
          this.offset += this.readVarintAsNumber();
          break;
        case 5:
          this.offset += 4;
          break;
        default:
          throw new ProtobufError(
            "encountered unknown wire type during skip: " + wt
          );
      }
      if (this.offset > this.buf.length) {
        // Note: not EOF.
        throw new ProtobufError("buffer overrun after skip");
      }
    }

    isEOF(): boolean {
      return this.offset >= this.buf.length;
    }
  }

  class Buffer {
    private buf: Uint8Array;
    private offset: number;

    constructor(len: number) {
      this.buf = new Uint8Array(len);
      this.offset = 0;
    }

    write(b: number): void {
      this.maybeGrow(1);
      this.buf[this.offset++] = b;
    }

    writeBytes(a: Uint8Array): void {
      this.maybeGrow(a.byteLength);
      this.buf.set(a, this.offset);
      this.offset += a.byteLength;
    }

    writeView(len: number): DataView {
      this.maybeGrow(len);
      let dv = new DataView(
        this.buf.buffer,
        this.buf.byteOffset + this.offset,
        len
      );
      this.offset += len;
      return dv;
    }

    maybeGrow(need: number): void {
      if (this.offset + need < this.buf.byteLength) {
        return;
      }
      // TODO ArrayBuffer.transfer
      let nsize = this.buf.byteLength * 2;
      while (nsize - this.offset < need) {
        nsize *= 2;
      }
      let nbuf = new Uint8Array(nsize);
      nbuf.set(this.buf);
      this.buf = nbuf;
    }

    buffer(): Uint8Array {
      return new Uint8Array(this.buf.buffer, this.buf.byteOffset, this.offset);
    }
  }

  export class Encoder {
    private buf: Buffer;
    private offset: number;

    constructor() {
      this.buf = new Buffer(64);
      this.offset = 0;
    }

    writeVarint(i: bigint): void {
      // We must unsigned any negative input first.
      i = BigInt.asUintN(64, i);
      while (true) {
        let b = Number(i & 0x7fn);
        i = i >> 7n;
        if (i == 0n) {
          this.buf.write(b);
          return;
        }
        this.buf.write(b | 0x80); // set the top bit.
      }
    }

    writeNumberAsVarint(n: number): void {
      this.writeVarint(BigInt(n));
    }

    writeTag(fn: number, wt: number): void {
      this.writeNumberAsVarint((fn << 3) | wt);
    }

    writeBytes(v: Uint8Array): void {
      this.writeNumberAsVarint(v.byteLength);
      this.buf.writeBytes(v);
    }

    writeString(v: string): void {
      this.writeBytes(new TextEncoder().encode(v));
    }

    writeBool(v: boolean): void {
      this.writeNumberAsVarint(v ? 1 : 0);
    }

    writeDouble(v: number): void {
      this.buf.writeView(8).setFloat64(0, v, true);
    }

    writeFloat(v: number): void {
      this.buf.writeView(4).setFloat32(0, v, true);
    }

    writeUint32(v: number): void {
      this.buf.writeView(4).setUint32(0, v, true);
    }

    writeInt32(v: number): void {
      this.buf.writeView(4).setInt32(0, v, true);
    }

    writeZigZag32(v: number): void {
      this.writeNumberAsVarint(1); // fix
    }

    writeZigZag64(v: bigint): void {
      this.writeNumberAsVarint(1); // fix
    }

    writeInt64(v: bigint): void {
      this.writeUint64(BigInt.asUintN(64, v));
    }

    writeUint64(v: bigint): void {
      let upper = Number(v >> 32n);
      let lower = Number(v & 0xffffffffn);
      let dv = this.buf.writeView(8);
      dv.setUint32(0, lower, true);
      dv.setUint32(4, upper, true);
    }

    writeEncoder(e: Encoder, fn: number) {
      this.writeTag(fn, 2);
      this.writeBytes(e.buffer());
    }

    buffer(): Uint8Array {
      return this.buf.buffer();
    }
  }
}
