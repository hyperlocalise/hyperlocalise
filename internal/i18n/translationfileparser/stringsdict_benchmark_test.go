package translationfileparser

import (
	"testing"
)

func BenchmarkAppleStringsdictParser(b *testing.B) {
	content := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>files_count</key>
  <dict>
    <key>NSStringLocalizedFormatKey</key>
    <string>%#@files@</string>
    <key>files</key>
    <dict>
      <key>NSStringFormatSpecTypeKey</key>
      <string>NSStringPluralRuleType</string>
      <key>NSStringFormatValueTypeKey</key>
      <string>d</string>
      <key>zero</key>
      <string>No files</string>
      <key>one</key>
      <string>%d file</string>
      <key>other</key>
      <string>%d files</string>
    </dict>
  </dict>
  <key>messages_count</key>
  <dict>
    <key>NSStringLocalizedFormatKey</key>
    <string>%#@messages@</string>
    <key>messages</key>
    <dict>
      <key>NSStringFormatSpecTypeKey</key>
      <string>NSStringPluralRuleType</string>
      <key>NSStringFormatValueTypeKey</key>
      <string>d</string>
      <key>zero</key>
      <string>No messages</string>
      <key>one</key>
      <string>%d message</string>
      <key>other</key>
      <string>%d messages</string>
    </dict>
  </dict>
</dict>
</plist>`)

	parser := AppleStringsdictParser{}
	for i := 0; i < b.N; i++ {
		_, _ = parser.Parse(content)
	}
}

func BenchmarkMarshalAppleStringsdict(b *testing.B) {
	template := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>files_count</key>
  <dict>
    <key>NSStringLocalizedFormatKey</key>
    <string>%#@files@</string>
    <key>files</key>
    <dict>
      <key>one</key>
      <string>%d file</string>
      <key>other</key>
      <string>%d files</string>
    </dict>
  </dict>
</dict>
</plist>`)
	values := map[string]string{
		"files_count.files.one":   "%d fichier",
		"files_count.files.other": "%d fichiers",
	}

	for i := 0; i < b.N; i++ {
		_, _ = MarshalAppleStringsdict(template, values)
	}
}
