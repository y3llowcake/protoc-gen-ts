load("@io_bazel_rules_go//go:def.bzl", "go_binary")

package(default_visibility = ["//visibility:public"])

go_binary(
    name = "protoc-gen-ts",
    srcs = glob(["protoc-gen-ts/*.go"]),
    deps = [
        "@com_github_golang_protobuf//proto:go_default_library",
        "@com_github_golang_protobuf//protoc-gen-go/descriptor:go_default_library",
        "@com_github_golang_protobuf//protoc-gen-go/plugin:go_default_library",
    ],
    out = 'protoc-gen-ts',
)

filegroup(
    name = "ts_library",
    srcs = glob([
        "lib/**/*.ts",
    ]),
)

