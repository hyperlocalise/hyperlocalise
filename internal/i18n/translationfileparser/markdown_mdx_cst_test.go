package translationfileparser

import "testing"

func TestParseMDXCSTCapturesMultilineESMAsSingleNode(t *testing.T) {
	source := []byte("export const meta = {\n  title: `Docs ${locale}`,\n  note: \"keep\", // comment stays protected\n}\n\nVisible paragraph.\n")
	root := parseMDXCST(source)

	if len(root.Children) != 2 {
		t.Fatalf("expected esm + trailing text nodes, got %d", len(root.Children))
	}
	if root.Children[0].Kind != mdxKindESM {
		t.Fatalf("expected first child to be esm, got %s", root.Children[0].Kind)
	}
	if got := root.Children[0].slice(string(source)); got != "export const meta = {\n  title: `Docs ${locale}`,\n  note: \"keep\", // comment stays protected\n}\n" {
		t.Fatalf("expected exact multiline esm slice preserved, got %q", got)
	}
	if root.Children[1].Kind != mdxKindText {
		t.Fatalf("expected second child to be text, got %s", root.Children[1].Kind)
	}
}

func TestParseMDXCSTBuildsNestedJSXElementTreeForFragments(t *testing.T) {
	source := []byte("<Card>\n  <>\n    Fragment prose.\n  </>\n</Card>\n")
	root := parseMDXCST(source)

	if len(root.Children) != 1 {
		t.Fatalf("expected one top-level jsx node, got %d", len(root.Children))
	}
	card := root.Children[0]
	if card.Kind != mdxKindJSXElement || card.ContainerName != "Card" {
		t.Fatalf("expected top-level Card jsx element, got kind=%s name=%q", card.Kind, card.ContainerName)
	}
	if len(card.Children) != 4 {
		t.Fatalf("expected open, newline, fragment child, and close, got %d children", len(card.Children))
	}
	fragment := card.Children[2]
	if fragment.Kind != mdxKindJSXElement || fragment.ContainerName != "fragment" {
		t.Fatalf("expected nested fragment element, got kind=%s name=%q", fragment.Kind, fragment.ContainerName)
	}
	if len(fragment.Children) != 4 {
		t.Fatalf("expected fragment open/newline/text/close children, got %d", len(fragment.Children))
	}
	if fragment.Children[2].Kind != mdxKindText {
		t.Fatalf("expected fragment body text child, got %s", fragment.Children[2].Kind)
	}
}

func TestParseMDXCSTMarksUnclosedFlowTagAsMalformedRegion(t *testing.T) {
	source := []byte("<Card title=\"broken\"\n  Replace only safe prose outside malformed tag.\n\nOutro paragraph.\n")
	root := parseMDXCST(source)

	if len(root.Children) != 2 {
		t.Fatalf("expected malformed region plus trailing text, got %d children", len(root.Children))
	}
	if root.Children[0].Kind != mdxKindMalformed {
		t.Fatalf("expected first child to be malformed, got %s", root.Children[0].Kind)
	}
	if got := root.Children[0].slice(string(source)); got != "<Card title=\"broken\"\n  Replace only safe prose outside malformed tag.\n\n" {
		t.Fatalf("expected malformed region to stop at blank line, got %q", got)
	}
	if root.Children[1].Kind != mdxKindText {
		t.Fatalf("expected trailing text after malformed region, got %s", root.Children[1].Kind)
	}
}

func TestParseMDXCSTBuildsElementForSameLineOpeningWithTrailingBody(t *testing.T) {
	source := []byte("<Card title=\"One\">Alpha source.\n</Card>\n")
	root := parseMDXCST(source)

	if len(root.Children) != 1 {
		t.Fatalf("expected one top-level jsx node, got %d", len(root.Children))
	}
	card := root.Children[0]
	if card.Kind != mdxKindJSXElement {
		t.Fatalf("expected jsx element, got %s", card.Kind)
	}
	if len(card.Children) != 3 {
		t.Fatalf("expected open/text/close children, got %d", len(card.Children))
	}
	if card.Children[1].Kind != mdxKindText || card.Children[1].slice(string(source)) != "Alpha source.\n" {
		t.Fatalf("expected trailing same-line body captured as text child, got kind=%s text=%q", card.Children[1].Kind, card.Children[1].slice(string(source)))
	}
}

func TestParseMDXCSTBuildsElementForBlockquotedMultilineTag(t *testing.T) {
	source := []byte("> <Step\n>   title=\"Prepare\"\n>   icon={<Badge text=\"go\" />}\n> >\n>   Review the docs portal.\n> </Step>\n")
	root := parseMDXCST(source)

	if len(root.Children) != 1 {
		t.Fatalf("expected one top-level jsx node, got %d", len(root.Children))
	}
	step := root.Children[0]
	if step.Kind != mdxKindJSXElement || step.ContainerName != "Step" {
		t.Fatalf("expected blockquoted Step jsx element, got kind=%s name=%q", step.Kind, step.ContainerName)
	}
	if len(step.Children) != 4 {
		t.Fatalf("expected open/newline/text/close children, got %d", len(step.Children))
	}
	if step.Children[2].Kind != mdxKindText {
		t.Fatalf("expected blockquoted body text child, got %s", step.Children[2].Kind)
	}
}
