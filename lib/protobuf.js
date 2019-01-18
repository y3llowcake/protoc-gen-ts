class ProtobufError extends Error {
    constructor(message) {
        super(message);
    }
}
export var Internal;
(function (Internal) {
    class Decoder {
        constructor(buf) {
            this.offset = 0;
            this.buf = buf;
        }
        readVarint() {
            var val = 0n;
            var shift = 0n;
            while (true) {
                if (this.isEOF()) {
                    throw new ProtobufError('buffer overrun while reading varint-128');
                }
                var c = BigInt(this.buf[this.offset]);
                this.offset++;
                val += ((c & 127n) << shift);
                shift += 7n;
                if (c < 128n) {
                    break;
                }
            }
            return val;
        }
        readVarintAsNumber() {
            var val = 0;
            var shift = 0;
            while (true) {
                if (this.isEOF()) {
                    throw new ProtobufError('buffer overrun while reading varint-128');
                }
                var c = this.buf[this.offset];
                this.offset++;
                val += ((c & 127) << shift);
                shift += 7;
                if (c < 128) {
                    break;
                }
            }
            return val;
        }
        readTag() {
            var k = this.readVarintAsNumber();
            var fn = k >> 3;
            if (fn == 0) {
                throw new ProtobufError('zero field number');
            }
            return [fn, k & 0x07];
        }
        readVarint32() {
            return this.readVarintAsNumber() & 0xFFFFFFFF;
        }
        readFloat() {
            var ua = this.readRaw(4);
            return (new Float32Array(ua.buffer, ua.byteOffset, 1))[0];
        }
        readDouble() {
            var ua = this.readRaw(8);
            return (new Float64Array(ua.buffer, ua.byteOffset, 1))[0];
        }
        readBool() {
            return this.readVarintAsNumber() != 0;
        }
        readString() {
            var len = this.readVarintAsNumber();
            if (len == 0) {
                return '';
            }
            // TODO revisit this
            // @ts-ignore
            return String.fromCharCode.apply(null, this.readRaw(len));
        }
        readRaw(len) {
            if (this.isEOF()) {
                throw new ProtobufError('buffer overrun while reading raw');
            }
            var noff = this.offset + len;
            if (noff > this.buf.length) {
                throw new ProtobufError('buffer overrun while reading raw: ' + len);
            }
            var ua = this.buf.subarray(this.offset, noff);
            this.offset = noff;
            return ua;
        }
        skipWireType(wt) {
            switch (wt) {
                case 0:
                    this.readVarint();
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
                    throw new ProtobufError('encountered unknown wire type during skip: ' + wt);
            }
            if (this.offset > this.buf.length) { // Note: not EOF.
                throw new ProtobufError('buffer overrun after skip');
            }
        }
        isEOF() {
            return this.offset >= this.buf.length;
        }
    }
    Internal.Decoder = Decoder;
})(Internal || (Internal = {}));
