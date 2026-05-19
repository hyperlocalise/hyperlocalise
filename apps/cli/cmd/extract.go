package cmd

import (
	"encoding/json"
	"fmt"
	"html"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"unicode"

	"github.com/spf13/cobra"
)

type extractOptions struct {
	prefixID bool
}

type extractMessage struct {
	ID             string `json:"id"`
	DefaultMessage string `json:"defaultMessage"`
	Description    string `json:"description"`

	sourceLine int
	sourcePath string
	sourcePos  int
}

type extractObjectProperty struct {
	key            string
	objectValueEnd int
	objectValueSet bool
	objectValue    int
	stringValue    string
	stringValueSet bool
}

func newExtractCmd() *cobra.Command {
	o := extractOptions{}

	cmd := &cobra.Command{
		Use:          "extract [path...]",
		Short:        "extract react-intl messages from TypeScript files",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			messages, err := runExtract(args, o)
			if err != nil {
				return err
			}

			enc := json.NewEncoder(cmd.OutOrStdout())
			enc.SetIndent("", "  ")
			if err := enc.Encode(messages); err != nil {
				return fmt.Errorf("write extract output: %w", err)
			}

			return nil
		},
	}

	cmd.Flags().BoolVar(&o.prefixID, "prefix-id", false, "prefix message ids with the normalized source filename")

	return cmd
}

func runExtract(paths []string, options extractOptions) ([]extractMessage, error) {
	if len(paths) == 0 {
		paths = []string{"."}
	}

	files, err := resolveExtractFiles(paths)
	if err != nil {
		return nil, err
	}
	if len(files) == 0 {
		return nil, fmt.Errorf("no .ts or .tsx files matched")
	}

	messages := make([]extractMessage, 0)
	for _, file := range files {
		content, err := os.ReadFile(file)
		if err != nil {
			return nil, fmt.Errorf("read %q: %w", file, err)
		}

		fileMessages, err := extractMessagesFromReactIntlSource(string(content), file)
		if err != nil {
			return nil, fmt.Errorf("extract %q: %w", file, err)
		}
		if options.prefixID {
			prefix := normalizedExtractFilename(file)
			for i := range fileMessages {
				fileMessages[i].ID = prefix + "." + fileMessages[i].ID
			}
		}

		messages = append(messages, fileMessages...)
	}

	slices.SortStableFunc(messages, func(a, b extractMessage) int {
		if a.sourcePath != b.sourcePath {
			return strings.Compare(a.sourcePath, b.sourcePath)
		}
		return a.sourcePos - b.sourcePos
	})

	return messages, nil
}

func resolveExtractFiles(paths []string) ([]string, error) {
	seen := make(map[string]struct{})
	files := make([]string, 0)

	for _, rawPath := range paths {
		path := strings.TrimSpace(rawPath)
		if path == "" {
			return nil, fmt.Errorf("extract path cannot be empty")
		}

		matches, err := expandExtractPath(path)
		if err != nil {
			return nil, err
		}
		for _, match := range matches {
			if err := appendExtractFiles(&files, seen, match); err != nil {
				return nil, err
			}
		}
	}

	slices.Sort(files)

	return files, nil
}

func expandExtractPath(path string) ([]string, error) {
	if !hasGlobMeta(path) {
		return []string{path}, nil
	}

	matches, err := filepath.Glob(path)
	if err != nil {
		return nil, fmt.Errorf("expand glob %q: %w", path, err)
	}
	if len(matches) == 0 {
		return nil, fmt.Errorf("glob %q matched no files", path)
	}

	return matches, nil
}

func appendExtractFiles(files *[]string, seen map[string]struct{}, path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("stat %q: %w", path, err)
	}
	if !info.IsDir() {
		appendExtractFile(files, seen, path)
		return nil
	}

	return filepath.WalkDir(path, func(current string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			if current != path && shouldSkipExtractDir(entry.Name()) {
				return filepath.SkipDir
			}
			return nil
		}

		appendExtractFile(files, seen, current)

		return nil
	})
}

func appendExtractFile(files *[]string, seen map[string]struct{}, path string) {
	if !isExtractSourceFile(path) {
		return
	}
	clean := filepath.Clean(path)
	if _, ok := seen[clean]; ok {
		return
	}

	seen[clean] = struct{}{}
	*files = append(*files, clean)
}

func isExtractSourceFile(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	if ext != ".ts" && ext != ".tsx" {
		return false
	}

	return !strings.HasSuffix(strings.ToLower(path), ".d.ts")
}

func shouldSkipExtractDir(name string) bool {
	switch name {
	case ".git", ".next", "build", "coverage", "dist", "node_modules":
		return true
	default:
		return false
	}
}

func hasGlobMeta(path string) bool {
	return strings.ContainsAny(path, "*?[")
}

func extractMessagesFromReactIntlSource(src, file string) ([]extractMessage, error) {
	messages, err := extractReactIntlCallMessages(src, file)
	if err != nil {
		return nil, err
	}

	jsxMessages, err := extractReactIntlJSXMessages(src, file)
	if err != nil {
		return nil, err
	}
	messages = append(messages, jsxMessages...)

	for i := range messages {
		messages[i].sourceLine = sourceLine(src, messages[i].sourcePos)
	}

	slices.SortStableFunc(messages, func(a, b extractMessage) int {
		return a.sourcePos - b.sourcePos
	})

	return messages, nil
}

func extractReactIntlCallMessages(src, file string) ([]extractMessage, error) {
	messages := make([]extractMessage, 0)
	for i := 0; i < len(src); {
		if next, ok := skipIgnoredToken(src, i); ok {
			i = next
			continue
		}
		if !isIdentifierStart(src[i]) {
			i++
			continue
		}

		name, next := readIdentifier(src, i)
		if !isReactIntlCallName(name) {
			i = next
			continue
		}

		callOpen := findCallOpenAfterIdentifier(src, next)
		if callOpen < 0 {
			i = next
			continue
		}

		objectStart := firstObjectArgument(src, callOpen)
		if objectStart < 0 {
			i = callOpen + 1
			continue
		}

		objectEnd, ok := findMatchingDelimiter(src, objectStart, '{', '}')
		if !ok {
			return nil, fmt.Errorf("unterminated message descriptor at line %d", sourceLine(src, objectStart))
		}

		extracted, err := extractMessagesFromCallObject(src, file, name, objectStart, objectEnd)
		if err != nil {
			return nil, err
		}
		messages = append(messages, extracted...)
		i = objectEnd + 1
	}

	return messages, nil
}

func extractMessagesFromCallObject(src, file, name string, objectStart, objectEnd int) ([]extractMessage, error) {
	if name == "defineMessages" {
		return collectNestedMessageDescriptors(src, file, objectStart, objectEnd)
	}

	message, ok, err := extractMessageDescriptor(src, file, objectStart, objectEnd)
	if err != nil || !ok {
		return nil, err
	}

	return []extractMessage{message}, nil
}

func isReactIntlCallName(name string) bool {
	switch name {
	case "defineMessage", "defineMessages", "formatMessage":
		return true
	default:
		return false
	}
}

func findCallOpenAfterIdentifier(src string, index int) int {
	i := skipWhitespaceAndComments(src, index)
	if i < len(src) && src[i] == '<' {
		typeEnd, ok := findTypeArgumentEnd(src, i)
		if !ok {
			return -1
		}
		i = skipWhitespaceAndComments(src, typeEnd+1)
	}
	if i < len(src) && src[i] == '(' {
		return i
	}

	return -1
}

func firstObjectArgument(src string, callOpen int) int {
	i := skipWhitespaceAndComments(src, callOpen+1)
	if i < len(src) && src[i] == '{' {
		return i
	}

	return -1
}

func collectNestedMessageDescriptors(src, file string, objectStart, objectEnd int) ([]extractMessage, error) {
	message, ok, err := extractMessageDescriptor(src, file, objectStart, objectEnd)
	if err != nil || ok {
		if !ok {
			return nil, err
		}

		return []extractMessage{message}, nil
	}

	properties, err := parseObjectProperties(src, objectStart, objectEnd)
	if err != nil {
		return nil, err
	}

	messages := make([]extractMessage, 0)
	for _, property := range properties {
		if !property.objectValueSet {
			continue
		}

		nested, err := collectNestedMessageDescriptors(src, file, property.objectValue, property.objectValueEnd)
		if err != nil {
			return nil, err
		}
		messages = append(messages, nested...)
	}

	return messages, nil
}

func extractMessageDescriptor(src, file string, objectStart, objectEnd int) (extractMessage, bool, error) {
	properties, err := parseObjectProperties(src, objectStart, objectEnd)
	if err != nil {
		return extractMessage{}, false, err
	}

	values := make(map[string]string)
	for _, property := range properties {
		if !property.stringValueSet {
			continue
		}
		switch property.key {
		case "description", "defaultMessage", "id":
			values[property.key] = property.stringValue
		}
	}

	id, ok := values["id"]
	if !ok || strings.TrimSpace(id) == "" {
		return extractMessage{}, false, nil
	}

	return extractMessage{
		ID:             id,
		DefaultMessage: values["defaultMessage"],
		Description:    values["description"],
		sourcePath:     file,
		sourcePos:      objectStart,
	}, true, nil
}

func parseObjectProperties(src string, objectStart, objectEnd int) ([]extractObjectProperty, error) {
	properties := make([]extractObjectProperty, 0)
	for i := objectStart + 1; i < objectEnd; {
		i = skipWhitespaceAndComments(src, i)
		if i >= objectEnd {
			break
		}
		if src[i] == ',' {
			i++
			continue
		}

		key, next, ok := readObjectPropertyKey(src, i)
		if !ok {
			i = skipValueExpression(src, i, objectEnd)
			continue
		}

		valueStart := skipWhitespaceAndComments(src, next)
		if valueStart >= objectEnd || src[valueStart] != ':' {
			i = skipValueExpression(src, valueStart, objectEnd)
			continue
		}

		valueStart = skipWhitespaceAndComments(src, valueStart+1)
		property, err := parseObjectPropertyValue(src, key, valueStart, objectEnd)
		if err != nil {
			return nil, err
		}
		properties = append(properties, property)
		i = skipValueExpression(src, valueStart, objectEnd)
	}

	return properties, nil
}

func parseObjectPropertyValue(src, key string, valueStart, objectEnd int) (extractObjectProperty, error) {
	property := extractObjectProperty{key: key}
	if valueStart >= objectEnd {
		return property, nil
	}

	if isStringQuote(src[valueStart]) {
		value, _, ok := parseStaticStringLiteral(src, valueStart)
		if ok {
			property.stringValue = value
			property.stringValueSet = true
		}
		return property, nil
	}

	if src[valueStart] != '{' {
		return property, nil
	}

	valueEnd, ok := findMatchingDelimiter(src, valueStart, '{', '}')
	if !ok {
		return extractObjectProperty{}, fmt.Errorf("unterminated object value at line %d", sourceLine(src, valueStart))
	}
	property.objectValue = valueStart
	property.objectValueEnd = valueEnd
	property.objectValueSet = true

	return property, nil
}

func readObjectPropertyKey(src string, index int) (string, int, bool) {
	if index >= len(src) {
		return "", index, false
	}
	if isStringQuote(src[index]) {
		value, next, ok := parseStaticStringLiteral(src, index)
		return value, next, ok
	}
	if !isIdentifierStart(src[index]) {
		return "", index, false
	}

	value, next := readIdentifier(src, index)

	return value, next, true
}

func skipValueExpression(src string, index, end int) int {
	depth := 0
	for i := index; i < end; {
		if next, ok := skipIgnoredToken(src, i); ok {
			i = next
			continue
		}

		switch src[i] {
		case '{', '[', '(':
			depth++
		case '}', ']', ')':
			if depth > 0 {
				depth--
			}
		case ',':
			if depth == 0 {
				return i + 1
			}
		}
		i++
	}

	return end
}

func extractReactIntlJSXMessages(src, file string) ([]extractMessage, error) {
	messages := make([]extractMessage, 0)
	for i := 0; i < len(src); {
		if next, ok := skipIgnoredToken(src, i); ok {
			i = next
			continue
		}
		if src[i] != '<' || i+1 >= len(src) || src[i+1] == '/' {
			i++
			continue
		}

		name, nameEnd, ok := readJSXElementName(src, i+1)
		if !ok || !isReactIntlJSXName(name) {
			i++
			continue
		}

		tagEnd, ok := findJSXTagEnd(src, nameEnd)
		if !ok {
			return nil, fmt.Errorf("unterminated JSX tag at line %d", sourceLine(src, i))
		}

		attrs, err := parseJSXAttributes(src, nameEnd, tagEnd)
		if err != nil {
			return nil, err
		}
		if id, ok := attrs["id"]; ok && strings.TrimSpace(id) != "" {
			messages = append(messages, extractMessage{
				ID:             id,
				DefaultMessage: attrs["defaultMessage"],
				Description:    attrs["description"],
				sourcePath:     file,
				sourcePos:      i,
			})
		}
		i = tagEnd + 1
	}

	return messages, nil
}

func isReactIntlJSXName(name string) bool {
	return name == "FormattedMessage" ||
		name == "FormattedHTMLMessage" ||
		strings.HasSuffix(name, ".FormattedMessage") ||
		strings.HasSuffix(name, ".FormattedHTMLMessage")
}

func readJSXElementName(src string, index int) (string, int, bool) {
	if index >= len(src) || !isJSXNameStart(src[index]) {
		return "", index, false
	}

	i := index + 1
	for i < len(src) && isJSXNamePart(src[i]) {
		i++
	}

	return src[index:i], i, true
}

func findJSXTagEnd(src string, index int) (int, bool) {
	braceDepth := 0
	for i := index; i < len(src); {
		if next, ok := skipJSXIgnoredToken(src, i); ok {
			i = next
			continue
		}

		switch src[i] {
		case '{':
			braceDepth++
		case '}':
			if braceDepth > 0 {
				braceDepth--
			}
		case '>':
			if braceDepth == 0 {
				return i, true
			}
		}
		i++
	}

	return 0, false
}

func parseJSXAttributes(src string, index, tagEnd int) (map[string]string, error) {
	attrs := make(map[string]string)
	for i := index; i < tagEnd; {
		i = skipWhitespaceAndComments(src, i)
		if i >= tagEnd || src[i] == '/' {
			break
		}

		name, next, ok := readJSXAttributeName(src, i)
		if !ok {
			i++
			continue
		}

		valueStart := skipWhitespaceAndComments(src, next)
		if valueStart >= tagEnd || src[valueStart] != '=' {
			i = valueStart
			continue
		}

		value, valueEnd, ok, err := parseJSXAttributeValue(src, skipWhitespaceAndComments(src, valueStart+1), tagEnd)
		if err != nil {
			return nil, err
		}
		if ok && isReactIntlMessageAttribute(name) {
			attrs[name] = value
		}
		i = valueEnd
	}

	return attrs, nil
}

func readJSXAttributeName(src string, index int) (string, int, bool) {
	if index >= len(src) || !isJSXNameStart(src[index]) {
		return "", index, false
	}

	i := index + 1
	for i < len(src) && isJSXAttributeNamePart(src[i]) {
		i++
	}

	return src[index:i], i, true
}

func parseJSXAttributeValue(src string, index, tagEnd int) (string, int, bool, error) {
	if index >= tagEnd {
		return "", index, false, nil
	}

	switch src[index] {
	case '\'', '"':
		end := skipQuotedJSXAttribute(src, index)
		if end > tagEnd {
			return "", index, false, fmt.Errorf("unterminated JSX attribute at line %d", sourceLine(src, index))
		}
		return html.UnescapeString(src[index+1 : end-1]), end, true, nil
	case '{':
		end, ok := findMatchingDelimiter(src, index, '{', '}')
		if !ok || end > tagEnd {
			return "", index, false, fmt.Errorf("unterminated JSX expression at line %d", sourceLine(src, index))
		}
		value, ok := parseStaticJSXExpression(src[index+1 : end])
		return value, end + 1, ok, nil
	default:
		return "", index + 1, false, nil
	}
}

func isReactIntlMessageAttribute(name string) bool {
	switch name {
	case "description", "defaultMessage", "id":
		return true
	default:
		return false
	}
}

func parseStaticJSXExpression(expr string) (string, bool) {
	trimmed := strings.TrimSpace(expr)
	if trimmed == "" || !isStringQuote(trimmed[0]) {
		return "", false
	}

	value, next, ok := parseStaticStringLiteral(trimmed, 0)
	if !ok || strings.TrimSpace(trimmed[next:]) != "" {
		return "", false
	}

	return value, true
}

func skipQuotedJSXAttribute(src string, index int) int {
	quote := src[index]
	i := index + 1
	for i < len(src) {
		if src[i] == quote {
			return i + 1
		}
		i++
	}

	return len(src) + 1
}

func skipJSXIgnoredToken(src string, index int) (int, bool) {
	if index >= len(src) {
		return index, false
	}
	if src[index] == '\'' || src[index] == '"' {
		return skipQuotedJSXAttribute(src, index), true
	}

	return skipIgnoredToken(src, index)
}

func isJSXNameStart(ch byte) bool {
	return isIdentifierStart(ch)
}

func isJSXNamePart(ch byte) bool {
	return isIdentifierPart(ch) || ch == '.' || ch == ':'
}

func isJSXAttributeNamePart(ch byte) bool {
	return isIdentifierPart(ch) || ch == '-' || ch == ':'
}

func parseStaticStringLiteral(src string, index int) (string, int, bool) {
	if index >= len(src) || !isStringQuote(src[index]) {
		return "", index, false
	}

	quote := src[index]
	raw, next, ok := readStringLiteralContent(src, index)
	if !ok {
		return "", next, false
	}
	if quote == '`' && strings.Contains(raw, "${") {
		return "", next, false
	}

	return unescapeJavaScriptString(raw), next, true
}

func readStringLiteralContent(src string, index int) (string, int, bool) {
	quote := src[index]
	var b strings.Builder
	for i := index + 1; i < len(src); i++ {
		if src[i] == '\\' {
			if i+1 >= len(src) {
				return b.String(), len(src), false
			}
			b.WriteByte(src[i])
			i++
			b.WriteByte(src[i])
			continue
		}
		if src[i] == quote {
			return b.String(), i + 1, true
		}
		b.WriteByte(src[i])
	}

	return b.String(), len(src), false
}

func unescapeJavaScriptString(raw string) string {
	var b strings.Builder
	for i := 0; i < len(raw); i++ {
		if raw[i] != '\\' || i+1 >= len(raw) {
			b.WriteByte(raw[i])
			continue
		}

		i++
		i = writeJavaScriptEscape(&b, raw, i)
	}

	return b.String()
}

func writeJavaScriptEscape(b *strings.Builder, raw string, index int) int {
	switch raw[index] {
	case '\n', '\r':
		return index
	case '"', '\'', '\\', '`':
		b.WriteByte(raw[index])
	case 'b':
		b.WriteByte('\b')
	case 'f':
		b.WriteByte('\f')
	case 'n':
		b.WriteByte('\n')
	case 'r':
		b.WriteByte('\r')
	case 't':
		b.WriteByte('\t')
	case 'u':
		return writeUnicodeEscape(b, raw, index)
	case 'v':
		b.WriteByte('\v')
	case 'x':
		return writeHexEscape(b, raw, index)
	default:
		b.WriteByte(raw[index])
	}

	return index
}

func writeUnicodeEscape(b *strings.Builder, raw string, index int) int {
	if index+1 < len(raw) && raw[index+1] == '{' {
		end := strings.IndexByte(raw[index+2:], '}')
		if end >= 0 {
			hex := raw[index+2 : index+2+end]
			if value, err := strconv.ParseInt(hex, 16, 32); err == nil {
				b.WriteRune(rune(value))
				return index + 2 + end
			}
		}
	}
	if index+4 < len(raw) {
		hex := raw[index+1 : index+5]
		if value, err := strconv.ParseInt(hex, 16, 32); err == nil {
			b.WriteRune(rune(value))
			return index + 4
		}
	}

	b.WriteByte(raw[index])

	return index
}

func writeHexEscape(b *strings.Builder, raw string, index int) int {
	if index+2 < len(raw) {
		hex := raw[index+1 : index+3]
		if value, err := strconv.ParseUint(hex, 16, 8); err == nil {
			b.WriteByte(byte(value))
			return index + 2
		}
	}

	b.WriteByte(raw[index])

	return index
}

func findMatchingDelimiter(src string, open int, openCh, closeCh byte) (int, bool) {
	depth := 0
	for i := open; i < len(src); {
		if next, ok := skipIgnoredToken(src, i); ok {
			i = next
			continue
		}

		switch src[i] {
		case openCh:
			depth++
		case closeCh:
			depth--
			if depth == 0 {
				return i, true
			}
		}
		i++
	}

	return 0, false
}

func findTypeArgumentEnd(src string, open int) (int, bool) {
	depth := 0
	for i := open; i < len(src); {
		if next, ok := skipIgnoredToken(src, i); ok {
			i = next
			continue
		}

		switch src[i] {
		case '<':
			depth++
		case '>':
			depth--
			if depth == 0 {
				return i, true
			}
		}
		i++
	}

	return 0, false
}

func skipIgnoredToken(src string, index int) (int, bool) {
	if index >= len(src) {
		return index, false
	}

	switch src[index] {
	case '\'', '"', '`':
		return skipStringLiteral(src, index), true
	case '/':
		return skipComment(src, index)
	default:
		return index, false
	}
}

func skipStringLiteral(src string, index int) int {
	quote := src[index]
	for i := index + 1; i < len(src); i++ {
		if src[i] == '\\' {
			i++
			continue
		}
		if src[i] == quote {
			return i + 1
		}
	}

	return len(src)
}

func skipComment(src string, index int) (int, bool) {
	if index+1 >= len(src) {
		return index, false
	}

	switch src[index+1] {
	case '/':
		end := strings.IndexByte(src[index+2:], '\n')
		if end < 0 {
			return len(src), true
		}
		return index + 2 + end + 1, true
	case '*':
		end := strings.Index(src[index+2:], "*/")
		if end < 0 {
			return len(src), true
		}
		return index + 2 + end + 2, true
	default:
		return index, false
	}
}

func skipWhitespaceAndComments(src string, index int) int {
	for i := index; i < len(src); {
		for i < len(src) && unicode.IsSpace(rune(src[i])) {
			i++
		}

		next, ok := skipComment(src, i)
		if !ok {
			return i
		}
		i = next
	}

	return len(src)
}

func readIdentifier(src string, index int) (string, int) {
	if index >= len(src) || !isIdentifierStart(src[index]) {
		return "", index
	}

	i := index + 1
	for i < len(src) && isIdentifierPart(src[i]) {
		i++
	}

	return src[index:i], i
}

func isIdentifierStart(ch byte) bool {
	return ch == '_' || ch == '$' || ('A' <= ch && ch <= 'Z') || ('a' <= ch && ch <= 'z')
}

func isIdentifierPart(ch byte) bool {
	return isIdentifierStart(ch) || ('0' <= ch && ch <= '9')
}

func isStringQuote(ch byte) bool {
	return ch == '\'' || ch == '"' || ch == '`'
}

func sourceLine(src string, index int) int {
	if index > len(src) {
		index = len(src)
	}

	return strings.Count(src[:index], "\n") + 1
}

func normalizedExtractFilename(path string) string {
	normalizedPath := path
	if wd, err := os.Getwd(); err == nil {
		if rel, err := filepath.Rel(wd, path); err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			normalizedPath = rel
		}
	}

	withoutExt := strings.TrimSuffix(filepath.ToSlash(normalizedPath), filepath.Ext(normalizedPath))
	segments := strings.Split(withoutExt, "/")
	normalized := make([]string, 0, len(segments))
	for _, segment := range segments {
		if part := normalizeExtractFilenameSegment(segment); part != "" {
			normalized = append(normalized, part)
		}
	}
	if len(normalized) == 0 {
		return "message"
	}

	return strings.Join(normalized, ".")
}

func normalizeExtractFilenameSegment(segment string) string {
	trimmed := strings.Trim(segment, "._- ")
	var b strings.Builder
	var previousWasSeparator bool
	var previousWasLowerOrDigit bool

	for i, r := range trimmed {
		if unicode.IsUpper(r) {
			if i > 0 && previousWasLowerOrDigit && !previousWasSeparator {
				b.WriteByte('-')
			}
			b.WriteRune(unicode.ToLower(r))
			previousWasSeparator = false
			previousWasLowerOrDigit = false
			continue
		}

		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(unicode.ToLower(r))
			previousWasSeparator = false
			previousWasLowerOrDigit = unicode.IsLower(r) || unicode.IsDigit(r)
			continue
		}

		if b.Len() > 0 && !previousWasSeparator {
			b.WriteByte('-')
			previousWasSeparator = true
		}
		previousWasLowerOrDigit = false
	}

	return strings.Trim(b.String(), "-")
}
