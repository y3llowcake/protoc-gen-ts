import * as fs from "fs";
import * as pb from "../lib/protobuf";
import * as e1pb from "./gen-src/example1_pb";
import * as e2pb from "./gen-src/example2_pb";

import { diff } from "deep-diff";
import { fromInt } from "long";

import { TextDecoder, TextEncoder } from "util";

// Can remove after node 11
(global as any)["TextDecoder"] = TextDecoder;
(global as any)["TextEncoder"] = TextEncoder;

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
  e.aint64 = fromInt(12);
  e.auint32 = 123;
  e.auint64 = fromInt(1234, true);
  e.asint32 = 12345;
  e.asint64 = fromInt(123456);
  e.afixed32 = 1234567;
  e.afixed64 = fromInt(12345678, true);
  e.asfixed32 = 123456789;
  e.asfixed64 = fromInt(-1234567890);
  e.abool = true;
  e.astring = "foobar";
  e.abytes = new TextEncoder().encode("hello world");

  e.aenum1 = e1pb.AEnum1.B;
  e.aenum2 = e1pb.example1.AEnum2.D;
  e.aenum22 = e2pb.AEnum2.Z;

  e.manystring.push("ms1");
  e.manystring.push("ms2");
  e.manystring.push("ms3");

  e.manyint64.push(fromInt(1));
  e.manyint64.push(fromInt(2));
  e.manyint64.push(fromInt(3));

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

  e.outoforder = fromInt(1);

  e.aoneof = new e1pb.example1.aoneof.oostring("oneofstring");

  e.longmap.set("-33", "value");
  return e;
}

// ES6 maps are tricky to diff.
function mapToObject(m1: Map<any, any>): Object {
  let o = {} as any;
  for (const [k, v] of m1) {
    o[String(k)] = v;
  }
  return o;
}

function diffMap(exp: Map<any, any>, got: Map<any, any>, msg: string): void {
  let diffs = diff(mapToObject(exp), mapToObject(got));
  if (diffs) {
    console.log(`${msg}; found diffs in map`);
    console.table(diffs);
    throw new Error("found diffs");
  }
}

function diffMsg(exp: e1pb.example1, got: e1pb.example1, msg: string): void {
  msg = `${msg}; exp (lhs) vs got (rhs)`;
  let diffs = diff(exp, got);
  if (diffs) {
    console.log(msg);
    console.table(diffs);
    throw new Error("found diffs");
  }
  for (const prop in exp) {
    let ep = (<any>exp)[prop];
    let gp = (<any>got)[prop];
    if (ep instanceof Map) {
      diffMap(ep as Map<any, any>, gp as Map<any, any>, `${msg}; map ${prop}`);
    }
  }
}

let raw = fs.readFileSync("./gen-data/example1.pb.bin");
let ua = new Uint8Array(raw.buffer, raw.byteOffset, raw.length);
let got = new e1pb.example1();
pb.Unmarshal(ua, got);

diffMsg(got, example1(), "after Unmarshal");

ua = pb.Marshal(example1());
got = new e1pb.example1();
pb.Unmarshal(ua, got);

diffMsg(got, example1(), "after remarshal");
