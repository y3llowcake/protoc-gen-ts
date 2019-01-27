import * as pb from "./../lib/protobuf";
import * as conf from "./gen-src/third_party/google/protobuf/conformance/conformance_pb";
import * as tm3 from "./gen-src/google/protobuf/test_messages_proto3_pb";

// Can remove after node 11
import { TextDecoder, TextEncoder } from "util";
(global as any)["TextDecoder"] = TextDecoder;
(global as any)["TextEncoder"] = TextEncoder;

var debugLogging = false;

function log(...a: any[]): void {
  if (debugLogging) {
    console.error("[CONFORMANCE]", ...a);
  }
}

function write(a: Uint8Array): void {
  process.stdout.write((a as any) as string);
}

function conformanceRaw(raw: Uint8Array): Uint8Array {
  let req = new conf.ConformanceRequest();
  pb.Unmarshal(raw, req);
  return pb.Marshal(conformance(req));
}

// https://github.com/protocolbuffers/protobuf/blob/master/conformance/conformance.proto
function conformance(req: conf.ConformanceRequest): conf.ConformanceResponse {
  let resp = new conf.ConformanceResponse();
  log("message type: " + req.message_type);
  switch (req.message_type) {
    case "protobuf_test_messages.proto3.TestAllTypesProto3":
      break;
    default:
      resp.result = new conf.ConformanceResponse.result.skipped(
        "unsupported message type"
      );
      return resp;
  }

  switch (req.payload.kind) {
    case conf.ConformanceRequest.payload.protobuf_payload.kind:
      break;
    default:
      resp.result = new conf.ConformanceResponse.result.skipped(
        "unsupported payload type"
      );
      return resp;
  }

  if (req.requested_output_format != conf.WireFormat.PROTOBUF) {
    resp.result = new conf.ConformanceResponse.result.skipped(
      "unsupported output format"
    );
    return resp;
  }

  let m = new tm3.TestAllTypesProto3();
  try {
    let payload = req.payload as conf.ConformanceRequest.payload.protobuf_payload;
    resp.result = new conf.ConformanceResponse.result.protobuf_payload(
      remarshal(m, payload.value)
    );
  } catch (e) {
    resp.result = new conf.ConformanceResponse.result.parse_error(e);
    log("parse error:" + e);
  }
  return resp;
}

function remarshal(m: pb.Message, raw: Uint8Array): Uint8Array {
  pb.Unmarshal(raw, m);
  log("after unmarshal:", m);
  return pb.Marshal(m);
}

function unescapeC(s: string): Uint8Array {
  // Inputs are ASCII or \nnn where nnn is octal.
  let nums = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charAt(i);
    let n = 0;
    if (c === "\\") {
      n = parseInt(s.substring(i + 1, i + 5), 8);
      i += 3;
    } else {
      n = c.charCodeAt(0);
    }
    nums.push(n);
  }
  return Uint8Array.from(nums);
}

if (process.argv.length > 2) {
  debugLogging = true;
  log("command line mode:", process.argv);
  let input = process.argv[2];
  log("input:", input);
  let raw = unescapeC(input);
  log("raw input:", raw);
  let m = new tm3.TestAllTypesProto3();
  let out = remarshal(m, raw);
  log("out:", out);
  process.exit(0);
}

log("entering stdin pipe...");
process.stdin.on("end", () => {
  log("eof received; fin");
  process.exit(0);
});

// https://github.com/protocolbuffers/protobuf/blob/master/conformance/conformance_test_runner.cc
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
    new DataView(lenbuf).setUint32(0, rawout.length, true);
    log("writing response bytes " + rawout.length);
    write(new Uint8Array(lenbuf));
    write(rawout);
    buf = buf.slice(4 + len);
  }
});
