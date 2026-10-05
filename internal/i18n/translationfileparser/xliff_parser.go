package translationfileparser

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"net/url"
	"slices"
	"sort"
	"strconv"
	"strings"
)

// XLIFFParser parses XLIFF 1.2 units and independent XLIFF 2.x segments.
type XLIFFParser struct{}

// xliffElement records byte ranges so writeback never re-encodes untouched XML.
type xliffElement struct {
	token                    xml.StartElement
	name                     string
	start, inner, close, end int
	selfClosing              bool
	parent                   *xliffElement
	children                 []*xliffElement
}

type xliffEntry struct {
	key                              string
	unit                             *xliffElement
	source, target                   *xliffElement
	segmentedSource, targetContainer *xliffElement
	positional                       bool
}

type xliffEdit struct {
	start, end int
	value      string
}

func readXLIFF(content []byte) ([]*xliffElement, error) {
	decoder := xml.NewDecoder(bytes.NewReader(content))
	var elements []*xliffElement
	var stack []*xliffElement
	for {
		before := int(decoder.InputOffset())
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("xml decode: %w", err)
		}
		after := int(decoder.InputOffset())
		switch t := token.(type) {
		case xml.StartElement:
			raw := string(content[before:after])
			nameEnd := strings.IndexAny(raw[1:], " \t\r\n/>") + 1
			node := &xliffElement{token: t.Copy(), name: raw[1:nameEnd], start: before, inner: after, selfClosing: strings.HasSuffix(raw, "/>")}
			if len(stack) > 0 {
				node.parent = stack[len(stack)-1]
				node.parent.children = append(node.parent.children, node)
			}
			elements = append(elements, node)
			stack = append(stack, node)
		case xml.EndElement:
			node := stack[len(stack)-1]
			node.close, node.end = before, after
			stack = stack[:len(stack)-1]
		}
	}
	return elements, nil
}

func xliffChild(node *xliffElement, name string) *xliffElement {
	for _, child := range node.children {
		if child.token.Name.Local == name && isXLIFFElement(child) {
			return child
		}
	}
	return nil
}

func isXLIFFElement(node *xliffElement) bool {
	ns := node.token.Name.Space
	return ns == "" || ns == "urn:oasis:names:tc:xliff:document:1.2" || ns == "urn:oasis:names:tc:xliff:document:2.0"
}

func xliffEntries(elements []*xliffElement) ([]xliffEntry, error) {
	var entries []xliffEntry
	seen := make(map[string]bool)
	for _, unit := range elements {
		if !isXLIFFElement(unit) || (unit.token.Name.Local != "unit" && unit.token.Name.Local != "trans-unit") {
			continue
		}
		key := resolveXLIFFUnitKey(unit.token.Attr)
		if key == "" {
			continue
		}
		containers := []*xliffElement{unit}
		if unit.token.Name.Local == "unit" {
			containers = nil
			for _, child := range unit.children {
				if child.token.Name.Local == "segment" && isXLIFFElement(child) {
					containers = append(containers, child)
				}
			}
		}
		segmentedSource := xliffChild(unit, "seg-source")
		targetContainer := xliffChild(unit, "target")
		if unit.token.Name.Local == "trans-unit" && segmentedSource != nil {
			containers = xliffMarkers(segmentedSource)
		}
		for index, container := range containers {
			entryKey := key
			segmentID := attrValue(container.token.Attr, "id")
			if segmentedSource != nil {
				segmentID = attrValue(container.token.Attr, "mid")
			}
			if len(containers) > 1 {
				if segmentID != "" {
					entryKey += "#segment=" + url.QueryEscape(segmentID)
				} else {
					entryKey += "#segment-index=" + strconv.Itoa(index+1)
				}
			}
			if seen[entryKey] {
				return nil, fmt.Errorf("ambiguous XLIFF key %q: duplicate unit or segment identity", entryKey)
			}
			seen[entryKey] = true
			entry := xliffEntry{key: entryKey, unit: unit, source: xliffChild(container, "source"), target: xliffChild(container, "target"), positional: len(containers) > 1 && segmentID == ""}
			if segmentedSource != nil {
				if segmentID == "" {
					return nil, fmt.Errorf("XLIFF segmented unit %q has a marker without mid", key)
				}
				entry.source, entry.target = container, nil
				entry.segmentedSource, entry.targetContainer = segmentedSource, targetContainer
				if targetContainer != nil {
					for _, marker := range xliffMarkers(targetContainer) {
						if attrValue(marker.token.Attr, "mid") == segmentID {
							if entry.target != nil {
								return nil, fmt.Errorf("duplicate XLIFF target marker %q", segmentID)
							}
							entry.target = marker
						}
					}
				}
			}
			entries = append(entries, entry)
		}
	}
	return entries, nil
}

func xliffMarkers(node *xliffElement) []*xliffElement {
	var markers []*xliffElement
	for _, child := range node.children {
		if child.token.Name.Local == "mrk" && isXLIFFElement(child) && attrValue(child.token.Attr, "mtype") == "seg" {
			markers = append(markers, child)
		} else {
			markers = append(markers, xliffMarkers(child)...)
		}
	}
	return markers
}

func xliffInner(content []byte, node *xliffElement) []byte {
	if node == nil || node.selfClosing {
		return nil
	}
	return content[node.inner:node.close]
}

func (p XLIFFParser) Parse(content []byte) (map[string]string, error) {
	elements, err := readXLIFF(content)
	if err != nil {
		return nil, err
	}
	entries, err := xliffEntries(elements)
	if err != nil {
		return nil, err
	}
	out := make(map[string]string, len(entries))
	for _, entry := range entries {
		value := xliffInner(content, entry.target)
		if len(bytes.TrimSpace(value)) == 0 {
			value = xliffInner(content, entry.source)
		}
		if len(value) > 0 {
			out[entry.key] = normalizeXLIFFMarkup(value)
		}
	}
	return out, nil
}

// XLIFFSourceStructureEqual reports whether the same entry keys refer to the
// same sources. Equal key sets alone cannot identify anonymous segments after a reorder.
func XLIFFSourceStructureEqual(source, target []byte) bool {
	sourceEntries, err := readXLIFFEntries(source)
	if err != nil {
		return false
	}
	targetEntries, err := readXLIFFEntries(target)
	if err != nil || len(sourceEntries) != len(targetEntries) {
		return false
	}
	byKey := make(map[string]xliffEntry, len(targetEntries))
	for _, entry := range targetEntries {
		byKey[entry.key] = entry
	}
	for _, entry := range sourceEntries {
		other, exists := byKey[entry.key]
		if !exists || !sameXLIFFSource(source, entry, target, other) {
			return false
		}
	}
	return true
}

func readXLIFFEntries(content []byte) ([]xliffEntry, error) {
	elements, err := readXLIFF(content)
	if err != nil {
		return nil, err
	}
	return xliffEntries(elements)
}

func sameXLIFFSource(source []byte, entry xliffEntry, target []byte, other xliffEntry) bool {
	if entry.source == nil || other.source == nil {
		return false
	}
	text := normalizeXLIFFMarkup(xliffInner(source, entry.source))
	otherText := normalizeXLIFFMarkup(xliffInner(target, other.source))
	if text != otherText {
		return false
	}
	codes, err := xliffInlineCodes(entry.source, text)
	otherCodes, otherErr := xliffInlineCodes(other.source, otherText)
	return err == nil && otherErr == nil && equalXLIFFCodes(codes, otherCodes)
}

// XLIFFTargetEntriesForSource aligns existing target values with current source
// keys. Anonymous segments that moved are matched by source within their unit;
// ambiguous matches fail rather than attaching a translation to the wrong source.
func XLIFFTargetEntriesForSource(source, target []byte) (map[string]string, error) {
	sourceEntries, err := readXLIFFEntries(source)
	if err != nil {
		return nil, err
	}
	targetEntries, err := readXLIFFEntries(target)
	if err != nil {
		return nil, err
	}
	byKey := make(map[string]xliffEntry, len(targetEntries))
	for _, entry := range targetEntries {
		byKey[entry.key] = entry
	}
	out := make(map[string]string)
	for _, entry := range sourceEntries {
		other, exists := byKey[entry.key]
		if !exists || !sameXLIFFSource(source, entry, target, other) {
			if !entry.positional {
				continue
			}
			exists = false
			for _, candidate := range targetEntries {
				if !candidate.positional || resolveXLIFFUnitKey(entry.unit.token.Attr) != resolveXLIFFUnitKey(candidate.unit.token.Attr) || !sameXLIFFSource(source, entry, target, candidate) {
					continue
				}
				if exists {
					return nil, fmt.Errorf("ambiguous XLIFF positional segment %q; assign stable segment IDs", entry.key)
				}
				other, exists = candidate, true
			}
		}
		if !exists {
			continue
		}
		value := xliffInner(target, other.target)
		if len(bytes.TrimSpace(value)) > 0 {
			out[entry.key] = normalizeXLIFFMarkup(value)
		}
	}
	return out, nil
}

// normalizeXLIFFMarkup expands empty tags and escapes character data without
// changing qualified tag names or attributes inherited from the document.
func normalizeXLIFFMarkup(value []byte) string {
	decoder := xml.NewDecoder(bytes.NewReader(value))
	var out bytes.Buffer
	var names []string
	for {
		before := int(decoder.InputOffset())
		token, err := decoder.Token()
		if err == io.EOF {
			return out.String()
		}
		if err != nil {
			return string(value)
		}
		raw := value[before:int(decoder.InputOffset())]
		switch t := token.(type) {
		case xml.StartElement:
			end := bytes.IndexAny(raw[1:], " \t\r\n/>") + 1
			names = append(names, string(raw[1:end]))
			if bytes.HasSuffix(raw, []byte("/>")) {
				out.Write(raw[:len(raw)-2])
				out.WriteByte('>')
			} else {
				out.Write(raw)
			}
		case xml.EndElement:
			name := names[len(names)-1]
			names = names[:len(names)-1]
			if len(raw) == 0 {
				out.WriteString("</" + name + ">")
			} else {
				out.Write(raw)
			}
		case xml.CharData:
			_ = xml.EscapeText(&out, t)
		default:
			out.Write(raw)
		}
	}
}

// MarshalXLIFF updates segment targets and creates missing targets. Source XML,
// namespace prefixes, comments, and unmodified metadata retain their original bytes.
func MarshalXLIFF(template []byte, values map[string]string, sourceLocale, targetLocale string) ([]byte, error) {
	elements, err := readXLIFF(template)
	if err != nil {
		return nil, err
	}
	entries, err := xliffEntries(elements)
	if err != nil {
		return nil, err
	}
	var edits []xliffEdit
	for _, node := range elements {
		if !isXLIFFElement(node) {
			continue
		}
		attrs := make(map[string]string)
		if node.token.Name.Local == "xliff" && strings.HasPrefix(attrValue(node.token.Attr, "version"), "2") {
			attrs["srcLang"], attrs["trgLang"] = sourceLocale, targetLocale
		} else if node.token.Name.Local == "file" {
			root := node.parent
			if root != nil && root.token.Name.Local == "xliff" && !strings.HasPrefix(attrValue(root.token.Attr, "version"), "2") {
				attrs["source-language"], attrs["target-language"] = sourceLocale, targetLocale
			}
		}
		tag := string(template[node.start:node.inner])
		changed := tag
		// Fixed order keeps newly added locale attributes deterministic.
		for _, name := range []string{"source-language", "target-language", "srcLang", "trgLang"} {
			if value := strings.TrimSpace(attrs[name]); value != "" {
				changed = setXLIFFTagAttr(changed, name, value)
			}
		}
		if changed != tag {
			edits = append(edits, xliffEdit{node.start, node.inner, changed})
		}
	}
	segmentedEdits := make(map[*xliffElement][]xliffEdit)
	for _, entry := range entries {
		if entry.key != resolveXLIFFUnitKey(entry.unit.token.Attr) {
			if _, ok := values[resolveXLIFFUnitKey(entry.unit.token.Attr)]; ok {
				return nil, fmt.Errorf("XLIFF unit %q has multiple segments; use segment keys", resolveXLIFFUnitKey(entry.unit.token.Attr))
			}
		}
		value, ok := values[entry.key]
		if !ok {
			continue
		}
		if entry.source == nil {
			return nil, fmt.Errorf("XLIFF entry %q has no source", entry.key)
		}
		fragment, err := xliffReplacement(template, entry.source, value)
		if err != nil {
			return nil, fmt.Errorf("XLIFF entry %q: %w", entry.key, err)
		}
		if entry.segmentedSource != nil && entry.target == nil {
			if entry.targetContainer != nil {
				return nil, fmt.Errorf("XLIFF entry %q has no matching target marker; cannot safely update segmented target", entry.key)
			}
			segmentedEdits[entry.segmentedSource] = append(segmentedEdits[entry.segmentedSource], xliffContentEdit(template, entry.source, fragment))
			continue
		}
		if entry.target != nil {
			// Validate prefixes in the actual destination context as well.
			expected, _ := xliffInlineCodes(entry.source, fragment)
			actual, err := xliffInlineCodes(entry.target, fragment)
			if err != nil || !equalXLIFFCodes(expected, actual) {
				return nil, fmt.Errorf("XLIFF entry %q: incompatible target inline namespace context", entry.key)
			}
			edits = append(edits, xliffContentEdit(template, entry.target, fragment))
		} else {
			name := "target"
			if i := strings.IndexByte(entry.source.name, ':'); i >= 0 {
				name = entry.source.name[:i+1] + name
			}
			attr := xliffTargetAttrs(entry.source)
			edits = append(edits, xliffEdit{entry.source.end, entry.source.end, "<" + name + attr + ">" + fragment + "</" + name + ">"})
		}
	}
	for source, replacements := range segmentedEdits {
		local := make([]xliffEdit, len(replacements))
		for i, edit := range replacements {
			local[i] = xliffEdit{edit.start - source.inner, edit.end - source.inner, edit.value}
		}
		inner, err := applyXLIFFEdits(xliffInner(template, source), local)
		if err != nil {
			return nil, err
		}
		name := "target"
		if i := strings.IndexByte(source.name, ':'); i >= 0 {
			name = source.name[:i+1] + name
		}
		// XLIFF 1.2 orders target after seg-source and before context/notes.
		edits = append(edits, xliffEdit{source.end, source.end, "<" + name + xliffTargetAttrs(source) + ">" + string(inner) + "</" + name + ">"})
	}
	return applyXLIFFEdits(template, edits)
}

func xliffTargetAttrs(source *xliffElement) string {
	var out strings.Builder
	for _, attr := range source.token.Attr {
		name := ""
		if attr.Name.Space == "xmlns" {
			name = "xmlns:" + attr.Name.Local
		} else if attr.Name.Space == "" && attr.Name.Local == "xmlns" {
			name = "xmlns"
		} else if attr.Name.Space == "http://www.w3.org/XML/1998/namespace" && attr.Name.Local == "space" {
			name = "xml:space"
		}
		if name != "" {
			out.WriteString(" " + name + `="` + escapeXLIFFText(attr.Value) + `"`)
		}
	}
	return out.String()
}

type xliffInlineSignature struct {
	codes       map[string]int
	pairedCodes []string
}

func equalXLIFFCodes(a, b xliffInlineSignature) bool {
	if len(a.codes) != len(b.codes) || !slices.Equal(a.pairedCodes, b.pairedCodes) {
		return false
	}
	for key, count := range a.codes {
		if b.codes[key] != count {
			return false
		}
	}
	return true
}

func xliffContentEdit(template []byte, node *xliffElement, fragment string) xliffEdit {
	if node.selfClosing {
		tag := string(template[node.start:node.inner])
		return xliffEdit{node.start, node.end, tag[:len(tag)-2] + ">" + fragment + "</" + node.name + ">"}
	}
	return xliffEdit{node.inner, node.close, fragment}
}

func applyXLIFFEdits(template []byte, edits []xliffEdit) ([]byte, error) {
	sort.SliceStable(edits, func(i, j int) bool { return edits[i].start < edits[j].start })
	var out bytes.Buffer
	cursor := 0
	for _, edit := range edits {
		if edit.start < cursor {
			return nil, fmt.Errorf("overlapping XLIFF edits")
		}
		out.Write(template[cursor:edit.start])
		out.WriteString(edit.value)
		cursor = edit.end
	}
	out.Write(template[cursor:])
	return out.Bytes(), nil
}

func escapeXLIFFText(value string) string {
	var out bytes.Buffer
	_ = xml.EscapeText(&out, []byte(value))
	return out.String()
}

// setXLIFFTagAttr edits the value of an unqualified attribute only, preserving
// quoting and all other start-tag bytes. The input has already been XML-validated.
func setXLIFFTagAttr(tag, name, value string) string {
	i := strings.IndexAny(tag, " \t\r\n/>")
	for i < len(tag) {
		for i < len(tag) && strings.ContainsRune(" \t\r\n", rune(tag[i])) {
			i++
		}
		if i >= len(tag) || tag[i] == '/' || tag[i] == '>' {
			break
		}
		start := i
		for i < len(tag) && !strings.ContainsRune("= \t\r\n", rune(tag[i])) {
			i++
		}
		attr := tag[start:i]
		for tag[i] != '=' {
			i++
		}
		i++
		for strings.ContainsRune(" \t\r\n", rune(tag[i])) {
			i++
		}
		quote := tag[i]
		i++
		valueStart := i
		for tag[i] != quote {
			i++
		}
		if attr == name {
			return tag[:valueStart] + escapeXLIFFText(value) + tag[i:]
		}
		i++
	}
	end := len(tag) - 1
	if tag[end-1] == '/' {
		end--
	}
	return tag[:end] + " " + name + `="` + escapeXLIFFText(value) + `"` + tag[end:]
}

// xliffReplacement validates mixed XML in its inherited namespace context and
// prevents translation from dropping or modifying source inline code identities.
func xliffReplacement(template []byte, source *xliffElement, value string) (string, error) {
	sourceCodes, err := xliffInlineCodes(source, string(xliffInner(template, source)))
	if err != nil {
		return "", err
	}
	codes, parseErr := xliffInlineCodes(source, value)
	if parseErr != nil {
		if len(sourceCodes.codes) > 0 {
			return "", fmt.Errorf("invalid inline XML: %w", parseErr)
		}
		return escapeXLIFFText(value), nil
	}
	if !equalXLIFFCodes(sourceCodes, codes) {
		return "", fmt.Errorf("inline code identities, attributes, payloads, or native pair order differ from source")
	}
	return value, nil
}

func xliffInlineCodes(source *xliffElement, value string) (xliffInlineSignature, error) {
	namespaces := make(map[string]string)
	for node := source; node != nil; node = node.parent {
		for _, attr := range node.token.Attr {
			name := ""
			if attr.Name.Space == "xmlns" {
				name = "xmlns:" + attr.Name.Local
			} else if attr.Name.Space == "" && attr.Name.Local == "xmlns" {
				name = "xmlns"
			}
			if name != "" {
				if _, exists := namespaces[name]; !exists {
					namespaces[name] = attr.Value
				}
			}
		}
	}
	var wrapper strings.Builder
	wrapper.WriteString("<hyperlocalise-root")
	for name, namespace := range namespaces {
		wrapper.WriteString(" " + name + `="` + escapeXLIFFText(namespace) + `"`)
	}
	wrapper.WriteString(">" + value + "</hyperlocalise-root>")
	decoder := xml.NewDecoder(strings.NewReader(wrapper.String()))
	signature := xliffInlineSignature{codes: make(map[string]int)}
	depth := 0
	closed := false
	var scopes []map[string]string
	for {
		before := int(decoder.InputOffset())
		token, err := decoder.Token()
		if err == io.EOF {
			return signature, nil
		}
		if err != nil {
			return xliffInlineSignature{}, err
		}
		switch t := token.(type) {
		case xml.StartElement:
			if closed {
				return xliffInlineSignature{}, fmt.Errorf("inline fragment escapes its container")
			}
			scope := make(map[string]string)
			if len(scopes) > 0 {
				for name, namespace := range scopes[len(scopes)-1] {
					scope[name] = namespace
				}
			}
			for _, attr := range t.Attr {
				if attr.Name.Space == "xmlns" {
					scope["xmlns:"+attr.Name.Local] = attr.Value
				} else if attr.Name.Space == "" && attr.Name.Local == "xmlns" {
					scope["xmlns"] = attr.Value
				}
			}
			raw := wrapper.String()[before:int(decoder.InputOffset())]
			nameEnd := strings.IndexAny(raw[1:], " \t\r\n/>") + 1
			qualifiedName := raw[1:nameEnd]
			if colon := strings.IndexByte(qualifiedName, ':'); colon >= 0 && qualifiedName[:colon] != "xml" && scope["xmlns:"+qualifiedName[:colon]] == "" {
				return xliffInlineSignature{}, fmt.Errorf("undeclared inline namespace prefix %q", qualifiedName[:colon])
			}
			if depth > 0 {
				var attrs []string
				for _, attr := range t.Attr {
					if attr.Name.Space != "xmlns" && attr.Name.Local != "xmlns" {
						attrs = append(attrs, fmt.Sprintf("%q:%q=%q", attr.Name.Space, attr.Name.Local, attr.Value))
					}
				}
				sort.Strings(attrs)
				key := fmt.Sprintf("%q:%q %s", t.Name.Space, t.Name.Local, strings.Join(attrs, " "))
				switch t.Name.Local {
				case "ph", "bpt", "ept", "it", "x", "bx", "ex", "sc", "ec":
					if t.Name.Space == "" || strings.HasPrefix(t.Name.Space, "urn:oasis:names:tc:xliff:document:") {
						var payload struct {
							Inner string `xml:",innerxml"`
						}
						if err := decoder.DecodeElement(&payload, &t); err != nil {
							return xliffInlineSignature{}, err
						}
						key += " payload=" + normalizeXLIFFMarkup([]byte(payload.Inner))
						signature.codes[key]++
						switch t.Name.Local {
						case "bpt", "ept", "bx", "ex", "sc", "ec":
							signature.pairedCodes = append(signature.pairedCodes, key)
						}
						continue
					}
				}
				signature.codes[key]++
			}
			scopes = append(scopes, scope)
			depth++
		case xml.EndElement:
			depth--
			scopes = scopes[:len(scopes)-1]
			if depth == 0 {
				closed = true
			}
		}
	}
}

func resolveXLIFFUnitKey(attrs []xml.Attr) string {
	// BOLT OPTIMIZATION: Single-pass attribute scan with priority (id > name > resname).
	var name, resname string
	for _, attr := range attrs {
		switch attr.Name.Local {
		case "id":
			if v := strings.TrimSpace(attr.Value); v != "" {
				return v
			}
		case "name":
			if name == "" {
				name = strings.TrimSpace(attr.Value)
			}
		case "resname":
			if resname == "" {
				resname = strings.TrimSpace(attr.Value)
			}
		}
	}
	if name != "" {
		return name
	}
	return resname
}

func hasXLIFFTargetElement(content []byte) bool {
	// BOLT OPTIMIZATION: If "target" is absent from content, no <target> or <x:target>
	// element can exist, avoiding xml.Decoder initialization.
	if !bytes.Contains(content, []byte("target")) {
		return false
	}

	decoder := xml.NewDecoder(bytes.NewReader(content))
	depth := 0
	for {
		// RawToken skips namespace resolution and nesting checks, so the unmatched end
		// element that closes the unit is reported instead of failing the scan.
		tok, err := decoder.RawToken()
		if err != nil {
			return false
		}
		switch t := tok.(type) {
		case xml.StartElement:
			if t.Name.Local == "target" {
				return true
			}
			depth++
		case xml.EndElement:
			if depth == 0 {
				return false
			}
			depth--
		}
	}
}
