all:
	mkdir -p gen-src
	protoc --go_out=./gen-src ./google/protobuf/compiler/plugin.proto

clean:
	rm -rfv gen-src
