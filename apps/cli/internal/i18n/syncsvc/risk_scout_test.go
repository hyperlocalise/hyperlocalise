package syncsvc

import (
	"reflect"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

func TestDetectRiskyChanges_Scout(t *testing.T) {
	t.Parallel()

	entryID := storage.EntryID{
		Key:     "greeting",
		Locale:  "ja-JP",
		Context: "homepage",
	}

	tests := []struct {
		name           string
		id             storage.EntryID
		baseline       string
		candidate      string
		invariantDiags []string
		want           []RiskChange
	}{
		{
			name:           "no risky changes, baseline and candidate are same",
			id:             entryID,
			baseline:       "こんにちは、世界", // 8 runes
			candidate:      "こんにちは、世界", // 8 runes
			invariantDiags: nil,
			want:           []RiskChange{},
		},
		{
			name:           "placeholder edit risk detected with mismatch diagnostic",
			id:             entryID,
			baseline:       "Hello {name}",
			candidate:      "Hello",
			invariantDiags: []string{"placeholder parity mismatch (expected [name], got [])"},
			want: []RiskChange{
				{
					ID:      entryID,
					Code:    RiskCodePlaceholderEdit,
					Message: "placeholder or ICU structure edited",
				},
			},
		},
		{
			name:           "placeholder edit risk detected with ICU structural error diagnostic",
			id:             entryID,
			baseline:       "{count, plural, one {# item} other {# items}}",
			candidate:      "items",
			invariantDiags: []string{"invalid ICU/braces structure in candidate"},
			want: []RiskChange{
				{
					ID:      entryID,
					Code:    RiskCodePlaceholderEdit,
					Message: "placeholder or ICU structure edited",
				},
			},
		},
		{
			name:           "unicode length spike detected, French accent translation",
			id:             entryID,
			baseline:       "Accéder", // 7 runes (short baseline (< 8), no spike)
			candidate:      "Accéder maintenant à votre compte personnel",
			invariantDiags: nil,
			want:           []RiskChange{}, // None because baseline length 7 < minBaselineLength (8)
		},
		{
			name:           "unicode length spike detected, Russian cyrillic translation",
			id:             entryID,
			baseline:       "Открыть счет",                                                      // 12 runes (>= 8 baseline)
			candidate:      "Открыть счет и получить доступ к полному списку услуг в один клик", // 65 runes (ratio: 5.42)
			invariantDiags: nil,
			want: []RiskChange{
				{
					ID:              entryID,
					Code:            RiskCodeLengthSpike,
					Message:         "candidate value length increased sharply",
					BaselineLength:  12,
					CandidateLength: 65,
					Ratio:           5.42,
				},
			},
		},
		{
			name:           "length spike exactly at ratio threshold is detected",
			id:             entryID,
			baseline:       "12345678",        // 8 runes (exactly minBaselineLength)
			candidate:      "123456789012345", // 15 runes (ratio: 1.875)
			invariantDiags: nil,
			want: []RiskChange{
				{
					ID:              entryID,
					Code:            RiskCodeLengthSpike,
					Message:         "candidate value length increased sharply",
					BaselineLength:  8,
					CandidateLength: 15,
					Ratio:           1.88, // Math.Round(1.875 * 100) / 100
				},
			},
		},
		{
			name:           "length spike slightly below threshold is ignored",
			id:             entryID,
			baseline:       "1234567890",        // 10 runes
			candidate:      "12345678901234567", // 17 runes (ratio 1.7)
			invariantDiags: nil,
			want:           []RiskChange{},
		},
		{
			name:           "both placeholder edit and length spike detected",
			id:             entryID,
			baseline:       "Hello {name}",                                                                                    // 12 runes
			candidate:      "Bonjour cher utilisateur, nous vous souhaitons la bienvenue sur notre application web sécurisée", // 95 runes (ratio: 7.92)
			invariantDiags: []string{"placeholder parity mismatch"},
			want: []RiskChange{
				{
					ID:      entryID,
					Code:    RiskCodePlaceholderEdit,
					Message: "placeholder or ICU structure edited",
				},
				{
					ID:              entryID,
					Code:            RiskCodeLengthSpike,
					Message:         "candidate value length increased sharply",
					BaselineLength:  12,
					CandidateLength: 95,
					Ratio:           7.92,
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := detectRiskyChanges(tt.id, tt.baseline, tt.candidate, tt.invariantDiags)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("detectRiskyChanges() = %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestCompareRiskChange_Scout(t *testing.T) {
	t.Parallel()

	idA := storage.EntryID{Locale: "de", Key: "key-a", Context: "ctx-a"}
	idB := storage.EntryID{Locale: "de", Key: "key-a", Context: "ctx-b"} // Context mismatch
	idC := storage.EntryID{Locale: "de", Key: "key-b", Context: "ctx-a"} // Key mismatch
	idD := storage.EntryID{Locale: "fr", Key: "key-a", Context: "ctx-a"} // Locale mismatch

	tests := []struct {
		name string
		a    RiskChange
		b    RiskChange
		want int // -1 if a < b, 1 if a > b, 0 if a == b
	}{
		{
			name: "identical risk changes",
			a:    RiskChange{ID: idA, Code: "code-a", Message: "msg-a"},
			b:    RiskChange{ID: idA, Code: "code-a", Message: "msg-a"},
			want: 0,
		},
		{
			name: "different locales (de < fr)",
			a:    RiskChange{ID: idA, Code: "code-a", Message: "msg-a"},
			b:    RiskChange{ID: idD, Code: "code-a", Message: "msg-a"},
			want: -1,
		},
		{
			name: "different keys (key-a < key-b)",
			a:    RiskChange{ID: idA, Code: "code-a", Message: "msg-a"},
			b:    RiskChange{ID: idC, Code: "code-a", Message: "msg-a"},
			want: -1,
		},
		{
			name: "different contexts (ctx-a < ctx-b)",
			a:    RiskChange{ID: idA, Code: "code-a", Message: "msg-a"},
			b:    RiskChange{ID: idB, Code: "code-a", Message: "msg-a"},
			want: -1,
		},
		{
			name: "equal ID, different codes (code-a < code-b)",
			a:    RiskChange{ID: idA, Code: "code-a", Message: "msg-a"},
			b:    RiskChange{ID: idA, Code: "code-b", Message: "msg-a"},
			want: -1,
		},
		{
			name: "equal ID and code, different messages (msg-a < msg-b)",
			a:    RiskChange{ID: idA, Code: "code-a", Message: "msg-a"},
			b:    RiskChange{ID: idA, Code: "code-a", Message: "msg-b"},
			want: -1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := compareRiskChange(tt.a, tt.b)
			// Normalize got to -1, 0, or 1 to match tt.want
			var normalized int
			if got < 0 {
				normalized = -1
			} else if got > 0 {
				normalized = 1
			}

			if normalized != tt.want {
				t.Errorf("compareRiskChange() = %d, want %d", got, tt.want)
			}

			// Validate anti-symmetry property of comparator
			gotRev := compareRiskChange(tt.b, tt.a)
			var normalizedRev int
			if gotRev < 0 {
				normalizedRev = -1
			} else if gotRev > 0 {
				normalizedRev = 1
			}

			if normalizedRev != -normalized {
				t.Errorf("anti-symmetry violation: compare(a, b) = %d, compare(b, a) = %d", got, gotRev)
			}
		})
	}
}
