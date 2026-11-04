package qavalidate

import (
	"context"
	"strconv"
	"testing"
)

func benchSegments(n int) []Segment {
	templates := []Segment{
		{SourceText: "Save changes", TargetText: "Enregistrer les modifications", SourcePath: "messages.json"},
		{
			SourceText: "Click <link>{action}</link> to see {count, plural, one {one message} other {# messages}} in your <b>{folder}</b>.",
			TargetText: "Cliquez sur <link>{action}</link> pour voir {count, plural, one {un message} other {# messages}} dans votre <b>{folder}</b>.",
			SourcePath: "messages.json",
		},
		{
			SourceText: "User %s has %d new messages in group %s.",
			TargetText: "L'utilisateur %s a %d nouveaux messages dans le groupe %s.",
			SourcePath: "messages.properties",
		},
		{SourceText: "Dashboard", TargetText: "Dashboard", SourcePath: "messages.json"},
		{
			SourceText: "<p>Your <strong>Save</strong> settings were updated on 3/5/2026.</p>",
			TargetText: "<p>Vos paramètres <strong>Save</strong> ont été mis à jour le 5/3/2026.</p>",
			SourcePath: "index.html",
			MaxLength:  80,
		},
	}
	segments := make([]Segment, n)
	for i := range segments {
		segment := templates[i%len(templates)]
		segment.ID = "seg-" + strconv.Itoa(i)
		segment.TargetLocale = "fr-FR"
		segments[i] = segment
	}
	return segments
}

func benchPolicy() Policy {
	policy := DefaultPolicy()
	policy.Checks["spelling"] = Setting{Enabled: false, Severity: "warning"}
	policy.Checks["numbers_mismatch"] = Setting{Enabled: true, Severity: "warning"}
	policy.Checks["punctuation_mismatch"] = Setting{Enabled: true, Severity: "warning"}
	policy.Checks["character_case_mismatch"] = Setting{Enabled: true, Severity: "warning"}
	policy.GlossaryTerms = []GlossaryTerm{
		{SourceTerm: "Save", TargetTerm: "Enregistrer", TargetLocale: "fr-FR"},
		{SourceTerm: "Dashboard", TargetTerm: "Tableau de bord", TargetLocale: "fr-FR"},
		{SourceTerm: "message", TargetTerm: "message", TargetLocale: "fr-FR", CaseSensitive: true},
		{SourceTerm: "Settings", TargetTerm: "Settings", TargetLocale: "fr-FR", Forbidden: true},
	}
	return policy
}

func BenchmarkValidateBatch(b *testing.B) {
	ctx := context.Background()
	policy := benchPolicy()

	for _, n := range []int{1, 10, 100} {
		segments := benchSegments(n)
		b.Run("Segments_"+strconv.Itoa(n), func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_, _ = ValidateBatch(ctx, segments, policy)
			}
		})
	}

	b.Run("DefaultPolicyNoSpelling/Segments_100", func(b *testing.B) {
		segments := benchSegments(100)
		defaults := DefaultPolicy()
		defaults.Checks["spelling"] = Setting{Enabled: false, Severity: "warning"}
		b.ReportAllocs()
		for b.Loop() {
			_, _ = ValidateBatch(ctx, segments, defaults)
		}
	})

	b.Run("SpellingUnsupportedLocale/Segments_100", func(b *testing.B) {
		segments := benchSegments(100)
		for i := range segments {
			segments[i].TargetLocale = "xx-XX"
		}
		spelling := benchPolicy()
		spelling.Checks["spelling"] = Setting{Enabled: true, Severity: "warning"}
		spelling.GlossaryTerms = nil
		b.ReportAllocs()
		for b.Loop() {
			_, _ = ValidateBatch(ctx, segments, spelling)
		}
	})
}

func BenchmarkGlossaryFindings(b *testing.B) {
	policy := benchPolicy()
	segments := benchSegments(5)

	for _, segment := range segments {
		b.Run(segment.SourcePath+"/"+segment.ID, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_ = glossaryFindings(segment, policy)
			}
		})
	}
}

func BenchmarkPolicyValidate(b *testing.B) {
	policy := benchPolicy()
	b.ReportAllocs()
	for b.Loop() {
		_ = policy.Validate()
	}
}
