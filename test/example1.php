<?hh // partial
include "../lib/protobuf.php";
include "../lib/grpc.php";
include "./gen-src/example1_proto.php";
include "./gen-src/example2_proto.php";

function a(mixed $got, mixed $exp, string $msg): void {
  if ($got != $exp) {
    throw new Exception(
      $msg.
      "; got:\n".
      print_r($got, true).
      "\n expected:\n".
      print_r($exp, true).
      "\ndiff:\n".
      diff($got, $exp),
    );
  }
}

function araw(string $got, string $exp, string $msg): void {
  if ($got === $exp) {
    return;
  }
  for ($i = 0; $i < min(strlen($got), strlen($exp)); $i++) {
    if ($got[$i] !== $exp[$i]) {
      //echo sprintf("first diff at offset:%d got:%d exp:%d\n", $i, ord($got[$i]), ord($exp[$i]));
      echo
        sprintf(
          "first diff at offset:%d got:%s exp:%s\n",
          $i,
          ord($got[$i]),
          ord($exp[$i]),
        )
      ;
      break;
    }
  }
  echo sprintf("length got: %d expected: %d\n", strlen($got), strlen($exp));

  $gdec = Protobuf\Internal\Decoder::FromString($got);
  $edec = Protobuf\Internal\Decoder::FromString($exp);
  while (!$gdec->isEOF() && !$edec->isEOF()) {
    list($gfn, $gwt) = $gdec->readTag();
    list($efn, $ewt) = $edec->readTag();
    echo sprintf("got fn:%d wt:%d\n", $gfn, $gwt);
    echo sprintf("exp fn:%d wt:%d\n", $efn, $ewt);
    if ($gfn != $efn || $gwt != $ewt) {
      echo "^^ mismatch ^^\n";
    }
    $gdec->skipWireType($gwt);
    $edec->skipWireType($ewt);
  }
  $tmpf = tempnam('', 'proto-test-got');
  $msg .= " writing to got to $tmpf";
  file_put_contents($tmpf, $got);
  throw new Exception($msg);
}

function diff(mixed $got, mixed $exp): string {
  if (!is_object($got) ||
      !is_object($exp) ||
      get_class($got) != get_class($exp)) {
    return "<not diffable>";
  }
  $rexp = new ReflectionClass($exp);
  $rgot = new ReflectionClass($got);
  foreach ($rexp->getProperties() as $prop) {
    $gotval = $prop->getValue($got);
    $expval = $rexp->getProperty($prop->name)->getValue($exp);
    if ($gotval != $expval) {
      return sprintf(
        "property: %s got: %s expected: %s",
        $prop->name,
        print_r($gotval, true),
        print_r($expval, true),
      );
    }
  }
  return "<empty diff>";
}

function repackFloat(float $f): float {
  return unpack("f", pack("f", $f))[1];
}

function testExample1($got, $failmsg) {
  $exp = new foo\bar\example1();
  $exp->adouble = 13.37;
  $exp->afloat = repackFloat(100.1);
  $exp->aint32 = 1;
  $exp->aint64 = 12;
  $exp->auint32 = 123;
  $exp->auint64 = 1234;
  $exp->asint32 = 12345;
  $exp->asint64 = 123456;
  $exp->afixed32 = 1234567;
  $exp->afixed64 = 12345678;
  $exp->asfixed32 = 123456789;
  $exp->asfixed64 = 1234567890;
  $exp->abool = true;
  $exp->astring = "foobar";
  $exp->abytes = "hello world";

  $exp->aenum1 = foo\bar\AEnum1::B;
  $exp->aenum2 = foo\bar\example1_AEnum2::D;
  $exp->aenum22 = fiz\baz\AEnum2::Z;

  $exp->manystring[] = "ms1";
  $exp->manystring[] = "ms2";
  $exp->manystring[] = "ms3";

  $exp->manyint64[] = 1;
  $exp->manyint64[] = 2;
  $exp->manyint64[] = 3;

  $e2 = new foo\bar\example1_example2();
  $exp->aexample2 = $e2;
  $e2->astring = "zomg";

  $e22 = new foo\bar\example2();
  $exp->aexample22 = $e22;
  $e22->aint32 = 123;

  $e23 = new fiz\baz\example2();
  $exp->aexample23 = $e23;
  $e23->zomg = -12;

  $exp->amap["k1"] = "v1";
  $exp->amap["k2"] = "v2";

  $exp->outoforder = 1;

  $exp->aoneof = new \foo\bar\example1_oostring("oneofstring");

  a($got, $exp, $failmsg);
}

function microtime_as_int(): int {
  $gtod = gettimeofday();
  return ($gtod['sec'] * 1000000) + $gtod['usec'];
}

function testDescriptorReflection(): void {
  $fds = Protobuf\Internal\LoadedFileDescriptors();
  $names = array();
  foreach ($fds as $fd) {
    $names[] = $fd->Name();
    $raw = $fd->FileDescriptorProtoBytes();
    if ($raw == false) {
      throw new \Exception('descriptor decode failed');
    }
  }
  if (!in_array('example1.proto', $names)) {
    throw new \Exception('missing file descriptor for example1');
  }
}

function test(): void {
  // PROTO
  $raw = file_get_contents('./gen-data/example1.pb.bin');
  $got = new foo\bar\example1();
  Protobuf\Unmarshal($raw, $got);
  testExample1($got, "test example1: file");
  $remarsh = Protobuf\Marshal($got);
  araw($remarsh, $raw, "hack marshal does not match protoc marshal");
  $got = new foo\bar\example1();
  Protobuf\Unmarshal($remarsh, $got);
  testExample1($got, "test example1: remarshal");

  // JSON
  $jraw = Protobuf\MarshalJson($got, Protobuf\JsonEncode::PRETTY_PRINT);
  file_put_contents('./gen-data/example1.pb.json', $jraw);
  $got = new foo\bar\example1();
  Protobuf\UnmarshalJson($jraw, $got);
  testExample1($got, "test example1: json unmarshal");

  // Reflection
  testDescriptorReflection();

  /*for ($i = 0; $i < 10000; $i++){
   $start = microtime_as_int();
   testExample1($raw, "blarg");
   $start = microtime_as_int() - $start;
   echo "elapsed: " . $start . "\n";
   }*/
}

set_time_limit(5);
ini_set('memory_limit', '20M');
test();
