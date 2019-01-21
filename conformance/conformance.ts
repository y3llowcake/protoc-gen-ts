import * as pb from "./../lib/protobuf";
import * as conf from "./gen-src/third_party/google/protobuf/conformance/conformance_pb";

function log(s: string): void {
  console.error("[CONFORMANCE] " + s);
}

function write(a: Uint8Array): void {
  process.stdout.write((a as any) as string);
}

function conformanceRaw(raw: Uint8Array): Uint8Array {
  let creq = new conf.ConformanceRequest();
  pb.Unmarshal(raw, creq);
  return pb.Marshal(conformance(creq));
}

function conformance(req: conf.ConformanceRequest): conf.ConformanceResponse {
  let resp = new conf.ConformanceResponse();
  return resp;
}

log("start");

process.stdin.on("end", () => {
  log("eof received; fin");
  process.exit(0);
});

var buf = Buffer.alloc(0);
process.stdin.on("data", chunk => {
  log("on data...");
  buf = Buffer.concat([buf, chunk]);
  while (true) {
    log(`have ${buf.length}`);
    if (buf.length < 4) {
      return;
    }
    let len = buf.readUInt32LE(0);
    log(`want ${len}`);
    if (buf.length < len) {
      return;
    }
    let rawout = conformanceRaw(
      new Uint8Array(buf.buffer, buf.byteOffset + 4, len)
    );
    let lenbuf = new ArrayBuffer(4);
    new DataView(lenbuf).setInt32(0, rawout.length, true);
    log("writing response bytes " + rawout.length);
    write(new Uint8Array(lenbuf));
    write(rawout);
    buf = buf.slice(4 + len);
  }
});
