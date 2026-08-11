package translationfileparser

import (
	"strings"
	"testing"
)

func TestAndroidXMLResourcesParser_ValidationErrorEdgeCases(t *testing.T) {
	tests := []struct {
		name        string
		content     string
		errContains string
	}{
		{
			name:        "missing resources root",
			content:     `<?xml version="1.0" encoding="utf-8"?><string name="app_name">Hyperlocalise</string>`,
			errContains: "expected <resources> root",
		},
		{
			name: "multiple root elements",
			content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="app_name">Hyperlocalise</string>
</resources>
<resources>
  <string name="other">Other</string>
</resources>`,
			errContains: "multiple root elements",
		},
		{
			name: "unexpected root element name",
			content: `<?xml version="1.0" encoding="utf-8"?>
<manifest>
  <string name="app_name">Hyperlocalise</string>
</manifest>`,
			errContains: "expected <resources> root, got <manifest>",
		},
		{
			name: "missing name attribute on top level string",
			content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string>No Name</string>
</resources>`,
			errContains: "is missing required \"name\" attribute",
		},
		{
			name: "missing name attribute on top level plurals",
			content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <plurals>
    <item quantity="other">Items</item>
  </plurals>
</resources>`,
			errContains: "is missing required \"name\" attribute",
		},
		{
			name: "unsupported top level resource tag",
			content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <dimen name="padding_medium">16dp</dimen>
</resources>`,
			errContains: "unsupported <dimen> resource",
		},
		{
			name: "self closing string tag",
			content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="app_name" />
</resources>`,
			errContains: "self-closing <string> resource for key \"app_name\" is not supported",
		},
		{
			name: "self closing plural item tag",
			content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <plurals name="items">
    <item quantity="other" />
  </plurals>
</resources>`,
			errContains: "self-closing <item> resource for key \"items.other\" is not supported",
		},
		{
			name: "duplicate string keys",
			content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="welcome">Hello</string>
  <string name="welcome">Welcome</string>
</resources>`,
			errContains: "duplicate resource key \"welcome\"",
		},
		{
			name: "unsupported tag inside plurals",
			content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <plurals name="items">
    <nested>invalid</nested>
    <item quantity="other">items</item>
  </plurals>
</resources>`,
			errContains: "unsupported <nested> inside <plurals name=\"items\">",
		},
		{
			name: "missing quantity attribute in plural item",
			content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <plurals name="items">
    <item>%d items</item>
  </plurals>
</resources>`,
			errContains: "is missing required \"quantity\" attribute",
		},
		{
			name: "invalid quantity attribute in plural item",
			content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <plurals name="items">
    <item quantity="many_more">%d items</item>
    <item quantity="other">%d items</item>
  </plurals>
</resources>`,
			errContains: "has unsupported quantity \"many_more\"",
		},
		{
			name: "duplicate plural item quantity",
			content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <plurals name="items">
    <item quantity="other">%d items</item>
    <item quantity="other">%d items</item>
  </plurals>
</resources>`,
			errContains: "duplicate resource key \"items.other\"",
		},
		{
			name: "empty plurals",
			content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <plurals name="items">
  </plurals>
</resources>`,
			errContains: "must contain at least one <item>",
		},
		{
			name: "plurals missing mandatory other quantity",
			content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <plurals name="items">
    <item quantity="one">%d item</item>
  </plurals>
</resources>`,
			errContains: "must include an item with quantity=\"other\"",
		},
		{
			name: "unterminated string value",
			content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="welcome">Hello
</resources>`,
			errContains: "XML syntax error",
		},
		{
			name: "unterminated plurals element",
			content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <plurals name="items">
    <item quantity="other">%d items</item>
</resources>`,
			errContains: "XML syntax error",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := (AndroidXMLResourcesParser{}).Parse([]byte(tt.content))
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.errContains)
			}
			if !strings.Contains(err.Error(), tt.errContains) {
				t.Fatalf("unexpected error: %v\nwant substring: %q", err, tt.errContains)
			}
		})
	}
}
