# protoc-gen-ts

A Typescript Protocol Buffer implementation from the future :sparkles:

# Notable features / gotchas

- The generator has no dependancy on node.js, and is implemented as a
  standalone binary (golang)
- Only supports proto3
- Each .proto file generates a TS file, which is intended to be used as an es6
  module. Protobuf namespaces are ignored.
- Maps use es6.Map in order to preserve compile time and runtime key types.
  Their is an exception of 64 integer key types, which are converted to strings
  so that equality comparison works correctly.
- Currently uses long.js for 64 bit integer support.
- Prefers direct property access over getters / setters.
- Oneofs are implemented as a Typescript 'union type'.
- It passes the conformance suite.
- Generates service stubs that are transport agnostic.

# Example output

There are a couple example .proto files in the [test](test) directory, the
corresponding output is in the [test/gen-src](test/gen-src) directory.

# TODOs

- Proto3 JSON
- Benchmarking: Probably lots of optimizations to be had.
- Internalize the long.js dependancy?
- Embed Descriptors
- Reflection
- gRPC-Web
- 
