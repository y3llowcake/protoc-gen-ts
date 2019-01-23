import * as pb from "../lib/protobuf";

import { diff } from "deep-diff";

function testVarintNumber(n: number, d: number[]): void {
  let ua = new Uint8Array(d);
  let got = new pb.Internal.Decoder(ua).readVarintAsNumber();
  assertEqual(got, n, `readVarintAsNumber ${n}`);
  let enc = new pb.Internal.Encoder();
  enc.writeNumberAsVarint(n);
  let got2 = enc.buffer();
  assertEqual(got2, ua, `writeNumberAsVarint ${n}`);
}

function testVarintSignedNumber(n: number, d: number[]): void {
  let ua = new Uint8Array(d);
  let got = new pb.Internal.Decoder(ua).readVarintSignedAsNumber();
  assertEqual(got, n, `readVarintSignedAsNumber ${n}`);
  let enc = new pb.Internal.Encoder();
  enc.writeNumberAsVarintSigned(n);
  let got2 = enc.buffer();
  assertEqual(got2, ua, `writeNumberAsVarintSigned ${n}`);
}

function assertEqual(got: any, exp: any, msg: string): void {
  let diffs = diff(got, exp);
  if (diffs != null && diffs.length > 0) {
    console.log(`found diffs: ${msg}; got (lhs) vs exp (rhs)`);
    console.table(diffs);
    throw new Error("found diffs");
  }
}

testVarintNumber(0, [0x0]);
testVarintNumber(3, [0x3]);
testVarintNumber(300, [0xac, 0x02]);

testVarintSignedNumber(-1, [
  0xff,
  0xff,
  0xff,
  0xff,
  0xff,
  0xff,
  0xff,
  0xff,
  0xff,
  0x01
]);
testVarintSignedNumber(-15, [
  0xf1,
  0xff,
  0xff,
  0xff,
  0xff,
  0xff,
  0xff,
  0xff,
  0xff,
  0x01
]);
