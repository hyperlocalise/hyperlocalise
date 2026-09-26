package main

import (
	"fmt"
	"testing"
)

func BenchmarkIsLegacyIssueUUID(b *testing.B) {
	ids := []string{
		"HL-12345",
		"11111111-1111-4111-8111-111111111111",
		"not-a-uuid",
		"AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
	}
	b.ReportAllocs()
	for b.Loop() {
		for _, id := range ids {
			_ = isLegacyIssueUUID(id)
		}
	}
}

func BenchmarkIssueIDMatchSQL(b *testing.B) {
	ids := []string{"HL-99", "11111111-1111-4111-8111-111111111111"}
	b.ReportAllocs()
	for b.Loop() {
		for _, id := range ids {
			_, _ = issueIDMatchSQL(id, 3)
		}
	}
}

func BenchmarkPresentRelationshipKind(b *testing.B) {
	kinds := []string{"related", "blocks", "duplicate_of", "other"}
	dirs := []string{"outgoing", "incoming"}
	b.ReportAllocs()
	for b.Loop() {
		for _, kind := range kinds {
			for _, dir := range dirs {
				_ = presentRelationshipKind(kind, dir)
			}
		}
	}
}

func BenchmarkUniqueStrings(b *testing.B) {
	for _, size := range []int{10, 100, 1000} {
		b.Run(fmt.Sprint(size), func(b *testing.B) {
			values := make([]string, size*2)
			for i := 0; i < size; i++ {
				values[i] = fmt.Sprintf("user_%d", i)
				values[size+i] = fmt.Sprintf(" user_%d ", i%size)
			}
			b.ReportAllocs()
			b.ResetTimer()
			for b.Loop() {
				out := uniqueStrings(values)
				if len(out) != size {
					b.Fatalf("got %d want %d", len(out), size)
				}
			}
		})
	}
}

func BenchmarkCanDeleteIssueSheetColumn(b *testing.B) {
	keys := []string{"priority", "owner_note", "context", "custom_note", "severity"}
	layers := []string{"custom", "enrichment", "system"}
	b.ReportAllocs()
	for b.Loop() {
		for _, key := range keys {
			for _, layer := range layers {
				_ = canDeleteIssueSheetColumn(key, layer)
			}
		}
	}
}

func BenchmarkRequestLogPathIssueSheet(b *testing.B) {
	path := "/v1/orgs/acme/projects/proj_1/issue-sheet/HL-1/comments/cmt_1"
	b.ReportAllocs()
	for b.Loop() {
		_ = requestLogPath(path)
	}
}

func BenchmarkIssueSheetActorCapabilities(b *testing.B) {
	roles := []string{"admin", "localization_manager", "developer", "translator", "reviewer", "member", "guest"}
	b.ReportAllocs()
	for b.Loop() {
		for _, role := range roles {
			actor := issueSheetActor{role: role}
			_ = actor.canRead()
			_ = actor.canMutateIssues()
			_ = actor.canManageColumns()
			_ = actor.canWriteProjectTeam()
		}
	}
}
