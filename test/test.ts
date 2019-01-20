import * as fs from "fs";
import * as pb from "../lib/protobuf";
import * as e1pb from "./gen-src/example1_pb";
import * as e2pb from "./gen-src/example2_pb";

import { diff } from "deep-diff";

function repackFloat(n: number): number {
  let a = new Float32Array(1);
  a[0] = n;
  return a[0];
}

function example1(): e1pb.example1 {
  let e = new e1pb.example1();
  e.adouble = 13.37;
  e.afloat = repackFloat(100.1);
  e.aint32 = 1;
  e.aint64 = 12n;
  e.auint32 = 123;
  e.auint64 = 1234n;
  e.asint32 = 12345;
  e.asint64 = 123456n;
  e.afixed32 = 1234567;
  e.afixed64 = 12345678n;
  e.asfixed32 = 123456789;
  e.asfixed64 = -1234567890n;
  e.abool = true;
  e.astring = "foobar";
  e.abytes = new TextEncoder().encode("hello world");

  e.aenum1 = e1pb.AEnum1.B;
  e.aenum2 = e1pb.example1.AEnum2.D;
  e.aenum22 = e2pb.AEnum2.Z;

  e.manystring.push("ms1");
  e.manystring.push("ms2");
  e.manystring.push("ms3");

  e.manyint64.push(1n);
  e.manyint64.push(2n);
  e.manyint64.push(3n);

  let e2 = new e1pb.example1.example2();
  e.aexample2 = e2;
  e2.astring = "zomg";

  let e22 = new e1pb.example2();
  e.aexample22 = e22;
  e22.aint32 = 123;

  let e23 = new e2pb.example2();
  e.aexample23 = e23;
  e23.zomg = -12;

  e.amap.set("k1", "v1");
  e.amap.set("k2", "v2");

  e.outoforder = 1n;

  // e.aoneof = new \foo\bar\example1pb_oostring("oneofstring");
  e.oostring = "oneofstring";
  return e;
}

let raw = fs.readFileSync("./gen-data/example1.pb.bin");
let ua = new Uint8Array(raw.buffer, raw.byteOffset, raw.length);
let got = new e1pb.example1();
pb.Unmarshal(ua, got);

let diffs = diff(got, example1());
if (diffs != null && diffs.length > 0) {
  console.log("found diffs after Unmarshal; got (lhs) vs exp (rhs)");
  console.table(diffs);
  throw new Error("found diffs");
}

ua = pb.Marshal(example1());
got = new e1pb.example1();
pb.Unmarshal(ua, got);

diffs = diff(got, example1());
if (diffs != null && diffs.length > 0) {
  console.log("found diffs after Re-Marshal; got (lhs) vs exp (rhs)");
  console.table(diffs);
  throw new Error("found diffs");
}
