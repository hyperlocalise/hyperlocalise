package translationfileparser

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
)

// Office Open XML packages (.docx, .pptx) are zip archives of XML parts. The
// parsers here read parts into a tree that keeps every element's byte offsets,
// so a writer can regenerate only the paragraphs it translates and copy every
// other byte, including namespace prefixes and markup it does not understand.

const (
	ooxmlNamespaceWord      = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
	ooxmlNamespaceDrawing   = "http://schemas.openxmlformats.org/drawingml/2006/main"
	ooxmlNamespaceMarkup    = "http://schemas.openxmlformats.org/markup-compatibility/2006"
	ooxmlNamespaceRelations = "http://schemas.openxmlformats.org/package/2006/relationships"
	ooxmlNamespaceXML       = "http://www.w3.org/XML/1998/namespace"
	// ooxmlMaxPartBytes caps one decompressed part to guard against zip bombs.
	ooxmlMaxPartBytes = 64 << 20
	ooxmlMaxDepth     = 512
)

type ooxmlNode struct {
	prefix      string
	local       string
	space       string
	attrs       []xml.Attr
	start       int
	startTagEnd int
	closeStart  int
	end         int
	selfClosing bool
	children    []*ooxmlNode
	content     []byte
}

func (n *ooxmlNode) raw() []byte {
	return n.content[n.start:n.end]
}

func (n *ooxmlNode) inner() []byte {
	if n.selfClosing {
		return nil
	}
	return n.content[n.startTagEnd:n.closeStart]
}

func (n *ooxmlNode) is(space, local string) bool {
	return n.space == space && n.local == local
}

func (n *ooxmlNode) attr(local string) (string, bool) {
	for _, attr := range n.attrs {
		if attr.Name.Local == local && attr.Name.Space != "xmlns" {
			return attr.Value, true
		}
	}
	return "", false
}

// prefixedAttr returns an attribute written with a namespace prefix, such as r:id.
func (n *ooxmlNode) prefixedAttr(local string) (string, bool) {
	for _, attr := range n.attrs {
		if attr.Name.Local == local && attr.Name.Space != "" && attr.Name.Space != "xmlns" {
			return attr.Value, true
		}
	}
	return "", false
}

func (n *ooxmlNode) child(space, local string) *ooxmlNode {
	for _, c := range n.children {
		if c.is(space, local) {
			return c
		}
	}
	return nil
}

func (n *ooxmlNode) qualified(local string) string {
	if n.prefix == "" {
		return local
	}
	return n.prefix + ":" + local
}

// parseOOXMLTree returns a synthetic root whose children are the part's
// top-level elements.
func parseOOXMLTree(content []byte) (*ooxmlNode, error) {
	decoder := xml.NewDecoder(bytes.NewReader(content))
	root := &ooxmlNode{end: len(content), closeStart: len(content), content: content}
	stack := []*ooxmlNode{root}
	namespaces := []map[string]string{{"xml": ooxmlNamespaceXML}}
	skipEnd := false
	for {
		offset := int(decoder.InputOffset())
		token, err := decoder.RawToken()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("ooxml: read xml: %w", err)
		}
		switch t := token.(type) {
		case xml.StartElement:
			end := int(decoder.InputOffset())
			scope := namespaces[len(namespaces)-1]
			cloned := false
			for _, attr := range t.Attr {
				prefix, ok := "", false
				switch {
				case attr.Name.Space == "xmlns":
					prefix, ok = attr.Name.Local, true
				case attr.Name.Space == "" && attr.Name.Local == "xmlns":
					ok = true
				}
				if !ok {
					continue
				}
				if !cloned {
					scope = cloneNamespaces(scope)
					cloned = true
				}
				scope[prefix] = attr.Value
			}
			node := &ooxmlNode{
				prefix:      t.Name.Space,
				local:       t.Name.Local,
				space:       scope[t.Name.Space],
				attrs:       t.Attr,
				start:       offset,
				startTagEnd: end,
				selfClosing: end >= 2 && content[end-2] == '/',
				content:     content,
			}
			parent := stack[len(stack)-1]
			parent.children = append(parent.children, node)
			if node.selfClosing {
				node.closeStart, node.end = end, end
				skipEnd = true
				continue
			}
			if len(stack) > ooxmlMaxDepth {
				return nil, errors.New("ooxml: xml nesting too deep")
			}
			stack = append(stack, node)
			namespaces = append(namespaces, scope)
		case xml.EndElement:
			if skipEnd {
				skipEnd = false
				continue
			}
			if len(stack) < 2 {
				return nil, errors.New("ooxml: unbalanced xml")
			}
			node := stack[len(stack)-1]
			node.closeStart, node.end = offset, int(decoder.InputOffset())
			stack = stack[:len(stack)-1]
			namespaces = namespaces[:len(namespaces)-1]
		}
	}
	if len(stack) != 1 {
		return nil, errors.New("ooxml: unclosed xml element")
	}
	return root, nil
}

func cloneNamespaces(scope map[string]string) map[string]string {
	out := make(map[string]string, len(scope)+1)
	for k, v := range scope {
		out[k] = v
	}
	return out
}

func decodeOOXMLText(raw []byte) string {
	if !bytes.ContainsAny(raw, "&") {
		return string(raw)
	}
	var b strings.Builder
	b.Grow(len(raw))
	for i := 0; i < len(raw); i++ {
		if raw[i] != '&' {
			b.WriteByte(raw[i])
			continue
		}
		semi := bytes.IndexByte(raw[i:], ';')
		if semi < 0 {
			b.WriteByte(raw[i])
			continue
		}
		entity := string(raw[i+1 : i+semi])
		if decoded, ok := decodeOOXMLEntity(entity); ok {
			b.WriteString(decoded)
			i += semi
			continue
		}
		b.WriteByte(raw[i])
	}
	return b.String()
}

func decodeOOXMLEntity(entity string) (string, bool) {
	switch entity {
	case "amp":
		return "&", true
	case "lt":
		return "<", true
	case "gt":
		return ">", true
	case "quot":
		return `"`, true
	case "apos":
		return "'", true
	}
	if rest, ok := strings.CutPrefix(entity, "#x"); ok {
		code, err := strconv.ParseUint(rest, 16, 32)
		return string(rune(code)), err == nil && code <= 0x10FFFF
	}
	if rest, ok := strings.CutPrefix(entity, "#"); ok {
		code, err := strconv.ParseUint(rest, 10, 32)
		return string(rune(code)), err == nil && code <= 0x10FFFF
	}
	return "", false
}

func escapeOOXMLText(b *bytes.Buffer, text string) {
	for _, r := range text {
		switch r {
		case '&':
			b.WriteString("&amp;")
		case '<':
			b.WriteString("&lt;")
		case '>':
			b.WriteString("&gt;")
		default:
			b.WriteRune(r)
		}
	}
}

// ooxmlRenderer writes a part back out, regenerating the paragraphs in pending
// and copying every other byte from content.
type ooxmlRenderer struct {
	content  []byte
	pending  map[*ooxmlNode]func(*bytes.Buffer)
	dirty    map[*ooxmlNode]bool
	parentOf map[*ooxmlNode]*ooxmlNode
}

func newOOXMLRenderer(content []byte, root *ooxmlNode) *ooxmlRenderer {
	r := &ooxmlRenderer{
		content:  content,
		pending:  map[*ooxmlNode]func(*bytes.Buffer){},
		dirty:    map[*ooxmlNode]bool{},
		parentOf: map[*ooxmlNode]*ooxmlNode{},
	}
	var index func(*ooxmlNode)
	index = func(n *ooxmlNode) {
		for _, c := range n.children {
			r.parentOf[c] = n
			index(c)
		}
	}
	index(root)
	return r
}

func (r *ooxmlRenderer) replace(node *ooxmlNode, write func(*bytes.Buffer)) {
	r.pending[node] = write
	for n := r.parentOf[node]; n != nil && !r.dirty[n]; n = r.parentOf[n] {
		r.dirty[n] = true
	}
}

func (r *ooxmlRenderer) raw(node *ooxmlNode) []byte {
	return r.content[node.start:node.end]
}

func (r *ooxmlRenderer) render(b *bytes.Buffer, node *ooxmlNode) {
	if write, ok := r.pending[node]; ok {
		write(b)
		return
	}
	if !r.dirty[node] {
		b.Write(r.raw(node))
		return
	}
	pos := node.start
	for _, c := range node.children {
		b.Write(r.content[pos:c.start])
		r.render(b, c)
		pos = c.end
	}
	b.Write(r.content[pos:node.end])
}

type ooxmlPart struct {
	name    string
	content []byte
}

type ooxmlPackage struct {
	reader *zip.Reader
	files  map[string]*zip.File
}

func openOOXMLPackage(content []byte, format string) (*ooxmlPackage, error) {
	reader, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		return nil, fmt.Errorf("%s: open package: %w", format, err)
	}
	files := make(map[string]*zip.File, len(reader.File))
	for _, file := range reader.File {
		files[file.Name] = file
	}
	return &ooxmlPackage{reader: reader, files: files}, nil
}

func (p *ooxmlPackage) read(name string) ([]byte, bool, error) {
	file, ok := p.files[name]
	if !ok || strings.HasSuffix(name, "/") {
		return nil, false, nil
	}
	if file.UncompressedSize64 > ooxmlMaxPartBytes {
		return nil, false, fmt.Errorf("ooxml: part %q exceeds %d bytes", name, ooxmlMaxPartBytes)
	}
	entry, err := file.Open()
	if err != nil {
		return nil, false, fmt.Errorf("ooxml: open %q: %w", name, err)
	}
	defer func() { _ = entry.Close() }()
	content, err := io.ReadAll(io.LimitReader(entry, ooxmlMaxPartBytes+1))
	if err != nil {
		return nil, false, fmt.Errorf("ooxml: read %q: %w", name, err)
	}
	if len(content) > ooxmlMaxPartBytes {
		return nil, false, fmt.Errorf("ooxml: part %q exceeds %d bytes", name, ooxmlMaxPartBytes)
	}
	return content, true, nil
}

// relationshipTargets maps relationship ids to part names, resolved against dir.
func (p *ooxmlPackage) relationshipTargets(relsName, dir string) (map[string]string, map[string]string, error) {
	content, ok, err := p.read(relsName)
	if err != nil || !ok {
		return map[string]string{}, map[string]string{}, err
	}
	root, err := parseOOXMLTree(content)
	if err != nil {
		return nil, nil, err
	}
	targets := map[string]string{}
	types := map[string]string{}
	var walk func(*ooxmlNode)
	walk = func(n *ooxmlNode) {
		for _, c := range n.children {
			if c.local == "Relationship" {
				id, _ := c.attr("Id")
				target, _ := c.attr("Target")
				mode, _ := c.attr("TargetMode")
				if id != "" && target != "" && mode != "External" {
					targets[id] = resolveOOXMLPartName(dir, target)
					relType, _ := c.attr("Type")
					types[id] = relType
				}
			}
			walk(c)
		}
	}
	walk(root)
	return targets, types, nil
}

func resolveOOXMLPartName(dir, target string) string {
	if strings.HasPrefix(target, "/") {
		return strings.TrimPrefix(target, "/")
	}
	segments := []string{}
	for _, s := range strings.Split(dir, "/") {
		if s != "" {
			segments = append(segments, s)
		}
	}
	for _, s := range strings.Split(target, "/") {
		switch s {
		case "..":
			if len(segments) > 0 {
				segments = segments[:len(segments)-1]
			}
		case "", ".":
		default:
			segments = append(segments, s)
		}
	}
	return strings.Join(segments, "/")
}

// rewrite copies the package and replaces the named parts. Unchanged entries
// are copied without recompression, so output is stable for the same input.
func (p *ooxmlPackage) rewrite(replacements map[string][]byte, format string) ([]byte, error) {
	var out bytes.Buffer
	writer := zip.NewWriter(&out)
	if p.reader.Comment != "" {
		if err := writer.SetComment(p.reader.Comment); err != nil {
			return nil, fmt.Errorf("%s: set archive comment: %w", format, err)
		}
	}
	for _, file := range p.reader.File {
		updated, ok := replacements[file.Name]
		if !ok {
			if err := writer.Copy(file); err != nil {
				return nil, fmt.Errorf("%s: copy %q: %w", format, file.Name, err)
			}
			continue
		}
		entry, err := writer.CreateHeader(&zip.FileHeader{
			Name:          file.Name,
			Comment:       file.Comment,
			Method:        file.Method,
			Modified:      file.Modified,
			ExternalAttrs: file.ExternalAttrs,
		})
		if err != nil {
			return nil, fmt.Errorf("%s: create %q: %w", format, file.Name, err)
		}
		if _, err := entry.Write(updated); err != nil {
			return nil, fmt.Errorf("%s: write %q: %w", format, file.Name, err)
		}
	}
	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("%s: finalize package: %w", format, err)
	}
	return out.Bytes(), nil
}
