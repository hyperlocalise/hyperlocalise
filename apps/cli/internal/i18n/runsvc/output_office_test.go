package runsvc

import (
	"archive/zip"
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

const testDOCXDocument = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
	`<w:p><w:r><w:t>Hello</w:t></w:r></w:p>` +
	`<w:p><w:r><w:t xml:space="preserve">Read the </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>terms</w:t></w:r></w:p>` +
	`</w:body></w:document>`

const testPPTXSlide = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>` +
	`<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/></p:nvSpPr><p:txBody><a:p><a:r><a:t>Welcome</a:t></a:r></a:p></p:txBody></p:sp>` +
	`</p:spTree></p:cSld></p:sld>`

func testOfficePackage(t *testing.T, parts map[string]string) []byte {
	t.Helper()
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	for _, name := range []string{"[Content_Types].xml", "word/document.xml", "ppt/presentation.xml", "ppt/_rels/presentation.xml.rels", "ppt/slides/slide1.xml"} {
		content, ok := parts[name]
		if !ok {
			continue
		}
		entry, err := writer.Create(name)
		if err != nil {
			t.Fatalf("create %s: %v", name, err)
		}
		if _, err := entry.Write([]byte(content)); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close package: %v", err)
	}
	return buffer.Bytes()
}

func TestFlushOutputForTargetDOCXMergesExistingTarget(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "en", "brief.docx")
	targetPath := filepath.Join(dir, "fr", "brief.docx")
	files := map[string][]byte{
		sourcePath: testOfficePackage(t, map[string]string{
			"[Content_Types].xml": `<Types/>`,
			"word/document.xml":   testDOCXDocument,
		}),
	}
	svc := newTestService()
	svc.readFile = func(name string) ([]byte, error) {
		content, ok := files[name]
		if !ok {
			return nil, os.ErrNotExist
		}
		return append([]byte(nil), content...), nil
	}
	svc.writeFile = func(name string, content []byte) error {
		files[name] = append([]byte(nil), content...)
		return nil
	}

	flush := func(entries map[string]string) {
		t.Helper()
		if _, err := svc.flushOutputForTarget(targetPath, stagedOutput{
			entries:      entries,
			sourcePath:   sourcePath,
			sourceLocale: "en",
			targetLocale: "fr",
		}, nil); err != nil {
			t.Fatalf("flush docx target: %v", err)
		}
	}
	source, err := (translationfileparser.DOCXParser{}).Parse(files[sourcePath])
	if err != nil {
		t.Fatalf("parse source: %v", err)
	}
	if len(translationfileparser.OOXMLPlaceholderTokens(source["word/document.xml#1"])) != 2 {
		t.Fatalf("expected open and close tokens, got %q", source["word/document.xml#1"])
	}
	translated := strings.NewReplacer("Read the ", "Lisez les ", "terms", "conditions").Replace(source["word/document.xml#1"])

	flush(map[string]string{"word/document.xml#0": "Bonjour"})
	flush(map[string]string{"word/document.xml#1": translated})

	got, err := (translationfileparser.DOCXParser{}).Parse(files[targetPath])
	if err != nil {
		t.Fatalf("parse target: %v", err)
	}
	if got["word/document.xml#0"] != "Bonjour" {
		t.Fatalf("expected first flush to survive, got %#v", got)
	}
	if got["word/document.xml#1"] != translated {
		t.Fatalf("unexpected second paragraph: %q", got["word/document.xml#1"])
	}
	if !bytes.Contains(files[targetPath], []byte(`[Content_Types].xml`)) {
		t.Fatal("expected untouched package parts to be copied")
	}
}

func TestMarshalTargetFilePPTXUsesSourceTemplate(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "launch.pptx")
	files := map[string][]byte{
		sourcePath: testOfficePackage(t, map[string]string{
			"[Content_Types].xml": `<Types/>`,
			"ppt/presentation.xml": `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
				`<p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`,
			"ppt/_rels/presentation.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
				`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`,
			"ppt/slides/slide1.xml": testPPTXSlide,
		}),
	}
	svc := newTestService()
	svc.readFile = func(name string) ([]byte, error) {
		content, ok := files[name]
		if !ok {
			return nil, os.ErrNotExist
		}
		return content, nil
	}

	values := map[string]string{"ppt/slides/slide1.xml#0": "Bienvenue"}
	content, _, err := svc.marshalTargetFile(filepath.Join(dir, "launch.fr.pptx"), sourcePath, "en", "fr", values, values, nil)
	if err != nil {
		t.Fatalf("marshal pptx: %v", err)
	}
	got, err := (translationfileparser.PPTXParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse pptx: %v", err)
	}
	if got["ppt/slides/slide1.xml#0"] != "Bienvenue" {
		t.Fatalf("unexpected pptx values: %#v", got)
	}
}
