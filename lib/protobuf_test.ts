import * as pb from "../lib/protobuf";

import { diff } from "deep-diff";

function testVarint(n: number, d: number[]): void {
  let ua = new Uint8Array(d);
  let got = new pb.Internal.Decoder(ua).readVarintAsNumber();
  assertEqual(got, n, `readVarintAsNumber ${n}`);
  let enc = new pb.Internal.Encoder();
  enc.writeNumberAsVarint(n);
  let got2 = enc.buffer();
  assertEqual(got2, ua, `readVarintAsNumber ${n}`);
}

function assertEqual(got: any, exp: any, msg: string): void {
  let diffs = diff(got, exp);
  if (diffs != null && diffs.length > 0) {
    console.log(`found diffs: ${msg}; got (lhs) vs exp (rhs)`);
    console.table(diffs);
    throw new Error("found diffs");
  }
}

testVarint(0, [0x0]);
testVarint(3, [0x3]);
testVarint(300, [0xAC, 0x02]);
testVarint(-1, [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x01]);
testVarint(-15, [0xF1, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x01]);
