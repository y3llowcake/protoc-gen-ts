// Generated by the protocol buffer compiler.  DO NOT EDIT!
// Source: example2.proto

import * as __pb__ from "../../lib/protobuf"
import * as ___example3_pb from "./example3_pb"


export const enum AEnum2 {
  Z = 0,
}

export class example2 implements __pb__.Message {
  zomg: number;

  constructor() {
    this.zomg = 0;
  }

  MergeFrom(d: __pb__.Internal.Decoder): void {
    while (!d.isEOF()) {
      let [fn, wt] = d.readTag();
      switch(fn) {
        case 1:
        console.log(`[PROTOC-DEBUG] reading field:1 (zomg) wt:${wt}`);
        this.zomg = d.readVarint32();
        console.log(`[PROTOC-DEBUG] read field:1 (zomg)`);
        break;
        default:
        console.log(`[PROTOC-DEBUG] skipping unknown field:${fn} wt:${wt}`);
        d.skipWireType(wt)
      }
    }
  }
}

export class refexample3 implements __pb__.Message {
  funky: ___example3_pb.Funky | null;

  constructor() {
    this.funky = null;
  }

  MergeFrom(d: __pb__.Internal.Decoder): void {
    while (!d.isEOF()) {
      let [fn, wt] = d.readTag();
      switch(fn) {
        case 1:
        console.log(`[PROTOC-DEBUG] reading field:1 (funky) wt:${wt}`);
        if (this.funky == null) this.funky = new ___example3_pb.Funky();
        this.funky.MergeFrom(d.readDecoder());
        console.log(`[PROTOC-DEBUG] read field:1 (funky)`);
        break;
        default:
        console.log(`[PROTOC-DEBUG] skipping unknown field:${fn} wt:${wt}`);
        d.skipWireType(wt)
      }
    }
  }
}

