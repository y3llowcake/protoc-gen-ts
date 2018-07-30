package main

import (
	"encoding/json"
	"fmt"
	desc "github.com/golang/protobuf/protoc-gen-go/descriptor"
	"strings"
)

// Names is a tree of structures and enums defined in a single namespace.
type Names struct {
	parent     *Names
	Children   map[string]*Names
	descriptor interface{} // This should be set on every node of the tree.
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
		childns.Names.get(true, *edp.Name).descriptor = edp
	}

	// Messages, recurse.
	for _, dp := range fdp.MessageType {
		childNames := childns.Names.get(true, *dp.Name)
		childNames.descriptor = fdp.MessageType
		childNames.parseDescriptor(dp)
	}
}

func (n *Names) parseDescriptor(dp *desc.DescriptorProto) {

	for _, edp := range dp.EnumType {
		n.get(true, *edp.Name).descriptor = edp
	}

	for _, dp := range dp.NestedType {
		childNames := n.get(true, *dp.Name)
		childNames.descriptor = dp
		childNames.parseDescriptor(dp)
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
// and also returns the descriptor.
func (n *Namespace) FindFullyQualifiedName(fqn string) (string, string, interface{}) {
	mustFullyQualified(fqn)
	ns, name, i := n.find(fqn, true)
	if i == nil {
		panic("couldn't resolve name: " + fqn)
	}
	ns = strings.TrimSuffix(ns, ".")
	return ns, name, i
}

func (n *Namespace) find(fqn string, checkParent bool) (string, string, interface{}) {
	if strings.HasPrefix(fqn, n.Fqn) {
		// This name might be in our namespace
		relative := strings.TrimPrefix(fqn, n.Fqn)
		if name := n.Names.get(false, strings.Split(relative, ".")...); name != nil {
			return n.Fqn, relative, name.descriptor
		}
		// It may also be in a decendant namespace.
		for _, childns := range n.Children {
			rns, rname, i := childns.find(fqn, false)
			if rns != "" {
				return rns, rname, i
			}
		}

	}
	// Try our ancestor namespace.
	// TODO: this will revist n [us] multiple times! We could optimize.
	if checkParent && n.parent != nil {
		return n.parent.FindFullyQualifiedName(fqn)
	}
	return "", "", nil
}
