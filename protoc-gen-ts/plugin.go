package main

import (
	"bytes"
	"fmt"
	"github.com/golang/protobuf/proto"
	// desc "github.com/golang/protobuf/protoc-gen-go/descriptor"
	ppb "github.com/golang/protobuf/protoc-gen-go/plugin"
	"io"
	"os"
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
	panic("poop")
	return resp
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
