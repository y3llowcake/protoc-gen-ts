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
      var val = 0n;
      var shift = 0n;
      while (true) {
        if (this.isEOF()) {
          throw new ProtobufError('buffer overrun while reading varint-128');
        }
        var c = BigInt(this.buf[this.offset]);
        this.offset++;
        val += ((c & 127n) << shift);
        shift +=7n;
        if (c < 128n) {
          break;
        }
      }
      return val;
    }

    readVarintAsNumber(): number {
      var val = 0;
      var shift = 0;
      while (true) {
        if (this.isEOF()) {
          throw new ProtobufError('buffer overrun while reading varint-128');
        }
        var c = this.buf[this.offset];
        this.offset++;
        val += ((c & 127) << shift);
        shift +=7;
        if (c < 128) {
          break;
        }
      }
      return val;
    }

    readTag(): [number, number] {
      var k = this.readVarintAsNumber()
      var fn = k >> 3;
      if (fn == 0) {
        throw new ProtobufError('zero field number');
      }
      return [fn, k & 0x07];
    }

    readVarint32(): number {
      return this.readVarintAsNumber() & 0xFFFFFFFF;
    }

    readZigZag32(): number {
      var i = this.readVarintAsNumber();
      i |= (i & 0xFFFFFFFF);
      return ((i >> 1) & 0x7FFFFFFF) ^ (-(i & 1));
    }

    readZigZag64(): bigint {
      var i = this.readVarint();
      return ((i >> 1n) & 0x7FFFFFFFFFFFFFFFn) ^ (-(i & 1n));
    }

    readInt64(): bigint {
      var dv = this.readView(8);
      return BigInt(dv.getUint32(0, true)) + (BigInt(dv.getUint32(4, true)) << 32n);
    }

    readUint64(): bigint {
      this.readView(8);
      return 0n // TODO
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
      var dv = this.readView(this.readVarintAsNumber());
      var ua = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      // TODO revisit typeingissues
      // @ts-ignore
      return String.fromCharCode.apply(null, ua);
    }

    readBytes(): Uint8Array {
      var dv = this.readView(this.readVarintAsNumber());
      return new Uint8Array(dv.buffer.slice(dv.byteOffset, dv.byteOffset + dv.byteLength));
    }

    readDecoder(): Decoder {
      var dv = this.readView(this.readVarintAsNumber());
      var ua = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      return new Decoder(ua);
    }

    readView(len: number): DataView {
      if (this.isEOF()) {
        throw new ProtobufError('buffer overrun while reading raw');
      }
      var noff = this.offset + len;
      if (noff > this.buf.length) {
        throw new ProtobufError('buffer overrun while reading raw: ' + len);
      }
      var dv = new DataView(this.buf.buffer, this.buf.byteOffset + this.offset, len);
      this.offset = noff;
      return dv;
    }

    skipWireType(wt: number): void {
      switch (wt) {
        case 0:
          this.readVarintAsNumber(); break; // We could technically optimize this to skip.
        case 1:
          this.offset += 8; break;
        case 2:
          this.offset += this.readVarintAsNumber(); break;
        case 5:
          this.offset += 4; break;
        default:
          throw new ProtobufError('encountered unknown wire type during skip: ' + wt);
      }
      if (this.offset > this.buf.length) { // Note: not EOF.
        throw new ProtobufError('buffer overrun after skip')
      }
    }

    isEOF(): boolean {
      return this.offset >= this.buf.length
    }
  }
}
