package main

import (
	"bytes"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

type publicTranslationObject struct {
	keys   []string
	values map[string]string
}

func newPublicTranslationObject() *publicTranslationObject {
	return &publicTranslationObject{values: map[string]string{}}
}

func (o *publicTranslationObject) set(key, value string) {
	if key == "__proto__" {
		return
	}
	if _, ok := o.values[key]; !ok {
		o.keys = append(o.keys, key)
	}
	o.values[key] = value
}

func (o *publicTranslationObject) orderedKeys() []string {
	var indexes, names []string
	for _, key := range o.keys {
		if _, ok := javascriptArrayIndex(key); ok {
			indexes = append(indexes, key)
		} else {
			names = append(names, key)
		}
	}
	sort.Slice(indexes, func(i, j int) bool {
		a, _ := javascriptArrayIndex(indexes[i])
		b, _ := javascriptArrayIndex(indexes[j])
		return a < b
	})
	return append(indexes, names...)
}

func javascriptArrayIndex(key string) (uint64, bool) {
	if key == "" || len(key) > 10 || (len(key) > 1 && key[0] == '0') {
		return 0, false
	}
	for i := 0; i < len(key); i++ {
		if key[i] < '0' || key[i] > '9' {
			return 0, false
		}
	}
	value, err := strconv.ParseUint(key, 10, 64)
	if err != nil || value > 4294967294 {
		return 0, false
	}
	return value, true
}

func (o *publicTranslationObject) marshal() []byte {
	keys := o.orderedKeys()
	var buf bytes.Buffer
	if len(keys) == 0 {
		buf.WriteString("{}\n")
		return buf.Bytes()
	}
	buf.WriteString("{\n")
	for i, key := range keys {
		buf.WriteString("  ")
		writeJavaScriptJSONString(&buf, key)
		buf.WriteString(": ")
		writeJavaScriptJSONString(&buf, o.values[key])
		if i < len(keys)-1 {
			buf.WriteByte(',')
		}
		buf.WriteByte('\n')
	}
	buf.WriteString("}\n")
	return buf.Bytes()
}

func writeJavaScriptJSONString(buf *bytes.Buffer, value string) {
	const hex = "0123456789abcdef"
	buf.WriteByte('"')
	for i := 0; i < len(value); i++ {
		c := value[i]
		switch c {
		case '"':
			buf.WriteString(`\"`)
		case '\\':
			buf.WriteString(`\\`)
		case '\b':
			buf.WriteString(`\b`)
		case '\f':
			buf.WriteString(`\f`)
		case '\n':
			buf.WriteString(`\n`)
		case '\r':
			buf.WriteString(`\r`)
		case '\t':
			buf.WriteString(`\t`)
		default:
			if c < 0x20 {
				buf.WriteString(`\u00`)
				buf.WriteByte(hex[c>>4])
				buf.WriteByte(hex[c&0xf])
			} else {
				buf.WriteByte(c)
			}
		}
	}
	buf.WriteByte('"')
}

func nodePathExtname(path string) string {
	startDot, startPart, end := -1, 0, -1
	matchedSlash := true
	preDotState := 0
	for i := len(path) - 1; i >= 0; i-- {
		c := path[i]
		if c == '/' {
			if !matchedSlash {
				startPart = i + 1
				break
			}
			continue
		}
		if end == -1 {
			matchedSlash = false
			end = i + 1
		}
		if c == '.' {
			if startDot == -1 {
				startDot = i
			} else if preDotState != 1 {
				preDotState = 1
			}
		} else if startDot != -1 {
			preDotState = -1
		}
	}
	if startDot == -1 || end == -1 || preDotState == 0 ||
		(preDotState == 1 && startDot == end-1 && startDot == startPart+1) {
		return ""
	}
	return path[startDot:end]
}

func nodePathBasename(path, suffix string) string {
	start, end := 0, -1
	matchedSlash := true
	if suffix != "" && len(suffix) <= len(path) {
		if suffix == path {
			return ""
		}
		extIdx := len(suffix) - 1
		firstNonSlashEnd := -1
		for i := len(path) - 1; i >= 0; i-- {
			c := path[i]
			if c == '/' {
				if !matchedSlash {
					start = i + 1
					break
				}
				continue
			}
			if firstNonSlashEnd == -1 {
				matchedSlash = false
				firstNonSlashEnd = i + 1
			}
			if extIdx >= 0 {
				if c == suffix[extIdx] {
					extIdx--
					if extIdx == -1 {
						end = i
					}
				} else {
					extIdx = -1
					end = firstNonSlashEnd
				}
			}
		}
		if start == end {
			end = firstNonSlashEnd
		} else if end == -1 {
			end = len(path)
		}
		return path[start:end]
	}
	for i := len(path) - 1; i >= 0; i-- {
		if path[i] == '/' {
			if !matchedSlash {
				start = i + 1
				break
			}
		} else if end == -1 {
			matchedSlash = false
			end = i + 1
		}
	}
	if end == -1 {
		return ""
	}
	return path[start:end]
}

func publicTranslationFilename(sourcePath, locale string) string {
	extension := nodePathExtname(sourcePath)
	baseName := nodePathBasename(sourcePath, extension)
	suffix := baseName
	if !strings.HasSuffix(baseName, "-"+locale) {
		suffix = baseName + "-" + locale
	}
	if extension != "" {
		return suffix + extension
	}
	return suffix + ".json"
}

func encodeURIComponent(value string) string {
	const hex = "0123456789ABCDEF"
	var b strings.Builder
	for i := 0; i < len(value); i++ {
		c := value[i]
		if c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' ||
			strings.IndexByte("-_.!~*'()", c) >= 0 {
			b.WriteByte(c)
			continue
		}
		b.WriteByte('%')
		b.WriteByte(hex[c>>4])
		b.WriteByte(hex[c&0xf])
	}
	return b.String()
}

func publicTranslationContentDisposition(filename string) string {
	return "attachment; filename*=UTF-8''" + encodeURIComponent(filename)
}

var lottieTextKeyPattern = regexp.MustCompile(`^(?:layers|assets\[\d+\]\.layers)\[\d+\]\.t\.d\.k\[\d+\]\.s\.t$`)

func isLottieTranslationSource(sourcePath string, keys []string) bool {
	dot := strings.LastIndexByte(sourcePath, '.')
	if dot == -1 {
		return false
	}
	switch strings.ToLower(sourcePath[dot:]) {
	case ".lottie":
		return true
	case ".json":
		if len(keys) == 0 {
			return false
		}
		for _, key := range keys {
			if !lottieTextKeyPattern.MatchString(key) {
				return false
			}
		}
		return true
	default:
		return false
	}
}
