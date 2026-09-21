package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"testing"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestUTF16Length(t *testing.T) {
	cases := []string{
		"",
		"ascii",
		"café",
		"日本語",
		"emoji😀",
		"mixed café 😀 日本語",
		strings.Repeat("a", 64) + "😀" + strings.Repeat("é", 32),
	}
	for _, value := range cases {
		require.Equal(t, len(utf16.Encode([]rune(value))), utf16Length(value), "value=%q", value)
	}
}

func TestBuildQaFindingExternalRef(t *testing.T) {
	short := buildQaFindingExternalRef(
		"proj_1",
		"11111111-1111-4111-8111-111111111111",
		"hello",
		"placeholder_mismatch",
		"de-DE",
	)
	require.Equal(t, "qa:proj_1:11111111-1111-4111-8111-111111111111:hello:placeholder_mismatch:de-DE", short)

	base := buildQaFindingExternalRef("proj_1", "11111111-1111-4111-8111-111111111111", "hello", "not_localized", "de-DE")
	otherLocale := buildQaFindingExternalRef("proj_1", "11111111-1111-4111-8111-111111111111", "hello", "not_localized", "fr-FR")
	require.NotEqual(t, base, otherLocale)

	longKey := strings.Repeat("k", 600)
	hashed := buildQaFindingExternalRef("proj_1", "11111111-1111-4111-8111-111111111111", longKey, "length", "en-US")
	require.True(t, strings.HasPrefix(hashed, "qa:proj_1:11111111-1111-4111-8111-111111111111:"))
	require.LessOrEqual(t, len(hashed), 512)

	raw := fmt.Sprintf("proj_1:11111111-1111-4111-8111-111111111111:%s:length:en-US", longKey)
	sum := sha256.Sum256([]byte(raw))
	require.Equal(t, fmt.Sprintf("qa:proj_1:11111111-1111-4111-8111-111111111111:%s", hex.EncodeToString(sum[:16])), hashed)
}

func TestBuildQaFindingExternalRefSurrogateThreshold(t *testing.T) {
	runID := "11111111-1111-4111-8111-111111111111"
	// Each emoji is 2 UTF-16 units. Component-wise length must stay aligned with the joined string
	// after the #2452 fast-path rewrite, or promote/dedupe refs drift across workers.
	key := strings.Repeat("😀", 230)
	raw := fmt.Sprintf("proj_1:%s:%s:length:en-US", runID, key)
	require.Greater(t, utf16Length(raw), 505)

	ref := buildQaFindingExternalRef("proj_1", runID, key, "length", "en-US")
	sum := sha256.Sum256([]byte(raw))
	require.Equal(t, fmt.Sprintf("qa:proj_1:%s:%s", runID, hex.EncodeToString(sum[:16])), ref)
}

func TestBuildTranslationQaFindingHref(t *testing.T) {
	href := buildTranslationQaFindingHref("acme", "project/a", nil, "fr-FR", "hello")
	require.Contains(t, href, "/org/acme/projects/project%2Fa/files/content-editor")
	require.Contains(t, href, "locale=fr-FR")
	require.Contains(t, href, "segment=hello")
	require.Contains(t, href, "sourcePath=%2A")
}

func TestBuildQaFindingIssueMetadata(t *testing.T) {
	meta := buildQaFindingIssueMetadata("run", "finding", "glossary_violation", "warning", "/org/acme/projects/p/files/content-editor")
	require.Equal(t, map[string]any{
		"qaFinding": map[string]string{
			"runId":      "run",
			"findingId":  "finding",
			"checkType":  "glossary_violation",
			"severity":   "warning",
			"editorHref": "/org/acme/projects/p/files/content-editor",
		},
	}, meta)
}

func TestBuildQaFindingIssueTitleTruncates(t *testing.T) {
	title := buildQaFindingIssueTitle("not_localized", strings.Repeat("segment-key", 40), "de-DE")
	require.LessOrEqual(t, utf16Length(title), 300)
	require.True(t, strings.HasSuffix(title, "..."))
}

func TestBuildQaFindingIssueTitleValidUTF8(t *testing.T) {
	// Each rune is 3 bytes in UTF-8; byte slicing at 297 would split a code point.
	key := strings.Repeat("é", 120)
	title := buildQaFindingIssueTitle("not_localized", key, "de-DE")
	require.True(t, utf8.ValidString(title))
	require.LessOrEqual(t, utf16Length(title), 300)
}

func TestBuildQaFindingExternalRefUTF16Threshold(t *testing.T) {
	runID := "11111111-1111-4111-8111-111111111111"
	// Multi-byte UTF-8 expands byte length faster than UTF-16 code unit count (matches TS `.length`).
	key := strings.Repeat("é", 225)
	raw := fmt.Sprintf("proj_1:%s:%s:length:en-US", runID, key)
	require.Greater(t, len(raw), 505)
	require.LessOrEqual(t, utf16Length(raw), 505)

	ref := buildQaFindingExternalRef("proj_1", runID, key, "length", "en-US")
	require.Equal(t, "qa:"+raw, ref)
}

func TestParseFindingIDs(t *testing.T) {
	id := uuid.New()
	parsed, err := parseFindingIDs([]string{id.String(), id.String()})
	require.NoError(t, err)
	require.Len(t, parsed, 1)

	_, err = parseFindingIDs([]string{"not-a-uuid"})
	require.Error(t, err)

	_, err = parseFindingIDs(nil)
	require.Error(t, err)
}

func TestParseFindingIDsTrims36BytePaddedRawHex(t *testing.T) {
	id := uuid.MustParse("11111111-1111-4111-8111-111111111111")
	raw := strings.ReplaceAll(id.String(), "-", "")
	require.Len(t, raw, 32)

	padded := "  " + raw + "  "
	require.Len(t, padded, 36)
	parsed, err := parseFindingIDs([]string{padded})
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{id}, parsed)

	// Two-byte NBSP plus two ASCII spaces also totals 36 bytes around 32 hex digits.
	paddedNBSP := "\u00a0" + raw + "  "
	require.Len(t, paddedNBSP, 36)
	parsed, err = parseFindingIDs([]string{paddedNBSP})
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{id}, parsed)
}
