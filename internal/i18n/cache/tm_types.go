package cache

import (
	"fmt"
	"strings"
)

// TMProvenance describes trust/state of a TM candidate.
type TMProvenance string

const (
	TMProvenanceCurated TMProvenance = "curated"
	TMProvenanceDraft   TMProvenance = "draft"
	TMProvenanceLLM     TMProvenance = "llm"
	TMProvenanceTMS     TMProvenance = "tms"
	TMProvenanceUnknown TMProvenance = "unknown"
)

// TMSource describes where a TM entry was produced from.
type TMSource string

const (
	TMSourceRun      TMSource = "run"
	TMSourceSyncPull TMSource = "sync_pull"
	TMSourceSyncPush TMSource = "sync_push"
	TMSourceManual   TMSource = "manual"
	TMSourceImport   TMSource = "import"
	TMSourceLegacy   TMSource = "legacy"
	TMSourceUnknown  TMSource = "unknown"
)

// TMMetadata captures typed provenance/source metadata for TM entries.
type TMMetadata struct {
	Provenance TMProvenance
	Source     TMSource
}

func normalizeTMProvenance(value TMProvenance) (TMProvenance, error) {
	normalized := TMProvenance(strings.ToLower(strings.TrimSpace(string(value))))
	if normalized == "" {
		return TMProvenanceUnknown, nil
	}
	switch normalized {
	case TMProvenanceCurated, TMProvenanceDraft, TMProvenanceLLM, TMProvenanceTMS, TMProvenanceUnknown:
		return normalized, nil
	default:
		return "", fmt.Errorf("invalid tm provenance %q", value)
	}
}

func normalizeTMSource(value TMSource) (TMSource, error) {
	normalized := TMSource(strings.ToLower(strings.TrimSpace(string(value))))
	if normalized == "" {
		return TMSourceUnknown, nil
	}
	switch normalized {
	case TMSourceRun, TMSourceSyncPull, TMSourceSyncPush, TMSourceManual, TMSourceImport, TMSourceLegacy, TMSourceUnknown:
		return normalized, nil
	default:
		return "", fmt.Errorf("invalid tm source %q", value)
	}
}

func sanitizeTMProvenance(value TMProvenance) TMProvenance {
	normalized, err := normalizeTMProvenance(value)
	if err != nil {
		return TMProvenanceUnknown
	}
	return normalized
}

func sanitizeTMSource(value TMSource) TMSource {
	normalized, err := normalizeTMSource(value)
	if err != nil {
		return TMSourceUnknown
	}
	return normalized
}
