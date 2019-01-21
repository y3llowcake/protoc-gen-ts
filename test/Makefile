all: test

test: gen
	#tsc --lib es6,esnext.BigInt --target esnext --strict gen-src/*.ts
	#tsc --lib es6,esnext.BigInt,dom --target esnext --strict ./test.ts
	# npm install # this is slow.
	tsc
	node ./test.js
	echo "\033[1mINTEGRATION TEST PASSED\033[0m"

gen:
	mkdir -p gen-src
	mkdir -p gen-data
	protoc --ts_out=library_import=../../lib/protobuf,plugin=grpc:./gen-src example1.proto example2.proto example3.proto
	protoc --encode=foo.bar.example1  example1.proto < example1.pb.txt > gen-data/example1.pb.bin

clean:
	rm -rfv gen-src
	rm -rfv gen-data
