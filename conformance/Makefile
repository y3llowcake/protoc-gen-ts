all: test

test: gen
	tsc
	/home/cy/co/protobuf/conformance/conformance-test-runner --enforce_recommended --failure_list failures.txt conformance.sh
	echo "\033[1mCONFORMANCE TEST PASSED\033[0m"

gen:
	mkdir -p gen-src
	protoc -I ../ --ts_out=library_import=../../../../../../lib/protobuf,plugin=grpc:./gen-src ../third_party/google/protobuf/conformance/conformance.proto
	protoc -I ../third_party/google/protobuf/src --ts_out=library_import=../../../../lib/protobuf,plugin=grpc:./gen-src ../third_party/google/protobuf/src/google/protobuf/*.proto

clean:
	rm -rfv gen-src
