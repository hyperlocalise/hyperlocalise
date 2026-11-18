package cmd

import (
	"bytes"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

// checkFileCache memoizes file reads, parsed documents, and line indexes for one check run, so
// each file is read and parsed once no matter how many locales or findings refer to it.
// It is safe for concurrent use.
type checkFileCache struct {
	// files maps path -> *checkCachedFile. Workers mostly hit the same few files, so a sync.Map
	// avoids contending on one mutex for every lookup.
	files sync.Map
}

type checkCachedFile struct {
	path string

	loadOnce sync.Once
	content  []byte
	err      error

	lineIndexOnce sync.Once
	lineStarts    []int
	quotedLines   map[string]int

	// markdownDocs is indexed by the mdx flag (0 = markdown, 1 = MDX).
	markdownDocs [2]struct {
		once sync.Once
		doc  *translationfileparser.ParsedMarkdownDocument
	}
	asciiDocOnce sync.Once
	asciiDoc     *translationfileparser.ParsedAsciiDocDocument

	docKeyLinesOnce sync.Once
	docKeyLines     map[string]int

	valueLinesMu sync.Mutex
	valueLines   map[string]int
}

func newCheckFileCache() *checkFileCache {
	return &checkFileCache{}
}

func (c *checkFileCache) file(path string) *checkCachedFile {
	if f, ok := c.files.Load(path); ok {
		return f.(*checkCachedFile)
	}
	f, _ := c.files.LoadOrStore(path, &checkCachedFile{path: path})
	return f.(*checkCachedFile)
}

func (c *checkFileCache) read(path string) ([]byte, error) {
	return c.file(path).read()
}

func (c *checkFileCache) markdownDocument(path string, mdx bool) (*translationfileparser.ParsedMarkdownDocument, error) {
	return c.file(path).markdownDocument(mdx)
}

func (c *checkFileCache) asciiDocDocument(path string) (*translationfileparser.ParsedAsciiDocDocument, error) {
	return c.file(path).asciiDocDocument()
}

func (f *checkCachedFile) read() ([]byte, error) {
	f.loadOnce.Do(func() {
		f.content, f.err = os.ReadFile(f.path)
	})
	return f.content, f.err
}

func (f *checkCachedFile) markdownDocument(mdx bool) (*translationfileparser.ParsedMarkdownDocument, error) {
	content, err := f.read()
	if err != nil {
		return nil, err
	}
	slot := &f.markdownDocs[0]
	if mdx {
		slot = &f.markdownDocs[1]
	}
	slot.once.Do(func() {
		slot.doc = translationfileparser.ParseMarkdownDocument(content, mdx)
	})
	return slot.doc, nil
}

func (f *checkCachedFile) asciiDocDocument() (*translationfileparser.ParsedAsciiDocDocument, error) {
	content, err := f.read()
	if err != nil {
		return nil, err
	}
	f.asciiDocOnce.Do(func() {
		f.asciiDoc = translationfileparser.ParseAsciiDocDocument(content)
	})
	return f.asciiDoc, nil
}

// documentKeyLine returns the line of a markdown (md.*) or AsciiDoc (adoc.*) segment key, or 0.
func (f *checkCachedFile) documentKeyLine(key string) int {
	ext := strings.ToLower(filepath.Ext(f.path))
	isMarkdown := (ext == ".md" || ext == ".mdx") && strings.HasPrefix(key, "md.")
	isAsciiDoc := translationfileparser.IsAsciiDocDocumentExtension(f.path) && strings.HasPrefix(key, "adoc.")
	if !isMarkdown && !isAsciiDoc {
		return 0
	}
	f.docKeyLinesOnce.Do(func() {
		if isMarkdown {
			if doc, err := f.markdownDocument(ext == ".mdx"); err == nil {
				f.docKeyLines = doc.KeyLines()
			}
			return
		}
		if doc, err := f.asciiDocDocument(); err == nil {
			f.docKeyLines = doc.KeyLines()
		}
	})
	return f.docKeyLines[key]
}

// buildLineIndex records line start offsets and, for every run of text between two consecutive
// double quotes on one line, the first line it appears on. A quoted needle "x" (x without quotes
// or newlines) occurs on a line exactly when x sits between two consecutive quotes there, so
// lineForQuoted is a map lookup instead of a scan of the file.
func (f *checkCachedFile) buildLineIndex() {
	f.lineIndexOnce.Do(func() {
		content := f.content
		f.lineStarts = append(make([]int, 0, bytes.Count(content, []byte{'\n'})+1), 0)
		f.quotedLines = make(map[string]int)
		line := 1
		lastQuote := -1
		for i, b := range content {
			switch b {
			case '\n':
				line++
				f.lineStarts = append(f.lineStarts, i+1)
				lastQuote = -1
			case '"':
				if lastQuote >= 0 {
					text := string(content[lastQuote+1 : i])
					if _, seen := f.quotedLines[text]; !seen {
						f.quotedLines[text] = line
					}
				}
				lastQuote = i
			}
		}
	})
}

func (f *checkCachedFile) lineAtOffset(offset int) int {
	return sort.Search(len(f.lineStarts), func(i int) bool { return f.lineStarts[i] > offset })
}

// lineForKey returns the first line containing a quoted segment of key, trying the last segment first.
func (f *checkCachedFile) lineForKey(key string) int {
	key = strings.TrimSpace(key)
	if key == "" {
		return 0
	}
	segments := strings.Split(key, ".")
	for i := len(segments) - 1; i >= 0; i-- {
		segment := strings.TrimSpace(segments[i])
		if segment == "" {
			continue
		}
		if line := f.lineForQuoted(segment); line > 0 {
			return line
		}
	}
	return 0
}

func (f *checkCachedFile) lineForQuoted(text string) int {
	if strings.ContainsAny(text, "\"\n") {
		return f.lineForValue(`"` + text + `"`)
	}
	f.buildLineIndex()
	return f.quotedLines[text]
}

// lineForValue returns the first line containing value, or 0. A value spanning lines never matches.
func (f *checkCachedFile) lineForValue(value string) int {
	needle := strings.TrimSpace(value)
	if needle == "" || strings.Contains(needle, "\n") {
		return 0
	}
	f.buildLineIndex()

	f.valueLinesMu.Lock()
	defer f.valueLinesMu.Unlock()
	if line, ok := f.valueLines[needle]; ok {
		return line
	}
	line := 0
	if offset := bytes.Index(f.content, []byte(needle)); offset >= 0 {
		line = f.lineAtOffset(offset)
	}
	if f.valueLines == nil {
		f.valueLines = make(map[string]int)
	}
	f.valueLines[needle] = line
	return line
}

// checkLocationResolver maps findings to an annotation file and line. The zero value is usable
// from a single goroutine; share one built with a cache across workers.
type checkLocationResolver struct {
	files *checkFileCache
}

func (r *checkLocationResolver) resolve(sourcePath, targetPath, key, sourceValue, targetValue string, preferSource bool) (string, int) {
	primaryPath, primaryValue := targetPath, targetValue
	secondaryPath, secondaryValue := sourcePath, sourceValue
	if preferSource {
		primaryPath, primaryValue, secondaryPath, secondaryValue = sourcePath, sourceValue, targetPath, targetValue
	}
	if file, line := r.resolveInFile(primaryPath, key, primaryValue); file != "" {
		return file, line
	}
	if file, line := r.resolveInFile(secondaryPath, key, secondaryValue); file != "" {
		return file, line
	}
	if primaryPath != "" {
		return primaryPath, 1
	}
	if secondaryPath != "" {
		return secondaryPath, 1
	}
	return "", 0
}

func (r *checkLocationResolver) resolveInFile(filePath, key, value string) (string, int) {
	if filePath == "" {
		return "", 0
	}
	if r.files == nil {
		r.files = newCheckFileCache()
	}
	f := r.files.file(filePath)
	if _, err := f.read(); err != nil {
		return "", 0
	}
	if line := f.documentKeyLine(key); line > 0 {
		return filePath, line
	}
	if line := f.lineForKey(key); line > 0 {
		return filePath, line
	}
	if line := f.lineForValue(value); line > 0 {
		return filePath, line
	}
	return filePath, 1
}
