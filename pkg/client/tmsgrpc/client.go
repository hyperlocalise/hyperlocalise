package tmsgrpc

import (
	"context"
	"errors"
	"time"

	openapi "github.com/quiet-circles/hyperlocalise/pkg/api/openapi"
)

var ErrNotFound = errors.New("resource not found")

type Backend interface {
	ListProjects(ctx context.Context) ([]openapi.Project, error)
	ListResources(ctx context.Context) ([]openapi.Resource, error)
	ListJobs(ctx context.Context) ([]openapi.Job, error)
	CreateJob(ctx context.Context, req openapi.CreateJobRequest) (openapi.Job, error)
	ListTranslationMemory(ctx context.Context) ([]openapi.TranslationMemoryEntry, error)
	ListGlossaries(ctx context.Context) ([]openapi.Glossary, error)
	ListWorkflows(ctx context.Context) ([]openapi.Workflow, error)
}

type StubBackend struct{}

func NewStubBackend() *StubBackend {
	return &StubBackend{}
}

func (b *StubBackend) ListProjects(context.Context) ([]openapi.Project, error) {
	return []openapi.Project{
		{
			ID:            "proj_demo",
			Key:           "demo",
			Name:          "Demo Project",
			SourceLocale:  "en",
			TargetLocales: []string{"fr", "de", "vi"},
		},
	}, nil
}

func (b *StubBackend) ListResources(context.Context) ([]openapi.Resource, error) {
	return []openapi.Resource{
		{
			ID:        "res_homepage",
			ProjectID: "proj_demo",
			Path:      "content/homepage.json",
			Format:    "json",
		},
	}, nil
}

func (b *StubBackend) ListJobs(context.Context) ([]openapi.Job, error) {
	return []openapi.Job{
		{
			ID:        "job_seed",
			Kind:      "translation.sync",
			Status:    "completed",
			ProjectID: "proj_demo",
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
		},
	}, nil
}

func (b *StubBackend) CreateJob(_ context.Context, req openapi.CreateJobRequest) (openapi.Job, error) {
	if req.ProjectID == "" {
		return openapi.Job{}, errors.New("projectId is required")
	}

	if req.Kind == "" {
		return openapi.Job{}, errors.New("kind is required")
	}

	return openapi.Job{
		ID:        "job_queued",
		Kind:      req.Kind,
		Status:    "queued",
		ProjectID: req.ProjectID,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func (b *StubBackend) ListTranslationMemory(context.Context) ([]openapi.TranslationMemoryEntry, error) {
	return []openapi.TranslationMemoryEntry{
		{
			ID:           "tm_hello_fr",
			SourceLocale: "en",
			TargetLocale: "fr",
			SourceText:   "Hello world",
			TargetText:   "Bonjour le monde",
		},
	}, nil
}

func (b *StubBackend) ListGlossaries(context.Context) ([]openapi.Glossary, error) {
	return []openapi.Glossary{
		{
			ID:           "gl_product",
			Name:         "Product Terms",
			SourceLocale: "en",
		},
	}, nil
}

func (b *StubBackend) ListWorkflows(context.Context) ([]openapi.Workflow, error) {
	return []openapi.Workflow{
		{
			ID:    "wf_release",
			Name:  "Release Localization",
			State: "active",
		},
	}, nil
}
