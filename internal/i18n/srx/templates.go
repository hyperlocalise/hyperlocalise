package srx

import (
	"fmt"
	"strings"
)

const (
	defaultTemplateXML = `<?xml version="1.0" encoding="UTF-8"?>
<srx version="2.0">
  <body>
    <languagerules>
      <languagerule languagename="Default">
        <rule break="no">
          <beforebreak>(?i)(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e)\.</beforebreak>
          <afterbreak>\s</afterbreak>
        </rule>
        <rule break="no">
          <beforebreak>\d\.</beforebreak>
          <afterbreak>\d</afterbreak>
        </rule>
        <rule break="yes">
          <beforebreak>[\.!\?]+["']?</beforebreak>
          <afterbreak>\s</afterbreak>
        </rule>
      </languagerule>
    </languagerules>
    <maprules>
      <languagemap languagepattern=".*" languagerulename="Default"/>
    </maprules>
  </body>
</srx>`

	htmlTemplateXML = `<?xml version="1.0" encoding="UTF-8"?>
<srx version="2.0">
  <body>
    <languagerules>
      <languagerule languagename="HTML">
        <rule break="no">
          <beforebreak>(?i)(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e)\.</beforebreak>
          <afterbreak>\s</afterbreak>
        </rule>
        <rule break="no">
          <beforebreak>(?i)(www|https?)</beforebreak>
          <afterbreak>:</afterbreak>
        </rule>
        <rule break="no">
          <beforebreak>\d\.</beforebreak>
          <afterbreak>\d</afterbreak>
        </rule>
        <rule break="yes">
          <beforebreak>[\.!\?]+["']?</beforebreak>
          <afterbreak>\s</afterbreak>
        </rule>
      </languagerule>
    </languagerules>
    <maprules>
      <languagemap languagepattern=".*" languagerulename="HTML"/>
    </maprules>
  </body>
</srx>`

	markdownTemplateXML = `<?xml version="1.0" encoding="UTF-8"?>
<srx version="2.0">
  <body>
    <languagerules>
      <languagerule languagename="Markdown">
        <rule break="no">
          <beforebreak>(?i)(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e)\.</beforebreak>
          <afterbreak>\s</afterbreak>
        </rule>
        <rule break="no">
          <beforebreak>\d+\.</beforebreak>
          <afterbreak>\s</afterbreak>
        </rule>
        <rule break="no">
          <beforebreak>\d\.</beforebreak>
          <afterbreak>\d</afterbreak>
        </rule>
        <rule break="yes">
          <beforebreak>[\.!\?]+["']?</beforebreak>
          <afterbreak>\s</afterbreak>
        </rule>
      </languagerule>
    </languagerules>
    <maprules>
      <languagemap languagepattern=".*" languagerulename="Markdown"/>
    </maprules>
  </body>
</srx>`
)

// LoadTemplate compiles a built-in SRX template.
func LoadTemplate(name string) (*Document, error) {
	normalized := strings.ToLower(strings.TrimSpace(name))
	source, ok := templateSource(normalized)
	if !ok {
		return nil, fmt.Errorf("srx: unknown template %q", name)
	}
	return Parse([]byte(source))
}

// NormalizeSpec trims an SRX spec. Named templates are compared case-insensitively.
func NormalizeSpec(spec string) string {
	return strings.TrimSpace(spec)
}

func templateSource(name string) (string, bool) {
	switch name {
	case TemplateDefault:
		return defaultTemplateXML, true
	case TemplateHTML:
		return htmlTemplateXML, true
	case TemplateMarkdown:
		return markdownTemplateXML, true
	default:
		return "", false
	}
}
