package editor_export

import (
	"testing"
	"unicode/utf8"

	"github.com/stretchr/testify/require"
)

func TestEscapeXMLEscapesMarkupAndQuotes(t *testing.T) {
	require.Equal(t, "Use &lt;b&gt;bold&lt;/b&gt; &amp; &quot;quotes&quot; &amp; &apos;s", escapeXML(`Use <b>bold</b> & "quotes" & 's`))
}

func TestEscapeXMLStripsInternalPlaceholdersBeforeEscaping(t *testing.T) {
	require.Equal(t, "Agents &amp; tools", escapeXML("\x1eHLMDPH_8E6DFE8F53EA_0\x1fAgents & tools"))
}

func TestEscapeXMLDropsInvalidXMLCharacters(t *testing.T) {
	require.Equal(t, "Hello", escapeXML("Hel\x00lo\uFFFF"))
}

func TestEscapeXMLPreservesWhitespaceControls(t *testing.T) {
	require.Equal(t, "Hello\tworld\nnext\rline", escapeXML("Hello\tworld\nnext\rline"))
}

func TestEscapeXMLEmptyAndPlaceholderOnly(t *testing.T) {
	require.Equal(t, "", escapeXML(""))
	require.Equal(t, "", escapeXML("\x1eHLMDPH_8E6DFE8F53EA_0\x1f"))
}

func TestSanitizeInvalidXMLCharactersLeavesValidText(t *testing.T) {
	require.Equal(t, "café", sanitizeInvalidXMLCharacters("café"))
	require.Equal(t, "", sanitizeInvalidXMLCharacters(""))
	require.Equal(t, "ok\uFFFDend", sanitizeInvalidXMLCharacters("ok\uFFFDend"))
}

func TestSanitizeInvalidXMLCharactersNormalizesMalformedUTF8(t *testing.T) {
	malformed := "ok" + string([]byte{0xff}) + "end"
	sanitized := sanitizeInvalidXMLCharacters(malformed)
	require.Equal(t, "ok\uFFFDend", sanitized)
	require.True(t, utf8.ValidString(sanitized))
}

func TestEscapeXMLNormalizesMalformedUTF8(t *testing.T) {
	malformed := "ok" + string([]byte{0xff}) + "&end"
	require.Equal(t, "ok\uFFFD&amp;end", escapeXML(malformed))
}

func TestStripInternalSegmentPlaceholdersLeavesLookalikes(t *testing.T) {
	require.Equal(t, "HLMDPH_lookalike", stripInternalSegmentPlaceholders("HLMDPH_lookalike"))
	require.Equal(t, "keep", stripInternalSegmentPlaceholders("keep"))
}
