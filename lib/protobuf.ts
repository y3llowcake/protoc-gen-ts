class ProtobufError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export interface Message {
  MergeFrom(d: Internal.Decoder): void;
}

export function Unmarshal(raw: Uint8Array, m: Message): void {
  m.MergeFrom(new Internal.Decoder(raw));
}

export namespace Internal {
  export class Decoder {
    private buf: Uint8Array;
    private offset: number;
    constructor(buf: Uint8Array) {
      this.offset = 0;
      this.buf = buf;
    }

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

    readVarintAsNumber(): number {
      let val = 0;
      let shift = 0;
      while (true) {
        if (this.isEOF()) {
          throw new ProtobufError("buffer overrun while reading varint-128");
        }
        let c = this.buf[this.offset];
        this.offset++;
        val += (c & 127) << shift;
        shift += 7;
        if (c < 128) {
          break;
        }
      }
      return val;
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
      return this.readVarintAsNumber() & 0xffffffff;
    }

    readVarInt32(): number {
      let i = this.readVarUint32();
      if (i > 0x7fffffff) {
        return i | (0xffffffff << 32);
      }
      return i;
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
      // utf16?
      //let ua = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      // TODO revisit typeingissues
      // - @ts-ignore
      //return String.fromCharCode.apply(null, ua);
      return new TextDecoder("utf-8").decode(dv);
    }

    readBytes(): Uint8Array {
      let dv = this.readView(this.readVarintAsNumber());
      return new Uint8Array(
        dv.buffer.slice(dv.byteOffset, dv.byteOffset + dv.byteLength)
      );
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
}
