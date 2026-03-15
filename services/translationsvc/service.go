package translationsvc

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"path"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/quiet-circles/hyperlocalise/domains/translation"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/translationfileparser"
)

const (
	FinalizeArtifactKind = "output"
	SourceArtifactKind   = "source"
)

var (
	ErrNotFound           = translation.ErrNotFound
	ErrConflict           = translation.ErrConflict
	ErrInvalidArgument    = translation.ErrInvalidArgument
	ErrSegmentNotRunnable = translation.ErrSegmentNotRunnable
)

type Clock interface {
	Now() time.Time
}

type Publisher interface {
	PublishExecute(ctx context.Context, msg translation.ExecuteMessage) error
	PublishFinalize(ctx context.Context, jobID string) error
}

type ArtifactStore interface {
	Get(ctx context.Context, uri string) ([]byte, error)
	Put(ctx context.Context, key string, contentType string, payload []byte) (string, error)
}

type Service struct {
	mu                  sync.Mutex
	clock               Clock
	publisher           Publisher
	artifactStore       ArtifactStore
	parserStrategy      *translationfileparser.Strategy
	maxDispatchPerTick  int
	sequence            int
	jobs                map[string]translation.Job
	inputs              map[string]translation.JobInput
	snapshots           map[string]translation.ConfigSnapshot
	segments            map[string][]translation.Segment
	attempts            map[string][]translation.SegmentAttempt
	artifacts           map[string][]translation.JobArtifact
	idempotencyRegistry map[string]idempotencyRecord
	// The outbox keeps persisted intent ahead of transport side effects.
	// TODO: Move this outbox to Postgres and write it in the same transaction as job/segment state.
	outbox []translation.OutboxMessage
}

type idempotencyRecord struct {
	JobID         string
	RequestDigest string
	EffectiveKey  string
}

type realClock struct{}

func (realClock) Now() time.Time {
	return time.Now().UTC()
}

func New(publisher Publisher, artifactStore ArtifactStore) *Service {
	return &Service{
		clock:               realClock{},
		publisher:           publisher,
		artifactStore:       artifactStore,
		parserStrategy:      translationfileparser.NewDefaultStrategy(),
		maxDispatchPerTick:  0,
		jobs:                map[string]translation.Job{},
		inputs:              map[string]translation.JobInput{},
		snapshots:           map[string]translation.ConfigSnapshot{},
		segments:            map[string][]translation.Segment{},
		attempts:            map[string][]translation.SegmentAttempt{},
		artifacts:           map[string][]translation.JobArtifact{},
		idempotencyRegistry: map[string]idempotencyRecord{},
		outbox:              []translation.OutboxMessage{},
	}
}

func (s *Service) WithClock(clock Clock) *Service {
	s.clock = clock
	return s
}

func (s *Service) WithDispatchLimit(limit int) *Service {
	s.maxDispatchPerTick = limit
	return s
}

func (s *Service) CreateTranslationJob(ctx context.Context, input translation.CreateJobInput) (translation.Job, error) {
	if err := validateCreateInput(input); err != nil {
		return translation.Job{}, err
	}

	// Persist job state and outbox intent first; transport publish happens after unlock.
	s.mu.Lock()
	job, err := s.createJobLocked(ctx, input)
	s.mu.Unlock()
	if err != nil {
		return translation.Job{}, err
	}

	if err := s.FlushOutbox(ctx); err != nil {
		return translation.Job{}, err
	}

	return job, nil
}

func (s *Service) GetJob(ctx context.Context, id string) (translation.Job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	job, ok := s.jobs[id]
	if !ok {
		return translation.Job{}, ErrNotFound
	}

	return cloneJob(job), nil
}

func (s *Service) ListTranslationJobs(ctx context.Context, filter translation.JobFilter) ([]translation.Job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	_ = ctx
	items := make([]translation.Job, 0, len(s.jobs))
	for _, job := range s.jobs {
		if filter.ProjectID != "" && job.ProjectID != filter.ProjectID {
			continue
		}
		if filter.Status != "" && job.Status != filter.Status {
			continue
		}
		if filter.TargetLocale != "" && job.TargetLocale != filter.TargetLocale {
			continue
		}
		if !filter.CreatedAfter.IsZero() && !job.CreatedAt.After(filter.CreatedAfter) {
			continue
		}
		items = append(items, cloneJob(job))
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})

	if filter.Limit > 0 && len(items) > filter.Limit {
		items = items[:filter.Limit]
	}

	return items, nil
}

func (s *Service) CancelTranslationJob(ctx context.Context, id string) (translation.Job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	_ = ctx
	job, ok := s.jobs[id]
	if !ok {
		return translation.Job{}, ErrNotFound
	}
	if isTerminalJob(job.Status) {
		return cloneJob(job), nil
	}

	now := s.clock.Now()
	job.Status = translation.StatusCancelRequested
	job.UpdatedAt = now
	s.jobs[id] = job

	return cloneJob(job), nil
}

func (s *Service) StartSegmentAttempt(ctx context.Context, msg translation.ExecuteMessage) (translation.ExecuteMessage, translation.SegmentAttempt, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	_ = ctx
	job, ok := s.jobs[msg.JobID]
	if !ok {
		return translation.ExecuteMessage{}, translation.SegmentAttempt{}, ErrNotFound
	}
	if job.Status == translation.StatusCancelRequested || job.Status == translation.StatusCanceled || isTerminalJob(job.Status) {
		return translation.ExecuteMessage{}, translation.SegmentAttempt{}, ErrSegmentNotRunnable
	}

	segments := s.segments[msg.JobID]
	for idx := range segments {
		if segments[idx].ID != msg.SegmentID {
			continue
		}
		if isTerminalSegment(segments[idx].Status) || segments[idx].Status == translation.SegmentStatusProcessing {
			return translation.ExecuteMessage{}, translation.SegmentAttempt{}, ErrSegmentNotRunnable
		}

		now := s.clock.Now()
		// The worker owns execution, but workflow state transitions remain service-owned.
		segments[idx].Status = translation.SegmentStatusProcessing
		segments[idx].UpdatedAt = now
		s.segments[msg.JobID] = segments

		attempts := s.attempts[msg.SegmentID]
		attempt := translation.SegmentAttempt{
			ID:              s.nextIDLocked("attempt"),
			SegmentID:       msg.SegmentID,
			RetryNumber:     len(attempts) + 1,
			Status:          translation.AttemptStatusRunning,
			ProviderProfile: msg.ProviderProfileID,
			StartedAt:       now,
		}
		s.attempts[msg.SegmentID] = append(attempts, attempt)

		msg.SourceText = segments[idx].SourceText
		msg.Context = segments[idx].Context
		msg.SourceLocale = job.SourceLocale
		msg.TargetLocale = job.TargetLocale
		msg.Attempt = attempt.RetryNumber

		return msg, attempt, nil
	}

	return translation.ExecuteMessage{}, translation.SegmentAttempt{}, ErrNotFound
}

func (s *Service) CompleteSegmentAttempt(ctx context.Context, segmentID string, translatedText string, latency time.Duration) (translation.Job, bool, error) {
	s.mu.Lock()
	job, enqueueFinalize, err := s.completeSegmentAttemptLocked(ctx, segmentID, translatedText, latency)
	s.mu.Unlock()
	if err != nil {
		return translation.Job{}, false, err
	}

	if enqueueFinalize {
		if err := s.FlushOutbox(ctx); err != nil {
			return translation.Job{}, false, err
		}
	}

	return job, enqueueFinalize, nil
}

func (s *Service) FailSegmentAttempt(ctx context.Context, segmentID string, code string, message string, latency time.Duration) (translation.Job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	_ = ctx
	jobID, segmentIdx, attemptIdx, err := s.lookupSegmentAttemptLocked(segmentID)
	if err != nil {
		return translation.Job{}, err
	}

	now := s.clock.Now()
	attempt := s.attempts[segmentID][attemptIdx]
	attempt.Status = translation.AttemptStatusFailed
	attempt.ErrorCode = code
	attempt.ErrorMessage = message
	attempt.LatencyMS = latency.Milliseconds()
	attempt.CompletedAt = &now
	s.attempts[segmentID][attemptIdx] = attempt

	segments := s.segments[jobID]
	segments[segmentIdx].Status = translation.SegmentStatusFailed
	segments[segmentIdx].ErrorCode = code
	segments[segmentIdx].ErrorMessage = message
	segments[segmentIdx].UpdatedAt = now
	segments[segmentIdx].CompletedAt = &now
	s.segments[jobID] = segments

	job := recomputeJob(s.jobs[jobID], segments)
	s.jobs[jobID] = job

	return cloneJob(job), nil
}

func (s *Service) FinalizeJob(ctx context.Context, id string) (translation.Job, error) {
	s.mu.Lock()

	job, ok := s.jobs[id]
	if !ok {
		s.mu.Unlock()
		return translation.Job{}, ErrNotFound
	}
	if isTerminalJob(job.Status) {
		s.mu.Unlock()
		return cloneJob(job), nil
	}

	segments := s.segments[id]
	if !allSegmentsTerminal(segments) {
		s.mu.Unlock()
		return cloneJob(job), nil
	}

	now := s.clock.Now()
	switch {
	case job.Status == translation.StatusCancelRequested:
		job.Status = translation.StatusCanceled
	case hasFailedSegments(segments):
		job.Status = translation.StatusFailed
	default:
		job.Status = translation.StatusCompleted
	}
	job.UpdatedAt = now

	if job.Mode == translation.ModeInline {
		output := make([]translation.InlineOutputItem, 0, len(segments))
		sort.Slice(segments, func(i, j int) bool {
			return segments[i].OrderIndex < segments[j].OrderIndex
		})
		for _, segment := range segments {
			if segment.Status != translation.SegmentStatusSucceeded {
				continue
			}
			output = append(output, translation.InlineOutputItem{
				Key:  segment.SegmentKey,
				Text: segment.OutputText,
			})
		}
		job.InlineOutput = output
		s.jobs[id] = job
		s.mu.Unlock()
		return cloneJob(job), nil
	}

	var encoded []byte
	if job.Mode == translation.ModeArtifact {
		payload := make(map[string]string, len(segments))
		for _, segment := range segments {
			if segment.Status == translation.SegmentStatusSucceeded {
				payload[segment.SegmentKey] = segment.OutputText
			}
		}
		marshaled, err := json.Marshal(payload)
		if err != nil {
			s.mu.Unlock()
			return translation.Job{}, fmt.Errorf("marshal artifact output: %w", err)
		}
		encoded = marshaled
		s.jobs[id] = job
	}
	s.mu.Unlock()

	// Artifact writes are deliberately outside the mutex to avoid stalling all job operations.
	outputURI, err := s.artifactStore.Put(ctx, path.Join("translation-jobs", id, "output.json"), "application/json", encoded)
	if err != nil {
		return translation.Job{}, fmt.Errorf("store artifact output: %w", err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	job, ok = s.jobs[id]
	if !ok {
		return translation.Job{}, ErrNotFound
	}
	if isTerminalJob(job.Status) && job.OutputArtifactURI != "" {
		return cloneJob(job), nil
	}
	job.OutputArtifactURI = outputURI
	s.artifacts[id] = append(s.artifacts[id], translation.JobArtifact{
		JobID:       id,
		Kind:        FinalizeArtifactKind,
		URI:         outputURI,
		Checksum:    checksumBytes(encoded),
		ContentType: "application/json",
		CreatedAt:   now,
	})
	s.jobs[id] = job

	return cloneJob(job), nil
}

func (s *Service) DispatchPendingSegments(ctx context.Context, id string) error {
	s.mu.Lock()
	job, ok := s.jobs[id]
	if !ok {
		s.mu.Unlock()
		return ErrNotFound
	}
	segments := s.segments[id]
	dispatched := 0
	for idx := range segments {
		s.dispatchSegmentLocked(job, &segments[idx], &dispatched)
	}
	s.segments[id] = segments
	s.jobs[id] = recomputeJob(job, segments)
	s.mu.Unlock()

	return s.FlushOutbox(ctx)
}

func (s *Service) Segments(ctx context.Context, jobID string) ([]translation.Segment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_ = ctx

	segments, ok := s.segments[jobID]
	if !ok {
		return nil, ErrNotFound
	}
	result := make([]translation.Segment, len(segments))
	copy(result, segments)
	return result, nil
}

func (s *Service) Attempts(ctx context.Context, segmentID string) ([]translation.SegmentAttempt, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_ = ctx

	attempts := s.attempts[segmentID]
	result := make([]translation.SegmentAttempt, len(attempts))
	copy(result, attempts)
	return result, nil
}

func (s *Service) FlushOutbox(ctx context.Context) error {
	// TODO: Replace this in-memory flush loop with a dedicated dispatcher that drains persisted outbox rows.
	for {
		s.mu.Lock()
		index := -1
		var entry translation.OutboxMessage
		for idx, candidate := range s.outbox {
			if candidate.SentAt == nil {
				index = idx
				entry = candidate
				break
			}
		}
		s.mu.Unlock()

		if index == -1 {
			return nil
		}

		// Publish first, then mark the message and any related segment as sent/dispatched.
		switch entry.Kind {
		case translation.OutboxKindExecute:
			if entry.Execute == nil {
				return fmt.Errorf("outbox execute entry %q missing payload", entry.ID)
			}
			if err := s.publisher.PublishExecute(ctx, *entry.Execute); err != nil {
				return fmt.Errorf("publish execute message: %w", err)
			}
		case translation.OutboxKindFinalize:
			if err := s.publisher.PublishFinalize(ctx, entry.JobID); err != nil {
				return fmt.Errorf("publish finalize message: %w", err)
			}
		default:
			return fmt.Errorf("unknown outbox kind %q", entry.Kind)
		}

		s.mu.Lock()
		now := s.clock.Now()
		for idx := range s.outbox {
			if s.outbox[idx].ID == entry.ID && s.outbox[idx].SentAt == nil {
				s.outbox[idx].SentAt = &now
				break
			}
		}
		if entry.Kind == translation.OutboxKindExecute {
			segments := s.segments[entry.JobID]
			for idx := range segments {
				if segments[idx].ID != entry.SegmentID {
					continue
				}
				segments[idx].Status = translation.SegmentStatusDispatched
				segments[idx].UpdatedAt = now
				segments[idx].DispatchedAt = &now
				break
			}
			s.segments[entry.JobID] = segments
			s.jobs[entry.JobID] = recomputeJob(s.jobs[entry.JobID], segments)
		}
		s.mu.Unlock()
	}
}

func (s *Service) enqueueExecuteLocked(job translation.Job, segment translation.Segment) {
	payload := translation.ExecuteMessage{
		JobID:             job.ID,
		SegmentID:         segment.ID,
		ProviderProfileID: s.snapshots[job.ConfigSnapshotID].ProviderProfile,
	}
	s.outbox = append(s.outbox, translation.OutboxMessage{
		ID:        s.nextIDLocked("outbox"),
		JobID:     job.ID,
		SegmentID: segment.ID,
		Kind:      translation.OutboxKindExecute,
		Execute:   &payload,
		CreatedAt: s.clock.Now(),
	})
}

func (s *Service) enqueueFinalizeLocked(jobID string, now time.Time) {
	for _, entry := range s.outbox {
		if entry.JobID == jobID && entry.Kind == translation.OutboxKindFinalize && entry.SentAt == nil {
			return
		}
	}
	s.outbox = append(s.outbox, translation.OutboxMessage{
		ID:        s.nextIDLocked("outbox"),
		JobID:     jobID,
		Kind:      translation.OutboxKindFinalize,
		CreatedAt: now,
	})
}

func (s *Service) createJobLocked(ctx context.Context, input translation.CreateJobInput) (translation.Job, error) {
	_ = ctx
	now := s.clock.Now()
	mode := translation.ModeInline
	if input.ArtifactPayload != nil {
		mode = translation.ModeArtifact
	}
	// TODO: Artifact planning currently happens inside the service lock because state is in-memory.
	// When persistence is moved to Postgres, split planning I/O from the state write transaction.

	snapshot := newConfigSnapshot(s.nextIDLocked("cfg"), now, input.ProviderProfile, input.ConfigSnapshotInput)
	requestDigest, err := s.requestDigestLocked(input, snapshot.Checksum)
	if err != nil {
		return translation.Job{}, fmt.Errorf("compute request digest: %w", err)
	}
	if key := strings.TrimSpace(input.IdempotencyKey); key != "" {
		dedupeKey := buildDedupeKey(input.CallerScope, input.ProjectID, input.TargetLocale, key)
		if existing, ok := s.idempotencyRegistry[dedupeKey]; ok {
			if existing.RequestDigest != requestDigest {
				return translation.Job{}, translation.ErrConflict
			}
			job := s.jobs[existing.JobID]
			return cloneJob(job), nil
		}
	}

	jobID := s.nextIDLocked("trjob")
	job := translation.Job{
		ID:               jobID,
		ProjectID:        input.ProjectID,
		Status:           translation.StatusQueued,
		Mode:             mode,
		SourceLocale:     input.SourceLocale,
		TargetLocale:     input.TargetLocale,
		ConfigSnapshotID: snapshot.ID,
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	s.snapshots[snapshot.ID] = snapshot

	inputRow := translation.JobInput{
		JobID:     jobID,
		Mode:      mode,
		CreatedAt: now,
	}

	var plannedSegments []translation.Segment
	switch mode {
	case translation.ModeInline:
		inlineChecksum, segments := s.planInlineLocked(jobID, now, *input.InlinePayload)
		inputRow.InlinePayloadChecksum = inlineChecksum
		plannedSegments = segments
	case translation.ModeArtifact:
		// Artifact mode reuses the existing parser strategy to normalize files into segments.
		artifactInput, segments, artifacts, planErr := s.planArtifactLocked(ctx, jobID, now, *input.ArtifactPayload)
		if planErr != nil {
			return translation.Job{}, planErr
		}
		inputRow.ArtifactInputURI = artifactInput.InputURI
		inputRow.ArtifactPath = artifactInput.Path
		inputRow.ArtifactContentType = artifactInput.ContentType
		inputRow.ParserHint = artifactInput.ParserHint
		plannedSegments = segments
		s.artifacts[jobID] = artifacts
		job.SourceArtifactURI = artifactInput.InputURI
	}
	if len(plannedSegments) == 0 {
		return translation.Job{}, fmt.Errorf("%w: artifact produced no translatable segments", ErrInvalidArgument)
	}

	job.ItemCount = len(plannedSegments)
	job.Progress.Total = len(plannedSegments)
	s.jobs[jobID] = job
	s.inputs[jobID] = inputRow
	s.segments[jobID] = plannedSegments

	dispatched := 0
	for idx := range plannedSegments {
		s.dispatchSegmentLocked(job, &plannedSegments[idx], &dispatched)
	}
	s.segments[jobID] = plannedSegments
	s.jobs[jobID] = recomputeJob(job, plannedSegments)

	if key := strings.TrimSpace(input.IdempotencyKey); key != "" {
		dedupeKey := buildDedupeKey(input.CallerScope, input.ProjectID, input.TargetLocale, key)
		s.idempotencyRegistry[dedupeKey] = idempotencyRecord{
			JobID:         jobID,
			RequestDigest: requestDigest,
			EffectiveKey:  key,
		}
	}

	return cloneJob(s.jobs[jobID]), nil
}

func (s *Service) planArtifactLocked(ctx context.Context, jobID string, now time.Time, payload translation.ArtifactPayload) (translation.ArtifactPayload, []translation.Segment, []translation.JobArtifact, error) {
	content, err := s.artifactStore.Get(ctx, payload.InputURI)
	if err != nil {
		return translation.ArtifactPayload{}, nil, nil, fmt.Errorf("load artifact %q: %w", payload.InputURI, err)
	}

	parsePath := strings.TrimSpace(payload.Path)
	if parsePath == "" {
		parsePath = derivePathFromURI(payload.InputURI)
	}
	values, entryContext, err := s.parserStrategy.ParseWithContext(parsePath, content)
	if err != nil {
		return translation.ArtifactPayload{}, nil, nil, fmt.Errorf("parse artifact payload: %w", err)
	}

	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	segments := make([]translation.Segment, 0, len(keys))
	for idx, key := range keys {
		segments = append(segments, translation.Segment{
			ID:         s.nextIDLocked("seg"),
			JobID:      jobID,
			SegmentKey: key,
			SourceText: values[key],
			Context:    entryContext[key],
			OrderIndex: idx,
			Status:     translation.SegmentStatusPending,
			UpdatedAt:  now,
		})
	}

	artifacts := []translation.JobArtifact{
		{
			JobID:       jobID,
			Kind:        SourceArtifactKind,
			URI:         payload.InputURI,
			Checksum:    checksumBytes(content),
			ContentType: payload.ContentType,
			CreatedAt:   now,
		},
	}

	payload.Path = parsePath
	return payload, segments, artifacts, nil
}

func (s *Service) completeSegmentAttemptLocked(ctx context.Context, segmentID string, translatedText string, latency time.Duration) (translation.Job, bool, error) {
	_ = ctx
	jobID, segmentIdx, attemptIdx, err := s.lookupSegmentAttemptLocked(segmentID)
	if err != nil {
		return translation.Job{}, false, err
	}

	now := s.clock.Now()
	attempt := s.attempts[segmentID][attemptIdx]
	attempt.Status = translation.AttemptStatusSucceeded
	attempt.LatencyMS = latency.Milliseconds()
	attempt.CompletedAt = &now
	s.attempts[segmentID][attemptIdx] = attempt

	segments := s.segments[jobID]
	if segments[segmentIdx].Status == translation.SegmentStatusSucceeded {
		return cloneJob(s.jobs[jobID]), false, nil
	}
	segments[segmentIdx].Status = translation.SegmentStatusSucceeded
	segments[segmentIdx].OutputText = translatedText
	segments[segmentIdx].UpdatedAt = now
	segments[segmentIdx].CompletedAt = &now
	s.segments[jobID] = segments

	job := recomputeJob(s.jobs[jobID], segments)
	if allSegmentsTerminal(segments) {
		job.Status = translation.StatusFinalizeQueued
		s.enqueueFinalizeLocked(job.ID, now)
	}
	s.jobs[jobID] = job

	return cloneJob(job), allSegmentsTerminal(segments), nil
}

func (s *Service) lookupSegmentAttemptLocked(segmentID string) (string, int, int, error) {
	for jobID, segments := range s.segments {
		for segmentIdx := range segments {
			if segments[segmentIdx].ID != segmentID {
				continue
			}
			attempts := s.attempts[segmentID]
			if len(attempts) == 0 {
				return "", 0, 0, ErrNotFound
			}
			return jobID, segmentIdx, len(attempts) - 1, nil
		}
	}

	return "", 0, 0, ErrNotFound
}

func (s *Service) dispatchSegmentLocked(job translation.Job, segment *translation.Segment, dispatched *int) {
	if job.Status == translation.StatusCancelRequested || job.Status == translation.StatusCanceled || isTerminalJob(job.Status) {
		return
	}
	if segment.Status != translation.SegmentStatusPending {
		return
	}
	if s.maxDispatchPerTick > 0 && *dispatched >= s.maxDispatchPerTick {
		return
	}
	*dispatched++
	// Dispatch means "ready to publish"; the segment becomes dispatched only after outbox flush succeeds.
	s.enqueueExecuteLocked(job, *segment)
}

func (s *Service) nextIDLocked(prefix string) string {
	s.sequence++
	return fmt.Sprintf("%s_%06d", prefix, s.sequence)
}

func (s *Service) requestDigestLocked(input translation.CreateJobInput, configChecksum string) (string, error) {
	normalized := map[string]any{
		"project_id":      input.ProjectID,
		"source_locale":   input.SourceLocale,
		"target_locale":   input.TargetLocale,
		"provider":        input.ProviderProfile,
		"glossary_id":     input.GlossaryID,
		"style_guide_id":  input.StyleGuideID,
		"config_checksum": configChecksum,
	}
	if input.InlinePayload != nil {
		normalized["inline"] = input.InlinePayload
	}
	if input.ArtifactPayload != nil {
		normalized["artifact"] = input.ArtifactPayload
	}
	payload, err := json.Marshal(normalized)
	if err != nil {
		return "", err
	}
	return checksumBytes(payload), nil
}

func validateCreateInput(input translation.CreateJobInput) error {
	if strings.TrimSpace(input.ProjectID) == "" {
		return fmt.Errorf("%w: projectId is required", translation.ErrInvalidArgument)
	}
	if strings.TrimSpace(input.SourceLocale) == "" {
		return fmt.Errorf("%w: sourceLocale is required", translation.ErrInvalidArgument)
	}
	if strings.TrimSpace(input.TargetLocale) == "" {
		return fmt.Errorf("%w: targetLocale is required", translation.ErrInvalidArgument)
	}
	switch {
	case input.InlinePayload == nil && input.ArtifactPayload == nil:
		return fmt.Errorf("%w: exactly one payload is required", translation.ErrInvalidArgument)
	case input.InlinePayload != nil && input.ArtifactPayload != nil:
		return fmt.Errorf("%w: exactly one payload is required", translation.ErrInvalidArgument)
	}
	if input.InlinePayload != nil && len(input.InlinePayload.Items) == 0 {
		return fmt.Errorf("%w: inlinePayload.items is required", translation.ErrInvalidArgument)
	}
	return nil
}

func newConfigSnapshot(id string, now time.Time, providerProfile string, input translation.ConfigSnapshotInput) translation.ConfigSnapshot {
	settings := cloneStringMap(input.GenerationSettings)
	checksumSource, _ := json.Marshal(map[string]any{
		"profile":  providerProfile,
		"family":   input.ProviderFamily,
		"model":    input.ModelID,
		"prompt":   input.PromptTemplateVersion,
		"glossary": input.GlossaryResolvedVersion,
		"style":    input.StyleGuideResolvedVersion,
		"segment":  input.SegmentationStrategyVersion,
		"policy":   input.ValidationPolicyVersion,
		"settings": settings,
	})
	return translation.ConfigSnapshot{
		ID:                          id,
		Checksum:                    checksumBytes(checksumSource),
		ProviderProfile:             providerProfile,
		ProviderFamily:              input.ProviderFamily,
		ModelID:                     input.ModelID,
		PromptTemplateVersion:       input.PromptTemplateVersion,
		GlossaryResolvedVersion:     input.GlossaryResolvedVersion,
		StyleGuideResolvedVersion:   input.StyleGuideResolvedVersion,
		SegmentationStrategyVersion: input.SegmentationStrategyVersion,
		ValidationPolicyVersion:     input.ValidationPolicyVersion,
		GenerationSettings:          settings,
		CreatedAt:                   now,
	}
}

func (s *Service) planInlineLocked(jobID string, now time.Time, payload translation.InlinePayload) (string, []translation.Segment) {
	items := make([]translation.InlineItem, len(payload.Items))
	copy(items, payload.Items)

	segments := make([]translation.Segment, 0, len(items))
	for idx, item := range items {
		segments = append(segments, translation.Segment{
			ID:         s.nextIDLocked("seg"),
			JobID:      jobID,
			SegmentKey: item.Key,
			SourceText: item.Text,
			Context:    item.Context,
			OrderIndex: idx,
			Status:     translation.SegmentStatusPending,
			UpdatedAt:  now,
		})
	}

	payloadBytes, _ := json.Marshal(items)
	return checksumBytes(payloadBytes), segments
}

func recomputeJob(job translation.Job, segments []translation.Segment) translation.Job {
	progress := translation.Progress{Total: len(segments)}
	dispatched := 0
	for _, segment := range segments {
		switch segment.Status {
		case translation.SegmentStatusSucceeded:
			progress.Succeeded++
		case translation.SegmentStatusFailed:
			progress.Failed++
		case translation.SegmentStatusDispatched, translation.SegmentStatusProcessing:
			dispatched++
		}
	}
	job.ItemCount = len(segments)
	job.Progress = progress
	if job.Status == translation.StatusCancelRequested || isTerminalJob(job.Status) {
		return job
	}
	switch {
	case allSegmentsTerminal(segments):
		job.Status = translation.StatusFinalizeQueued
	case dispatched > 0:
		job.Status = translation.StatusRunning
	default:
		job.Status = translation.StatusQueued
	}
	return job
}

func cloneJob(job translation.Job) translation.Job {
	cloned := job
	cloned.InlineOutput = append([]translation.InlineOutputItem(nil), job.InlineOutput...)
	return cloned
}

func buildDedupeKey(callerScope string, projectID string, targetLocale string, idempotencyKey string) string {
	scope := strings.TrimSpace(callerScope)
	if scope == "" {
		scope = "anonymous"
	}
	return strings.Join([]string{scope, projectID, targetLocale, idempotencyKey}, "::")
}

func checksumBytes(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

func cloneStringMap(input map[string]string) map[string]string {
	if len(input) == 0 {
		return nil
	}
	out := make(map[string]string, len(input))
	for key, value := range input {
		out[key] = value
	}
	return out
}

func derivePathFromURI(raw string) string {
	parsed, err := url.Parse(raw)
	if err == nil && parsed.Path != "" {
		return parsed.Path
	}
	return raw
}

func isTerminalSegment(status string) bool {
	return status == translation.SegmentStatusSucceeded || status == translation.SegmentStatusFailed
}

func isTerminalJob(status string) bool {
	return status == translation.StatusCompleted || status == translation.StatusFailed || status == translation.StatusCanceled
}

func allSegmentsTerminal(segments []translation.Segment) bool {
	if len(segments) == 0 {
		return true
	}
	for _, segment := range segments {
		if !isTerminalSegment(segment.Status) {
			return false
		}
	}
	return true
}

func hasFailedSegments(segments []translation.Segment) bool {
	for _, segment := range segments {
		if segment.Status == translation.SegmentStatusFailed {
			return true
		}
	}
	return false
}
