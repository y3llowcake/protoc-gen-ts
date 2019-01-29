import * as Long from "long";
import { fromBits as LongFromBits } from "long";

export class ProtobufError extends Error {
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

export class OneofNotSet {
  static readonly singleton = new OneofNotSet();
  static readonly kind = 0;
  readonly kind = 0;
  private constructor() {}
}

// TODO move to a grpc package.
export namespace Grpc {
  export enum Code {
    OK = 0,
    Canceled = 1,
    Unknown = 2,
    InvalidArgument = 3,
    DeadlineExceeded = 4,
    NotFound = 5,
    AlreadyExists = 6,
    PermissionDenied = 7,
    ResourceExhausted = 8,
    FailedPrecondition = 9,
    Aborted = 10,
    OutOfRange = 11,
    Unimplemented = 12,
    Internal = 13,
    Unavailable = 14,
    DataLoss = 15,
    Unauthenticated = 16
  }

  export class GrpcError extends Error {
    public grpc_code: Code;
    public grpc_message: string;
    constructor(code: Code, msg: string) {
      let name = Grpc.Code[code];
      super(`grpc error: ${name} (${code}); ${msg}`);
      this.grpc_code = code;
      this.grpc_message = msg;
    }
  }

  export interface CallOption {}

  export interface ClientConn {
    Invoke(
      method: string,
      min: Message,
      mout: Message,
      ...co: CallOption[]
    ): Promise<void>;
  }
}

export namespace Internal {
  export class Decoder {
    private buf: Uint8Array;
    private offset: number;
    constructor(buf: Uint8Array) {
      this.offset = 0;
      this.buf = buf;
    }

    // The output of this is always unsigned.
    readVarint(): Long {
      let val = Long.UZERO;
      let shift = 0;
      while (true) {
        if (this.isEOF()) {
          throw new ProtobufError("buffer overrun while reading varint-128");
        }
        let c = this.buf[this.offset];
        this.offset++;
        val = val.add(LongFromBits(c & 127, 0, true).shiftLeft(shift));
        shift += 7;
        if (c < 128) {
          break;
        }
      }
      return val;
    }

    readVarintSigned(): Long {
      return this.readVarint().toSigned();
    }

    readVarintSignedAsNumber(): number {
      return this.readVarintSigned().getLowBits();
    }

    // This function will behave weirdly when parsing varints that exceed 31
    // bits. Use very carefully. The max field number is 2^29-1, so it is safe
    // for that use case.
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
      return this.readVarint().getLowBitsUnsigned();
    }

    readVarInt32(): number {
      return this.readVarint().getLowBits();
    }

    readZigZag32(): number {
      // TODO confirm use of readVarintAsNumber is safe here.
      // TODO optmize: https://gist.github.com/mfuerstenau/ba870a29e16536fdbaba
      let i = this.readVarintAsNumber();
      i |= i & 0xffffffff;
      return ((i >> 1) & 0x7fffffff) ^ -(i & 1);
    }

    readZigZag64(): Long {
      let i = this.readVarint();
      return i
        .shiftRightUnsigned(1)
        .xor(i.and(Long.ONE).neg())
        .toSigned();
    }

    readInt64(): Long {
      return this.readUint64().toSigned();
    }

    readUint64(): Long {
      let dv = this.readView(8);
      return LongFromBits(dv.getUint32(0, true), dv.getUint32(4, true), true);
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
      let len = this.readVarintAsNumber();
      if (len == 0) {
        return "";
      }
      let dv = this.readView(len);
      return new TextDecoder("utf-8").decode(dv);
    }

    readBytes(): Uint8Array {
      let len = this.readVarintAsNumber();
      if (len == 0) {
        return new Uint8Array(0);
      }
      let dv = this.readView(len);
      let buf = dv.buffer.slice(dv.byteOffset, dv.byteOffset + dv.byteLength);
      return new Uint8Array(buf);
    }

    readDecoder(): Decoder {
      let len = this.readVarintAsNumber();
      if (len == 0) {
        return new Decoder(new Uint8Array(0));
      }
      let dv = this.readView(len);
      let ua = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      return new Decoder(ua);
    }

    // len should be > 0.
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
          let z = this.readVarintAsNumber();
          this.offset += z;
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
      if (this.offset + need <= this.buf.byteLength) {
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

    constructor() {
      this.buf = new Buffer(64);
    }

    writeVarint(i: Long): void {
      while (true) {
        let b = i.getLowBits() & 0x7f;
        i = i.shiftRightUnsigned(7);
        if (i.isZero()) {
          this.buf.write(b);
          return;
        }
        this.buf.write(b | 0x80); // set the top bit.
      }
    }

    writeNumberAsVarint(i: number): void {
      while (true) {
        let b = i & 0x7f;
        i = i >>> 7;
        if (i == 0) {
          this.buf.write(b);
          return;
        }
        this.buf.write(b | 0x80); // set the top bit.
      }
      //this.writeVarint(LongFromBits(n, 0, true));
    }

    writeNumberAsVarintSigned(n: number): void {
      this.writeVarint(LongFromBits(n, n < 0 ? -1 : 0, false));
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
      let i = LongFromBits(v & 0xffffffff, 0, true);
      // i = ((i << 1n) ^ ((i << 32n) >> 63n)) & 0xffffffffn;
      i = i
        .shiftLeft(1)
        .xor(i.shiftLeft(32).shiftRight(63))
        .and(0xffffffff);
      this.writeVarint(i);
    }

    writeZigZag64(v: Long): void {
      // this.writeVarint((v << 1n) ^ (v >> 63n));
      this.writeVarint(v.shiftLeft(1).xor(v.shiftRight(63)));
    }

    writeInt64(v: Long): void {
      this.writeUint64(v.toUnsigned());
    }

    writeUint64(v: Long): void {
      let dv = this.buf.writeView(8);
      dv.setUint32(0, v.getLowBitsUnsigned(), true);
      dv.setUint32(4, v.getHighBitsUnsigned(), true);
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
