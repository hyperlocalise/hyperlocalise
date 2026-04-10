package runsvc

import (
	"fmt"
	"strings"
	"time"
)

const (
	ReportJSONDetailFull    = "full"
	ReportJSONDetailSummary = "summary"
)

// NormalizeReportJSONDetail returns a canonical detail level for --output JSON.
// Empty string is treated as "full" for backward compatibility with callers that omit the field;
// the CLI sets an explicit default of "summary".
func NormalizeReportJSONDetail(s string) (string, error) {
	d := strings.ToLower(strings.TrimSpace(s))
	if d == "" {
		return ReportJSONDetailFull, nil
	}
	switch d {
	case ReportJSONDetailFull, ReportJSONDetailSummary:
		return d, nil
	default:
		return "", fmt.Errorf("invalid report JSON detail %q: use %s or %s", s, ReportJSONDetailFull, ReportJSONDetailSummary)
	}
}

// SummaryJSONReport is a compact JSON view: counts, token rollups, failures, and warnings only.
// It intentionally omits executable/skipped task lists, per-entry batches, and prune candidate lists
// so the artifact stays small for large runs. Use full detail for complete payloads.
type SummaryJSONReport struct {
	GeneratedAt     time.Time `json:"generatedAt"`
	ConfigPath      string    `json:"configPath,omitempty"`
	PlannedTotal    int       `json:"plannedTotal"`
	SkippedByLock   int       `json:"skippedByLock"`
	ExecutableTotal int       `json:"executableTotal"`
	Succeeded       int       `json:"succeeded"`
	Failed          int       `json:"failed"`
	PersistedToLock int       `json:"persistedToLock"`
	TokenUsage
	LocaleUsage                 map[string]TokenUsage `json:"localeUsage,omitempty"`
	Failures                    []Failure             `json:"failures,omitempty"`
	PruneCandidateCount         int                   `json:"pruneCandidateCount,omitempty"`
	PruneApplied                int                   `json:"pruneApplied"`
	ContextMemoryEnabled        bool                  `json:"contextMemoryEnabled,omitempty"`
	ContextMemoryScope          string                `json:"contextMemoryScope,omitempty"`
	ContextMemoryGenerated      int                   `json:"contextMemoryGenerated,omitempty"`
	ContextMemoryFallbackGroups int                   `json:"contextMemoryFallbackGroups,omitempty"`
	Warnings                    []string              `json:"warnings,omitempty"`
}

// ReportForJSON returns either the full Report or a summary-shaped value for json.Marshal.
func ReportForJSON(r Report, detail string) (any, error) {
	d, err := NormalizeReportJSONDetail(detail)
	if err != nil {
		return nil, err
	}
	if d == ReportJSONDetailFull {
		return r, nil
	}
	return SummaryJSONReportFrom(r), nil
}

func SummaryJSONReportFrom(r Report) SummaryJSONReport {
	return SummaryJSONReport{
		GeneratedAt:                 r.GeneratedAt,
		ConfigPath:                  r.ConfigPath,
		PlannedTotal:                r.PlannedTotal,
		SkippedByLock:               r.SkippedByLock,
		ExecutableTotal:             r.ExecutableTotal,
		Succeeded:                   r.Succeeded,
		Failed:                      r.Failed,
		PersistedToLock:             r.PersistedToLock,
		TokenUsage:                  r.TokenUsage,
		LocaleUsage:                 r.LocaleUsage,
		Failures:                    r.Failures,
		PruneCandidateCount:         len(r.PruneCandidates),
		PruneApplied:                r.PruneApplied,
		ContextMemoryEnabled:        r.ContextMemoryEnabled,
		ContextMemoryScope:          r.ContextMemoryScope,
		ContextMemoryGenerated:      r.ContextMemoryGenerated,
		ContextMemoryFallbackGroups: r.ContextMemoryFallbackGroups,
		Warnings:                    r.Warnings,
	}
}
