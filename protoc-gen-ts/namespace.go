package main

import (
	"encoding/json"
	"fmt"
	desc "github.com/golang/protobuf/protoc-gen-go/descriptor"
	"strings"
)

// Names is a tree of structures and enums defined in a single namespace.
type Names struct {
	parent   *Names
	Children map[string]*Names

	// These should be set on every node of the tree
	descriptor     interface{}
	fileDescriptor *desc.FileDescriptorProto
}

func newNames(parent *Names) *Names {
	return &Names{
		parent:   parent,
		Children: map[string]*Names{},
	}
}

func (n *Names) get(create bool, parts ...string) *Names {
	if len(parts) < 1 {
		return n
	}
	child := n.Children[parts[0]]
	if child == nil {
		if create {
			child = newNames(n)
			n.Children[parts[0]] = child
		} else {
			return nil
		}
	}
	return child.get(create, parts[1:]...)
}

// Namespace is a tree of namespaces, where each namespace has a tree of Names.
type Namespace struct {
	parent   *Namespace
	Fqn      string
	Names    *Names
	Children map[string]*Namespace
}

func NewEmptyNamespace() *Namespace {
	return newNamespace(nil, "")
}

func newNamespace(parent *Namespace, myName string) *Namespace {
	fqn := myName + "."
	if parent != nil {
		fqn = parent.Fqn + fqn
	}
	return &Namespace{
		parent:   parent,
		Children: map[string]*Namespace{},
		Names:    newNames(nil),
		Fqn:      fqn,
	}
}

func (n *Namespace) get(create bool, parts []string) *Namespace {
	if len(parts) < 1 {
		return n
	}
	child := n.Children[parts[0]]
	if child == nil {
		if create {
			child = newNamespace(n, parts[0])
			n.Children[parts[0]] = child
		} else {
			return nil
		}
	}
	return child.get(create, parts[1:])
}

// From any point in the namespace tree, decend to the root and then back up to
// the target namespace.
func (n *Namespace) FindFullyQualifiedNamespace(fqns string) *Namespace {
	if fqns == "" {
		fqns = "." //ugh, hax.
	}
	mustFullyQualified(fqns)
	for n.parent != nil {
		n = n.parent
	}

	if fqns == "." {
		return n
	}

	found := n.get(false, strings.Split(strings.TrimPrefix(fqns, "."), "."))
	if found != nil {
		return found
	}
	panic(fmt.Errorf("unable to find target namespace: %s", fqns))
}

func (n *Namespace) Parse(fdp *desc.FileDescriptorProto) {
	pparts := []string{}
	if fdp.GetPackage() != "" {
		pparts = strings.Split(fdp.GetPackage(), ".")
	}

	childns := n.get(true, pparts)

	// Top level enums.
	for _, edp := range fdp.EnumType {
		name := childns.Names.get(true, *edp.Name)
		name.descriptor = edp
		name.fileDescriptor = fdp
	}

	// Messages, recurse.
	for _, dp := range fdp.MessageType {
		childNames := childns.Names.get(true, *dp.Name)
		childNames.descriptor = fdp.MessageType
		childNames.fileDescriptor = fdp
		childNames.parseDescriptor(dp, fdp)
	}
}

func (n *Names) parseDescriptor(dp *desc.DescriptorProto, fdp *desc.FileDescriptorProto) {

	for _, edp := range dp.EnumType {
		name := n.get(true, *edp.Name)
		name.descriptor = edp
		name.fileDescriptor = fdp
	}

	for _, dp := range dp.NestedType {
		childNames := n.get(true, *dp.Name)
		childNames.descriptor = dp
		childNames.fileDescriptor = fdp
		childNames.parseDescriptor(dp, fdp)
	}
}

func (n *Namespace) PrettyPrint() string {
	b, _ := json.MarshalIndent(n, "", "  ")
	return string(b)
}

func mustFullyQualified(fqn string) {
	if !strings.HasPrefix(fqn, ".") {
		panic("not fully qualified: " + fqn)
	}
}

// Find is where the magic happens. It takes a fully qualified proto name
//   e.g. ".foo.bar.baz"
// resolves it to a named entity and returns the proto name split at the
// namespace boundary.
//   e.g. ".foo" "bar.baz"
// and also returns the type descriptor and file descriptor in which it is
// contained.
func (n *Namespace) FindFullyQualifiedName(fqn string) (string, string, interface{}, *desc.FileDescriptorProto) {
	mustFullyQualified(fqn)
	ns, name, i, fdp := n.find(fqn, true)
	if i == nil {
		panic("couldn't resolve name: " + fqn)
	}
	ns = strings.TrimSuffix(ns, ".")
	return ns, name, i, fdp
}

func (n *Namespace) find(fqn string, checkParent bool) (string, string, interface{}, *desc.FileDescriptorProto) {
	if strings.HasPrefix(fqn, n.Fqn) {
		// This name might be in our namespace
		relative := strings.TrimPrefix(fqn, n.Fqn)
		if name := n.Names.get(false, strings.Split(relative, ".")...); name != nil {
			return n.Fqn, relative, name.descriptor, name.fileDescriptor
		}
		// It may also be in a decendant namespace.
		for _, childns := range n.Children {
			rns, rname, i, fdp := childns.find(fqn, false)
			if rns != "" {
				return rns, rname, i, fdp
			}
		}

	}
	// Try our ancestor namespace.
	// TODO: this will revist n [us] multiple times! We could optimize.
	if checkParent && n.parent != nil {
		return n.parent.FindFullyQualifiedName(fqn)
	}
	return "", "", nil, nil
}
