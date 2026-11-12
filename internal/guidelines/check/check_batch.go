package check

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
)

// ErrMeterLimit means the organization's guideline check allowance blocked the
// model call. When some segments were already served from cache, CheckBeforeModel
// may still return a partial result with UncheckedSegmentIDs set.
var ErrMeterLimit = errors.New("guideline check meter limit")

type segmentGuidelineState struct {
	segment  Segment
	passages []Passage
	findings []Finding
	cited    []Passage
	// clean with no passages to send
	noGuidelines bool
	fromCache    bool
}

func (c *Checker) checkBeforeModelBatch(
	ctx context.Context,
	scope guidelines.Scope,
	req Request,
	beforeModel func(context.Context, float64) error,
) (Result, error) {
	result := Result{
		Findings: []Finding{},
		Passages: []Passage{},
		Model:    c.model.Name(),
	}
	var states []segmentGuidelineState
	var misses []segmentGuidelineState
	searchAvailable := false

	for _, segment := range req.Segments {
		subReq := req
		subReq.Segments = []Segment{segment}
		retrieved, err := c.retriever.Retrieve(ctx, scope, retrievalQuery(subReq), retrieveLimit)
		if err != nil {
			return Result{}, fmt.Errorf("retrieve guidelines: %w", err)
		}
		searchAvailable = searchAvailable || retrieved.SearchAvailable
		passages, err := promptPassages(retrieved)
		if err != nil {
			return Result{}, err
		}
		if len(passages) == 0 {
			states = append(states, segmentGuidelineState{segment: segment, noGuidelines: true})
			continue
		}
		user := userPrompt(subReq, passages)
		if raw, ok := c.cachedOutput(ctx, scope, user); ok {
			findings, cited, groundErr := groundFindings(subReq, passages, raw)
			if groundErr == nil {
				states = append(states, segmentGuidelineState{
					segment: segment, passages: passages, findings: findings, cited: cited, fromCache: true,
				})
				continue
			}
		}
		state := segmentGuidelineState{segment: segment, passages: passages}
		states = append(states, state)
		misses = append(misses, state)
	}
	result.SearchAvailable = searchAvailable
	for _, state := range states {
		if state.noGuidelines {
			continue
		}
		result.Findings = appendFindingsDedupe(result.Findings, state.findings)
		result.Passages = appendPassagesDedupe(result.Passages, state.cited)
	}

	if len(misses) == 0 {
		result.Cached = allBatchFromCache(states)
		return result, nil
	}

	missReq := req
	missSegments := make([]Segment, 0, len(misses))
	for _, m := range misses {
		missSegments = append(missSegments, m.segment)
	}
	missReq.Segments = missSegments

	retrieved, err := c.retriever.Retrieve(ctx, scope, retrievalQuery(missReq), retrieveLimit)
	if err != nil {
		return Result{}, fmt.Errorf("retrieve guidelines: %w", err)
	}
	if retrieved.SearchAvailable {
		result.SearchAvailable = true
	}
	batchPassages, err := promptPassages(retrieved)
	if err != nil {
		return Result{}, err
	}
	if len(batchPassages) == 0 {
		return result, nil
	}
	batchUser := userPrompt(missReq, batchPassages)
	if raw, ok := c.cachedOutput(ctx, scope, batchUser); ok {
		findings, cited, groundErr := groundFindings(missReq, batchPassages, raw)
		if groundErr == nil {
			result.Findings = appendFindingsDedupe(result.Findings, findings)
			result.Passages = appendPassagesDedupe(result.Passages, cited)
			result.Cached = true
			return result, nil
		}
	}

	billable := float64(len(misses))
	if beforeModel != nil {
		if err := beforeModel(ctx, billable); err != nil {
			if errors.Is(err, ErrMeterLimit) && len(misses) < len(req.Segments) {
				result.UncheckedSegmentIDs = missSegmentIDs(misses)
				return result, nil
			}
			return Result{}, err
		}
	}

	result.ModelInvoked = true
	result.BilledSegmentCount = len(misses)
	raw, err := c.model.Complete(ctx, systemPrompt, batchUser)
	if err != nil {
		return Result{}, fmt.Errorf("guideline check model: %w", err)
	}
	batchFindings, batchCited, err := groundFindings(missReq, batchPassages, raw)
	if err != nil {
		return Result{}, err
	}
	c.storeOutput(ctx, scope, batchUser, raw)
	result.Findings = appendFindingsDedupe(result.Findings, batchFindings)
	result.Passages = appendPassagesDedupe(result.Passages, batchCited)

	bySegment := findingsBySegmentID(batchFindings)
	for _, miss := range misses {
		segFindings := bySegment[miss.segment.ID]
		c.storeSegmentCache(ctx, scope, req, miss.segment, miss.passages, segFindings)
	}

	return result, nil
}

func (c *Checker) checkBeforeModelSingle(
	ctx context.Context,
	scope guidelines.Scope,
	req Request,
	beforeModel func(context.Context, float64) error,
) (Result, error) {
	retrieved, err := c.retriever.Retrieve(ctx, scope, retrievalQuery(req), retrieveLimit)
	if err != nil {
		return Result{}, fmt.Errorf("retrieve guidelines: %w", err)
	}
	result := Result{Findings: []Finding{}, Passages: []Passage{}, SearchAvailable: retrieved.SearchAvailable, Model: c.model.Name()}
	passages, err := promptPassages(retrieved)
	if err != nil {
		return Result{}, err
	}
	if len(passages) == 0 {
		return result, nil
	}
	user := userPrompt(req, passages)
	if raw, ok := c.cachedOutput(ctx, scope, user); ok {
		findings, cited, groundErr := groundFindings(req, passages, raw)
		if groundErr == nil {
			result.Findings, result.Passages, result.Cached = findings, cited, true
			return result, nil
		}
	}
	if beforeModel != nil {
		if err := beforeModel(ctx, 1); err != nil {
			return Result{}, err
		}
	}
	result.ModelInvoked = true
	result.BilledSegmentCount = 1
	raw, err := c.model.Complete(ctx, systemPrompt, user)
	if err != nil {
		return Result{}, fmt.Errorf("guideline check model: %w", err)
	}
	result.Findings, result.Passages, err = groundFindings(req, passages, raw)
	if err != nil {
		return Result{}, err
	}
	c.storeOutput(ctx, scope, user, raw)
	return result, nil
}

func (c *Checker) storeSegmentCache(
	ctx context.Context,
	scope guidelines.Scope,
	req Request,
	segment Segment,
	segmentPassages []Passage,
	segmentFindings []Finding,
) {
	subReq := req
	subReq.Segments = []Segment{segment}
	var raw string
	if len(segmentFindings) == 0 {
		raw = `{"findings":[]}`
	} else {
		var ok bool
		raw, ok = modelJSONForSegmentCache(segment, segmentPassages, segmentFindings)
		if !ok {
			return
		}
	}
	user := userPrompt(subReq, segmentPassages)
	c.storeOutput(ctx, scope, user, raw)
}

func modelJSONForSegmentCache(segment Segment, segmentPassages []Passage, findings []Finding) (string, bool) {
	out := make([]modelFinding, 0, len(findings))
	for _, f := range findings {
		if f.SegmentID != segment.ID {
			continue
		}
		label, ok := passageLabelForID(segmentPassages, f.PassageID)
		if !ok {
			continue
		}
		text := segment.Target
		if f.Field == FieldSource {
			text = segment.Source
		}
		quote, ok := utf16Substr(text, f.Start, f.End)
		if !ok {
			continue
		}
		out = append(out, modelFinding{
			SegmentID:  f.SegmentID,
			Field:      string(f.Field),
			Severity:   f.Severity,
			Quote:      quote,
			Message:    f.Message,
			Suggestion: f.Suggestion,
			Passage:    label,
		})
	}
	encoded, err := json.Marshal(struct {
		Findings []modelFinding `json:"findings"`
	}{Findings: out})
	if err != nil {
		return "", false
	}
	return string(encoded), true
}

func passageLabelForID(passages []Passage, id string) (string, bool) {
	for i, p := range passages {
		if p.ID == id {
			return fmt.Sprintf("P%d", i+1), true
		}
	}
	return "", false
}

func utf16Substr(text string, start, end int) (string, bool) {
	if start < 0 || end < start {
		return "", false
	}
	if start == end {
		if start == utf16Len(text) {
			return "", true
		}
		return "", false
	}
	startByte, endByte := -1, -1
	var pos int
	for i := 0; i < len(text); {
		r, size := utf8.DecodeRuneInString(text[i:])
		width := utf16.RuneLen(r)
		if pos == start {
			startByte = i
		}
		next := pos + width
		if startByte >= 0 && next >= end && endByte < 0 {
			endByte = i + size
		}
		i += size
		pos = next
	}
	if startByte < 0 || endByte < 0 || endByte < startByte {
		return "", false
	}
	return text[startByte:endByte], true
}

func missSegmentIDs(misses []segmentGuidelineState) []string {
	ids := make([]string, 0, len(misses))
	for _, m := range misses {
		ids = append(ids, m.segment.ID)
	}
	return ids
}

func allBatchFromCache(states []segmentGuidelineState) bool {
	for _, s := range states {
		if s.noGuidelines {
			continue
		}
		if !s.fromCache {
			return false
		}
	}
	return true
}

func findingsBySegmentID(findings []Finding) map[string][]Finding {
	out := map[string][]Finding{}
	for _, f := range findings {
		out[f.SegmentID] = append(out[f.SegmentID], f)
	}
	return out
}

func appendFindingsDedupe(existing []Finding, add []Finding) []Finding {
	seen := map[string]bool{}
	for _, f := range existing {
		seen[findingKey(f)] = true
	}
	for _, f := range add {
		k := findingKey(f)
		if seen[k] {
			continue
		}
		seen[k] = true
		existing = append(existing, f)
	}
	return existing
}

func findingKey(f Finding) string {
	return fmt.Sprintf("%s\x00%s\x00%d\x00%d\x00%s\x00%s", f.SegmentID, f.Field, f.Start, f.End, f.PassageID, f.Message)
}

func appendPassagesDedupe(existing []Passage, add []Passage) []Passage {
	seen := map[string]bool{}
	for _, p := range existing {
		seen[p.ID] = true
	}
	for _, p := range add {
		if seen[p.ID] {
			continue
		}
		seen[p.ID] = true
		existing = append(existing, p)
	}
	return existing
}
