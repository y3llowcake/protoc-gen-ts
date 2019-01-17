package main

import (
	"bytes"
	"fmt"
	"github.com/golang/protobuf/proto"
	desc "github.com/golang/protobuf/protoc-gen-go/descriptor"
	ppb "github.com/golang/protobuf/protoc-gen-go/plugin"
	"io"
	"os"
	"path/filepath"
	"strings"
)

const genDebug = false

func main() {
	var buf bytes.Buffer
	_, err := buf.ReadFrom(os.Stdin)
	if err != nil {
		panic(fmt.Errorf("error reading from stdin: %v", err))
	}
	out, err := codeGenerator(buf.Bytes())
	if err != nil {
		panic(err)
	}
	os.Stdout.Write(out)
}

func codeGenerator(b []byte) ([]byte, error) {
	req := ppb.CodeGeneratorRequest{}
	err := proto.Unmarshal(b, &req)
	if err != nil {
		return nil, fmt.Errorf("error unmarshaling CodeGeneratorRequest: %v", err)
	}
	resp := gen(&req)
	out, err := proto.Marshal(resp)
	if err != nil {
		return nil, fmt.Errorf("error marshaling CodeGeneratorResponse: %v", err)
	}
	return out, nil
}

func gen(req *ppb.CodeGeneratorRequest) *ppb.CodeGeneratorResponse {
	resp := &ppb.CodeGeneratorResponse{}
	fileToGenerate := map[string]bool{}
	for _, f := range req.FileToGenerate {
		fileToGenerate[f] = true
	}
	genService := strings.Contains(req.GetParameter(), "plugin=grpc")

	rootns := NewEmptyNamespace()
	for _, fdp := range req.ProtoFile {
		if fdp.GetSyntax() != "proto3" {
			panic(fmt.Errorf("unsupported syntax: %s in file %s", fdp.GetSyntax(), fdp.GetName()))
		}
		rootns.Parse(fdp)
		// panic(rootns.PrettyPrint()) // for debuggling

		if !fileToGenerate[fdp.GetName()] {
			continue
		}
		f := &ppb.CodeGeneratorResponse_File{}

		f.Name = proto.String(tsFileName(fdp) + ".ts")

		b := &bytes.Buffer{}
		w := &writer{b, 0}

		imports := writeFile(w, fdp, rootns, genService)
		content := strings.Replace(b.String(), importPlaceholder, imports, 1)
		f.Content = proto.String(content)
		resp.File = append(resp.File, f)
	}
	return resp
}

func tsFileName(fdp *desc.FileDescriptorProto) string {
	fext := filepath.Ext(fdp.GetName())
	fname := strings.TrimSuffix(fdp.GetName(), fext)
	return fname + "_pb"
}

const importPlaceholder = "!!!IMPORT_PLACEHOLDER!!!"

func writeFile(w *writer, fdp *desc.FileDescriptorProto, rootNs *Namespace, genService bool) string {
	ns := rootNs.FindFullyQualifiedNamespace("." + fdp.GetPackage())
	mr := &moduleResolver{fdp, map[string]*modRef{}}
	if ns == nil {
		panic("unable to find namespace for: " + fdp.GetPackage())
	}
	w.p("// Generated by the protocol buffer compiler.  DO NOT EDIT!")
	w.p("// Source: %s", fdp.GetName())
	w.ln()
	w.p(importPlaceholder)
	w.ln()

	// Top level enums.
	for _, edp := range fdp.EnumType {
		writeEnum(w, edp, nil)
	}

	// Messages, recurse.
	for _, dp := range fdp.MessageType {
		writeDescriptor(w, dp, ns, mr, nil)
	}

	imports := ""
	for _, mod := range mr.references {
		imports += fmt.Sprintf("import * as %s from \"%s\"\n", mod.alias, mod.path)
	}
	return imports
}

type modRef struct {
	alias, path string
}

type moduleResolver struct {
	currentFile *desc.FileDescriptorProto
	references  map[string]*modRef
}

func (m *moduleResolver) ToRelativeModule(fdp *desc.FileDescriptorProto) *modRef {
	if fdp.GetName() == m.currentFile.GetName() {
		return nil
	}
	mod := m.references[fdp.GetName()]
	if mod == nil {
		cwd := filepath.Dir(m.currentFile.GetName())
		path := tsFileName(fdp)
		path, _ = filepath.Rel(cwd, path)
		mod = &modRef{
			alias: "___" + strings.Replace(path, "/", "_", -1),
			path:  "./" + path,
		}
		m.references[fdp.GetName()] = mod
	}
	return mod
}

type oneof struct {
	descriptor                                                  *desc.OneofDescriptorProto
	fields                                                      []*field
	name, interfaceName, enumTypeName, classPrefix, notsetClass string
	// v2
}

type field struct {
	fd              *desc.FieldDescriptorProto
	typeTsName      string
	typeDescriptor  interface{}
	typeNs          *Namespace
	typeEnumDefault string
	isMap           bool
	oneof           *oneof
	typeFqProtoName string
	mr              *moduleResolver
}

func newField(fd *desc.FieldDescriptorProto, ns *Namespace, mr *moduleResolver) *field {
	f := &field{
		fd: fd,
		mr: mr,
	}
	if fd.GetTypeName() != "" {
		typeNs, typeName, i, typeFdp := ns.FindFullyQualifiedName(fd.GetTypeName())
		f.typeFqProtoName = typeNs + "." + typeName

		f.typeTsName = typeName
		if mod := mr.ToRelativeModule(typeFdp); mod != nil {
			f.typeTsName = mod.alias + "." + f.typeTsName
		}

		f.typeDescriptor = i
		f.typeNs = ns.FindFullyQualifiedNamespace(typeNs)
		if dp, ok := f.typeDescriptor.(*desc.DescriptorProto); ok {
			if dp.GetOptions().GetMapEntry() {
				f.isMap = true
			}
		}
		if ed, ok := f.typeDescriptor.(*desc.EnumDescriptorProto); ok {
			for _, v := range ed.Value {
				if v.GetNumber() == 0 {
					f.typeEnumDefault = v.GetName()
					break
				}
			}
		}
	}
	return f
}

func (f field) isOneofMember() bool {
	return false
	// return f.fd.OneofIndex != nil
}

func (f field) varName() string {
	return f.fd.GetName()
}

func (f field) mapFields() (*field, *field) {
	dp := f.typeDescriptor.(*desc.DescriptorProto)
	keyField := newField(dp.Field[0], f.typeNs, f.mr)
	valueField := newField(dp.Field[1], f.typeNs, f.mr)
	return keyField, valueField
}

func (f field) tsType() string {
	switch t := *f.fd.Type; t {
	case desc.FieldDescriptorProto_TYPE_STRING:
		return "string"
	case desc.FieldDescriptorProto_TYPE_BYTES:
		return "Uint8Array"
	case desc.FieldDescriptorProto_TYPE_INT64,
		desc.FieldDescriptorProto_TYPE_UINT64,
		desc.FieldDescriptorProto_TYPE_SINT64,
		desc.FieldDescriptorProto_TYPE_FIXED64,
		desc.FieldDescriptorProto_TYPE_SFIXED64:
		return "bigint"
	case desc.FieldDescriptorProto_TYPE_INT32,
		desc.FieldDescriptorProto_TYPE_UINT32,
		desc.FieldDescriptorProto_TYPE_SINT32,
		desc.FieldDescriptorProto_TYPE_FIXED32,
		desc.FieldDescriptorProto_TYPE_SFIXED32:
		return "number"
	case desc.FieldDescriptorProto_TYPE_FLOAT,
		desc.FieldDescriptorProto_TYPE_DOUBLE:
		return "number"
	case desc.FieldDescriptorProto_TYPE_BOOL:
		return "boolean"
	case desc.FieldDescriptorProto_TYPE_MESSAGE,
		desc.FieldDescriptorProto_TYPE_GROUP:
		return f.typeTsName + " | null"
	case desc.FieldDescriptorProto_TYPE_ENUM:
		return f.typeTsName
	default:
		panic(fmt.Errorf("unexpected proto type while converting to php type: %v", t))
	}

}

func (f field) defaultValue() string {
	if f.isMap {
		k, v := f.mapFields()
		return fmt.Sprintf("new Map<%s, %s>()", k.tsType(), v.labeledType())
	}
	if f.isRepeated() {
		return "[]"
	}
	switch t := *f.fd.Type; t {
	case desc.FieldDescriptorProto_TYPE_STRING:
		return `""`
	case desc.FieldDescriptorProto_TYPE_BYTES:
		return `new Uint8Array(0)`
	case desc.FieldDescriptorProto_TYPE_INT64,
		desc.FieldDescriptorProto_TYPE_UINT64,
		desc.FieldDescriptorProto_TYPE_SINT64,
		desc.FieldDescriptorProto_TYPE_FIXED64,
		desc.FieldDescriptorProto_TYPE_SFIXED64:
		return "0n"
	case desc.FieldDescriptorProto_TYPE_INT32,
		desc.FieldDescriptorProto_TYPE_UINT32,
		desc.FieldDescriptorProto_TYPE_SINT32,
		desc.FieldDescriptorProto_TYPE_FIXED32,
		desc.FieldDescriptorProto_TYPE_SFIXED32:
		return "0"
	case desc.FieldDescriptorProto_TYPE_FLOAT,
		desc.FieldDescriptorProto_TYPE_DOUBLE:
		return "0.0"
	case desc.FieldDescriptorProto_TYPE_BOOL:
		return "false"
	case desc.FieldDescriptorProto_TYPE_MESSAGE,
		desc.FieldDescriptorProto_TYPE_GROUP:
		return "null"
	case desc.FieldDescriptorProto_TYPE_ENUM:
		return "0"
	default:
		panic(fmt.Errorf("unexpected proto type while converting to php type: %v", t))
	}

}

func (f field) labeledType() string {
	if f.isMap {
		k, v := f.mapFields()
		return fmt.Sprintf("Map<%s, %s>", k.tsType(), v.labeledType())
	}
	if f.isRepeated() {
		return f.tsType() + "[]"
	}
	if f.fd.GetType() == desc.FieldDescriptorProto_TYPE_MESSAGE {
		return f.tsType()
	}
	return f.tsType()
}

func (f field) isRepeated() bool {
	return *f.fd.Label == desc.FieldDescriptorProto_LABEL_REPEATED
}

func writeEnum(w *writer, edp *desc.EnumDescriptorProto, prefixNames []string) {
	// name := strings.Join(append(prefixNames, edp.GetName()), "_")
	if len(prefixNames) > 0 {
		w.p("export namespace %s {", strings.Join(prefixNames, "."))
	}
	w.p("export const enum %s {", edp.GetName())
	for _, v := range edp.Value {
		w.p("%s = %d,", v.GetName(), v.GetNumber())
	}
	w.p("}")
	if len(prefixNames) > 0 {
		w.p("}") // namespace
	}
	w.ln()
}

func writeDescriptor(w *writer, dp *desc.DescriptorProto, ns *Namespace, mr *moduleResolver, prefixNames []string) {
	nextNames := append(prefixNames, dp.GetName())

	// Wrap fields.
	fields := []*field{}
	for _, fd := range dp.Field {
		fields = append(fields, newField(fd, ns, mr))
	}

	if len(prefixNames) > 0 {
		w.p("export namespace %s {", strings.Join(prefixNames, "."))
	}

	w.p("export class %s {", dp.GetName())
	for _, f := range fields {
		if f.isOneofMember() {
			continue
		}
		w.p("%s: %s;", f.varName(), f.labeledType())
	}
	w.ln()
	w.p("constructor() {")
	for _, f := range fields {
		if f.isOneofMember() {
			continue
		}
		w.p("this.%s = %s;", f.varName(), f.defaultValue())
	}
	w.p("}") // constructor
	w.p("}") // class

	if len(prefixNames) > 0 {
		w.p("}") // namespace
	}
	w.ln()

	// Write enums.
	for _, edp := range dp.EnumType {
		writeEnum(w, edp, nextNames)
	}

	// Nested types.
	for _, ndp := range dp.NestedType {
		writeDescriptor(w, ndp, ns, mr, nextNames)
	}
}

// writer is a little helper for output printing. It indents code
// appropriately among other things.
type writer struct {
	w io.Writer
	i int
}

func (w *writer) p(format string, a ...interface{}) {
	if strings.HasPrefix(format, "}") {
		w.i--
	}
	i := w.i
	if i < 0 {
		i = 0
	}
	indent := strings.Repeat("  ", i)
	fmt.Fprintf(w.w, indent+format, a...)
	w.ln()
	if strings.HasSuffix(format, "{") {
		w.i++
	}
}

func (w *writer) ln() {
	fmt.Fprintln(w.w)
}

func (w *writer) pdebug(format string, a ...interface{}) {
	if !genDebug {
		return
	}
	w.p(fmt.Sprintf(`console.log("PROTOC-DEBUG: %s");`, format), a...)
}
