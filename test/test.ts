import * as fs from 'fs';
import * as pb from '../lib/protobuf'
import * as e1 from './gen-src/example1_pb'

var raw = fs.readFileSync('./gen-data/example1.pb.bin');
var ua = new Uint8Array(raw.buffer, raw.byteOffset, raw.length);
var got = new e1.example1();
pb.Unmarshal(ua, got);

console.log(got);
