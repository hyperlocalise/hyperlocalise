package icuparser

import (
	"fmt"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

func Parse(input string, opts *ParseOptions) ([]Element, error) {
	if opts == nil {
		opts = &ParseOptions{}
	}
	p := astParser{
		src:  input,
		opts: *opts,
	}
	elems, err := p.parseMessage(parseCtx{}, false)
	if err != nil {
		return nil, err
	}
	return elems, nil
}

type parseCtx struct {
	inPlural bool
}

type astParser struct {
	src  string
	pos  int
	opts ParseOptions
}

func (p *astParser) parseMessage(ctx parseCtx, untilBrace bool) ([]Element, error) {
	// BOLT OPTIMIZATION: Initial capacity hint to minimize re-allocations.
	out := make([]Element, 0, 4)
	var text strings.Builder
	// BOLT OPTIMIZATION: Track lastPos to allow slicing p.src for literal text
	// when no unescaping is required, avoiding strings.Builder overhead.
	lastPos := p.pos

	flushText := func() {
		if text.Len() > 0 {
			if p.pos > lastPos {
				text.WriteString(p.src[lastPos:p.pos])
			}
			out = append(out, LiteralElement{Value: text.String()})
			text.Reset()
			lastPos = p.pos
		} else if p.pos > lastPos {
			out = append(out, LiteralElement{Value: p.src[lastPos:p.pos]})
			lastPos = p.pos
		}
	}

	for p.pos < len(p.src) {
		// BOLT OPTIMIZATION: Literal text chunking using strings.IndexAny to skip
		// ahead to the next special character.
		idx := strings.IndexAny(p.src[p.pos:], "{#<}'}")
		if idx == -1 {
			p.pos = len(p.src)
			break
		}
		p.pos += idx

		switch p.src[p.pos] {
		case '{':
			flushText()
			el, err := p.parseArgumentLike(ctx)
			if err != nil {
				return nil, err
			}
			out = append(out, el)
			lastPos = p.pos
		case '}':
			if !untilBrace {
				return nil, fmt.Errorf("unexpected closing brace at %d", p.pos)
			}
			flushText()
			return out, nil
		case '#':
			if !ctx.inPlural {
				// Hash in non-plural context is just text.
				p.pos++
			} else {
				flushText()
				out = append(out, PoundElement{})
				p.pos++
				lastPos = p.pos
			}
		case '<':
			if p.opts.IgnoreTag {
				p.pos++
			} else {
				flushText()
				tag, ok, err := p.tryParseTag(ctx)
				if err != nil {
					return nil, err
				}
				if ok {
					out = append(out, tag)
					lastPos = p.pos
				} else {
					p.pos++
				}
			}
		case '\'':
			if p.startsQuotedLiteral() {
				// Quoted literal starts; we need the builder to unescape it.
				// First, flush any pending pure literal text into the builder.
				if p.pos > lastPos {
					text.WriteString(p.src[lastPos:p.pos])
				}
				p.consumeQuotedInto(&text)
				lastPos = p.pos
			} else {
				// Lone apostrophe is just text.
				p.pos++
			}
		default:
			// Should not be reached due to IndexAny, but for safety:
			p.pos++
		}
	}

	flushText()
	if untilBrace {
		return nil, fmt.Errorf("unclosed brace at %d", p.pos)
	}
	return out, nil
}


func (p *astParser) parseArgumentLike(ctx parseCtx) (Element, error) {
	if !p.consume('{') {
		return nil, fmt.Errorf("expected '{' at %d", p.pos)
	}
	p.skipSpaces()
	arg, ok := p.readIdentifierLike()
	if !ok {
		return nil, fmt.Errorf("expected argument name at %d", p.pos)
	}
	p.skipSpaces()
	if p.consume('}') {
		return ArgumentElement{Value: arg}, nil
	}
	if !p.consume(',') {
		return nil, fmt.Errorf("expected ',' or '}' at %d", p.pos)
	}
	p.skipSpaces()
	kind, ok := p.readIdentifierLike()
	if !ok {
		return nil, fmt.Errorf("expected format type at %d", p.pos)
	}
	// BOLT OPTIMIZATION: readIdentifierLike results are already trimmed.
	kind = strings.ToLower(kind)
	p.skipSpaces()

	if kind == "number" || kind == "date" || kind == "time" {
		return p.parseSimpleTypedArgument(arg, kind)
	}
	if kind == "select" {
		return p.parseSelectArgument(arg, ctx)
	}
	if kind == "plural" || kind == "selectordinal" {
		return p.parsePluralArgument(arg, kind)
	}

	return p.parseCustomArgument(arg)
}

func (p *astParser) parseSimpleTypedArgument(arg, kind string) (Element, error) {
	style, err := p.parseSimpleStyle()
	if err != nil {
		return nil, err
	}

	switch kind {
	case "number":
		return p.finishNumberElement(arg, style)
	case "date":
		return p.finishDateElement(arg, style)
	default:
		return p.finishTimeElement(arg, style)
	}
}

func (p *astParser) finishNumberElement(arg, style string) (Element, error) {
	if !strings.HasPrefix(style, "::") {
		return NumberElement{Value: arg, Style: style}, nil
	}
	body := strings.TrimSpace(style[2:])
	tokens, err := ParseNumberSkeletonTokens(body)
	if err != nil {
		return nil, err
	}
	var parsed NumberFormatOptions
	if p.opts.ShouldParseSkeletons {
		parsed, err = ParseNumberSkeleton(tokens)
		if err != nil {
			return nil, err
		}
	}
	return NumberElement{
		Value:    arg,
		Style:    style,
		Skeleton: &NumberSkeleton{Tokens: tokens, ParsedOptions: parsed},
	}, nil
}

func (p *astParser) finishDateElement(arg, style string) (Element, error) {
	if !strings.HasPrefix(style, "::") {
		return DateElement{Value: arg, Style: style}, nil
	}
	body := strings.TrimSpace(style[2:])
	if body == "" {
		return nil, fmt.Errorf("date/time skeleton cannot be empty")
	}
	pattern := body
	var parsed DateTimeFormatOptions
	if p.opts.ShouldParseSkeletons {
		var err error
		parsed, err = ParseDateTimeSkeleton(pattern)
		if err != nil {
			return nil, err
		}
	}
	return DateElement{
		Value: arg,
		Style: style,
		Skeleton: &DateTimeSkeleton{
			Pattern:       pattern,
			ParsedOptions: parsed,
		},
	}, nil
}

func (p *astParser) finishTimeElement(arg, style string) (Element, error) {
	if !strings.HasPrefix(style, "::") {
		return TimeElement{Value: arg, Style: style}, nil
	}
	body := strings.TrimSpace(style[2:])
	if body == "" {
		return nil, fmt.Errorf("date/time skeleton cannot be empty")
	}
	pattern := body
	var parsed DateTimeFormatOptions
	if p.opts.ShouldParseSkeletons {
		var err error
		parsed, err = ParseDateTimeSkeleton(pattern)
		if err != nil {
			return nil, err
		}
	}
	return TimeElement{
		Value: arg,
		Style: style,
		Skeleton: &DateTimeSkeleton{
			Pattern:       pattern,
			ParsedOptions: parsed,
		},
	}, nil
}

func (p *astParser) parseSelectArgument(arg string, ctx parseCtx) (Element, error) {
	if !p.consume(',') {
		return nil, fmt.Errorf("expected ',' before select options at %d", p.pos)
	}
	p.skipSpaces()
	opts, err := p.parseSelectOptions(ctx)
	if err != nil {
		return nil, err
	}
	// parseSelectOptions returns with pos at the closing "}" of the select argument.
	p.pos++
	return SelectElement{Value: arg, Options: opts}, nil
}

func (p *astParser) parsePluralArgument(arg, kind string) (Element, error) {
	if !p.consume(',') {
		return nil, fmt.Errorf("expected ',' before plural options at %d", p.pos)
	}
	p.skipSpaces()
	offset, opts, err := p.parsePluralOptions()
	if err != nil {
		return nil, err
	}
	// parsePluralOptions returns with pos at the closing "}" of the plural argument.
	p.pos++
	ordinal := kind == "selectordinal"
	pluralType := TypePlural
	if ordinal {
		pluralType = TypeSelectOrdinal
	}

	return PluralElement{
		Value:      arg,
		Options:    opts,
		Offset:     offset,
		Ordinal:    ordinal,
		PluralType: pluralType,
	}, nil
}

func (p *astParser) parseCustomArgument(arg string) (Element, error) {
	// Generic formatter/custom format. Preserve style text but don't parse skeletons yet.
	if _, err := p.parseSimpleStyle(); err != nil {
		return nil, err
	}
	return ArgumentElement{Value: arg}, nil
}

func (p *astParser) parseSimpleStyle() (string, error) {
	if p.consume('}') {
		return "", nil
	}
	if !p.consume(',') {
		return "", fmt.Errorf("expected ',' or '}' at %d", p.pos)
	}
	start := p.pos
	depth := 0
	for p.pos < len(p.src) {
		switch p.src[p.pos] {
		case '{':
			depth++
			p.pos++
		case '}':
			if depth == 0 {
				style := strings.TrimSpace(p.src[start:p.pos])
				p.pos++ // consume closing brace
				return style, nil
			}
			depth--
			p.pos++
		case '\'':
			p.skipQuotedLiteral()
		default:
			p.pos++
		}
	}
	return "", fmt.Errorf("unclosed simple formatter style")
}

func (p *astParser) parseSelectOptions(ctx parseCtx) ([]SelectOption, error) {
	// BOLT OPTIMIZATION: Heuristic capacity hint (usually 2+ options).
	out := make([]SelectOption, 0, 2)
	for {
		if p.pos >= len(p.src) {
			return nil, fmt.Errorf("unclosed brace at %d", p.pos)
		}
		p.skipSpaces()
		if p.peek() == '}' {
			if len(out) == 0 {
				return nil, fmt.Errorf("select argument missing options at %d", p.pos)
			}
			return out, nil
		}
		sel, ok := p.readSelector()
		if !ok {
			return nil, fmt.Errorf("expected select selector at %d", p.pos)
		}
		p.skipSpaces()
		if !p.consume('{') {
			return nil, fmt.Errorf("expected select option body at %d", p.pos)
		}
		body, err := p.parseMessage(ctx, true)
		if err != nil {
			return nil, err
		}
		// parseMessage(..., true) returns with pos at the closing "}" of the option body.
		p.pos++
		out = append(out, SelectOption{Selector: sel, Value: body})
	}
}

func (p *astParser) parsePluralOptions() (int, []PluralOption, error) {
	offset := 0
	// BOLT OPTIMIZATION: Heuristic capacity hint (usually 2+ options).
	out := make([]PluralOption, 0, 2)
	for {
		if p.pos >= len(p.src) {
			return 0, nil, fmt.Errorf("unclosed brace at %d", p.pos)
		}
		p.skipSpaces()
		if p.peek() == '}' {
			if len(out) == 0 {
				return 0, nil, fmt.Errorf("ICU argument missing options at %d", p.pos)
			}
			return offset, out, nil
		}
		sel, ok := p.readSelector()
		if !ok {
			return 0, nil, fmt.Errorf("expected ICU selector at %d", p.pos)
		}
		p.skipSpaces()
		// BOLT OPTIMIZATION: Quick check for 'o' or 'O' to avoid strings.EqualFold for most selectors.
		if (sel[0] == 'o' || sel[0] == 'O') && (strings.EqualFold(sel, "offset") || (len(sel) >= 7 && strings.EqualFold(sel[:7], "offset:"))) {
			var val string
			if strings.EqualFold(sel, "offset") {
				p.skipSpaces()
				if !p.consume(':') {
					return 0, nil, fmt.Errorf("expected ':' after offset keyword at %d", p.pos)
				}
				p.skipSpaces()
				var err error
				val, err = p.readOffsetNumber()
				if err != nil {
					return 0, nil, err
				}
			} else {
				// sel is "offset:..."
				val = sel[7:]
				if val == "" {
					var err error
					val, err = p.readOffsetNumber()
					if err != nil {
						return 0, nil, err
					}
				}
			}
			n, err := strconv.Atoi(val)
			if err != nil {
				return 0, nil, fmt.Errorf("invalid plural offset %q", val)
			}
			offset = n
			continue
		}
		if !p.consume('{') {
			return 0, nil, fmt.Errorf("expected ICU option body at %d", p.pos)
		}
		body, err := p.parseMessage(parseCtx{inPlural: true}, true)
		if err != nil {
			return 0, nil, err
		}
		// parseMessage(..., true) returns with pos at the closing "}" of the option body.
		p.pos++
		out = append(out, PluralOption{Selector: sel, Value: body})
	}
}

func (p *astParser) tryParseTag(ctx parseCtx) (TagElement, bool, error) {
	start := p.pos
	if !p.consume('<') {
		return TagElement{}, false, nil
	}
	if p.peek() == '/' || p.peek() == '!' || p.peek() == '?' {
		p.pos = start
		return TagElement{}, false, nil
	}
	name, ok := p.readTagName()
	if !ok {
		p.pos = start
		return TagElement{}, false, nil
	}

	// Skip attributes until we find the end of the opening tag.
	for p.pos < len(p.src) {
		ch := p.src[p.pos]
		if ch == '"' || ch == '\'' {
			p.skipTagAttributeQuotedLiteral(ch)
			continue
		}
		if p.consume('/') {
			p.skipSpaces()
			if p.consume('>') {
				return TagElement{Value: name, SelfClosing: true}, true, nil
			}
			continue
		}
		if p.consume('>') {
			children, err := p.parseUntilClosingTag(name, ctx)
			if err != nil {
				return TagElement{}, false, err
			}
			return TagElement{Value: name, Children: children}, true, nil
		}
		p.pos++
	}

	return TagElement{}, false, fmt.Errorf("unclosed opening tag %q at %d", name, start)
}

func (p *astParser) skipTagAttributeQuotedLiteral(quote byte) {
	p.pos++ // opening quote
	// BOLT OPTIMIZATION: Use strings.IndexByte to skip non-quote characters.
	idx := strings.IndexByte(p.src[p.pos:], quote)
	if idx < 0 {
		p.pos = len(p.src)
		return
	}
	p.pos += idx + 1
}

func (p *astParser) parseUntilClosingTag(name string, ctx parseCtx) ([]Element, error) {
	// BOLT OPTIMIZATION: Initial capacity hint.
	out := make([]Element, 0, 4)
	var text strings.Builder
	// BOLT OPTIMIZATION: Track lastPos to allow slicing p.src for literal text.
	lastPos := p.pos

	flushText := func() {
		if text.Len() > 0 {
			if p.pos > lastPos {
				text.WriteString(p.src[lastPos:p.pos])
			}
			out = append(out, LiteralElement{Value: text.String()})
			text.Reset()
			lastPos = p.pos
		} else if p.pos > lastPos {
			out = append(out, LiteralElement{Value: p.src[lastPos:p.pos]})
			lastPos = p.pos
		}
	}

	for p.pos < len(p.src) {
		// BOLT OPTIMIZATION: Literal text chunking.
		idx := strings.IndexAny(p.src[p.pos:], "{#<}'}")
		if idx == -1 {
			p.pos = len(p.src)
			break
		}
		p.pos += idx

		if strings.HasPrefix(p.src[p.pos:], "</") {
			flushText()
			save := p.pos
			p.pos += 2
			closeName, ok := p.readTagName()
			if ok {
				p.skipSpaces()
				if !p.consume('>') {
					return nil, fmt.Errorf("expected closing '>' for tag %q", closeName)
				}
				if closeName != name {
					return nil, fmt.Errorf("mismatched closing tag: got %q want %q", closeName, name)
				}
				return out, nil
			}
			p.pos = save
		}

		switch p.peek() {
		case '{':
			flushText()
			el, err := p.parseArgumentLike(ctx)
			if err != nil {
				return nil, err
			}
			out = append(out, el)
			lastPos = p.pos
		case '}':
			return nil, fmt.Errorf("unexpected closing brace at %d", p.pos)
		case '#':
			if !ctx.inPlural {
				p.pos++
			} else {
				flushText()
				out = append(out, PoundElement{})
				p.pos++
				lastPos = p.pos
			}
		case '<':
			if p.opts.IgnoreTag {
				p.pos++
			} else {
				flushText()
				tag, ok, err := p.tryParseTag(ctx)
				if err != nil {
					return nil, err
				}
				if ok {
					out = append(out, tag)
					lastPos = p.pos
				} else {
					p.pos++
				}
			}
		case '\'':
			if p.startsQuotedLiteral() {
				if p.pos > lastPos {
					text.WriteString(p.src[lastPos:p.pos])
				}
				p.consumeQuotedInto(&text)
				lastPos = p.pos
			} else {
				p.pos++
			}
		default:
			p.pos++
		}
	}
	return nil, fmt.Errorf("unclosed tag %q", name)
}



func (p *astParser) startsQuotedLiteral() bool {
	if p.pos >= len(p.src) || p.src[p.pos] != '\'' || p.pos+1 >= len(p.src) {
		return false
	}
	switch p.src[p.pos+1] {
	case '\'', '{', '}', '<', '>', '#':
		return true
	default:
		return false
	}
}

func (p *astParser) consumeQuotedInto(b *strings.Builder) {
	p.pos++ // opening '
	if p.pos < len(p.src) && p.src[p.pos] == '\'' {
		b.WriteByte('\'')
		p.pos++
		return
	}

	for p.pos < len(p.src) {
		// BOLT OPTIMIZATION: Use strings.IndexByte to skip non-quote characters.
		idx := strings.IndexByte(p.src[p.pos:], '\'')
		if idx == -1 {
			b.WriteString(p.src[p.pos:])
			p.pos = len(p.src)
			break
		}
		if idx > 0 {
			b.WriteString(p.src[p.pos : p.pos+idx])
			p.pos += idx
		}

		// idx is at an apostrophe.
		if p.pos+1 < len(p.src) && p.src[p.pos+1] == '\'' {
			b.WriteByte('\'')
			p.pos += 2
			continue
		}
		p.pos++
		return
	}
}

func (p *astParser) skipSpaces() {
	for p.pos < len(p.src) {
		// BOLT OPTIMIZATION: Fast-path for common ASCII whitespace to avoid
		// utf8.DecodeRuneInString and unicode.IsSpace calls.
		ch := p.src[p.pos]
		if ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r' || ch == '\v' || ch == '\f' {
			p.pos++
			continue
		}
		if ch < 0x80 {
			break
		}

		r, w := utf8.DecodeRuneInString(p.src[p.pos:])
		if !unicode.IsSpace(r) {
			break
		}
		p.pos += w
	}
}

func (p *astParser) consume(ch byte) bool {
	if p.pos < len(p.src) && p.src[p.pos] == ch {
		p.pos++
		return true
	}
	return false
}

func (p *astParser) peek() byte {
	if p.pos >= len(p.src) {
		return 0
	}
	return p.src[p.pos]
}

func (p *astParser) readIdentifierLike() (string, bool) {
	start := p.pos
	for p.pos < len(p.src) {
		// BOLT OPTIMIZATION: Fast-path for ASCII to avoid utf8 decoding and unicode checks.
		ch := p.src[p.pos]
		if ch < 0x80 {
			if ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r' || ch == '\v' || ch == '\f' || ch == ',' || ch == '{' || ch == '}' {
				break
			}
			p.pos++
			continue
		}

		r, w := utf8.DecodeRuneInString(p.src[p.pos:])
		if unicode.IsSpace(r) || r == ',' || r == '{' || r == '}' {
			break
		}
		p.pos += w
	}
	if p.pos == start {
		return "", false
	}
	// BOLT OPTIMIZATION: Internal callers (parseArgumentLike, parseSelectOptions, parsePluralOptions)
	// always call skipSpaces() before, and we break on whitespace, so TrimSpace is redundant.
	return p.src[start:p.pos], true
}

func (p *astParser) readOffsetNumber() (string, error) {
	numStart := p.pos
	if p.pos < len(p.src) && p.src[p.pos] == '-' {
		p.pos++
	}
	digitStart := p.pos
	for p.pos < len(p.src) && isASCIIDigit(p.src[p.pos]) {
		p.pos++
	}
	if p.pos == digitStart {
		return "", fmt.Errorf("expected offset number at %d", p.pos)
	}
	return p.src[numStart:p.pos], nil
}

func (p *astParser) readSelector() (string, bool) {
	start := p.pos
	if p.pos < len(p.src) && p.src[p.pos] == '=' {
		p.pos++
		if p.pos < len(p.src) && p.src[p.pos] == '-' {
			p.pos++
		}
		digitStart := p.pos
		for p.pos < len(p.src) && isASCIIDigit(p.src[p.pos]) {
			p.pos++
		}
		// BOLT OPTIMIZATION: break on first non-digit, no TrimSpace needed.
		// Valid selector must have at least one digit after = or =-.
		return p.src[start:p.pos], p.pos > digitStart
	}
	for p.pos < len(p.src) {
		// BOLT OPTIMIZATION: Fast-path for ASCII to avoid utf8 decoding and unicode checks.
		ch := p.src[p.pos]
		if ch < 0x80 {
			if ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r' || ch == '\v' || ch == '\f' || ch == '{' || ch == '}' || ch == ',' {
				break
			}
			p.pos++
			continue
		}

		r, w := utf8.DecodeRuneInString(p.src[p.pos:])
		if unicode.IsSpace(r) || r == '{' || r == '}' || r == ',' {
			break
		}
		p.pos += w
	}
	if p.pos == start {
		return "", false
	}
	// BOLT OPTIMIZATION: break on first whitespace or delimiter, no TrimSpace needed.
	return p.src[start:p.pos], true
}

func (p *astParser) readTagName() (string, bool) {
	if p.pos >= len(p.src) {
		return "", false
	}
	// Tag names must start with a letter.
	ch := p.src[p.pos]
	if (ch < 'a' || ch > 'z') && (ch < 'A' || ch > 'Z') {
		return "", false
	}

	start := p.pos
	p.pos++
	for p.pos < len(p.src) {
		ch := p.src[p.pos]
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '_' || ch == '-' || ch == '.' || ch == ':' {
			p.pos++
			continue
		}
		break
	}
	return p.src[start:p.pos], true
}

func (p *astParser) skipQuotedLiteral() {
	p.pos++
	for p.pos < len(p.src) {
		// BOLT OPTIMIZATION: Use strings.IndexByte to skip non-quote characters.
		idx := strings.IndexByte(p.src[p.pos:], '\'')
		if idx == -1 {
			p.pos = len(p.src)
			break
		}
		p.pos += idx

		// p.pos is at an apostrophe.
		if p.pos+1 < len(p.src) && p.src[p.pos+1] == '\'' {
			p.pos += 2
			continue
		}
		p.pos++
		return
	}
}
