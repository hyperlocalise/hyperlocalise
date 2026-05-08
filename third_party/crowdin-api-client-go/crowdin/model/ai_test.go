package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestFineTuningDatasetAttributesValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *FineTuningDatasetAttributes
		err   string
		valid bool
	}{
		{
			name: "nil request",
			req:  nil,
			err:  "request cannot be nil",
		},
		{
			name: "empty projectIds and tmIds",
			req:  &FineTuningDatasetAttributes{},
			err:  "projectIds or tmIds are required",
		},
		{
			name: "valid request",
			req: &FineTuningDatasetAttributes{
				ProjectIDs:       []int{1, 2},
				TMIDs:            []int{3, 4},
				Purpose:          "training",
				DateFrom:         "2024-09-23T11:26:54+00:00",
				DateTo:           "2024-09-23T11:26:54+00:00",
				MaxFileSize:      100,
				MinExamplesCount: 10,
				MaxExamplesCount: 100,
			},
			valid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.req.Validate(); tt.valid {
				assert.NoError(t, err)
			} else {
				assert.EqualError(t, err, tt.err)
			}
		})
	}
}

func TestFineTuningJobsListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opt  *FineTuningJobsListOptions
		out  string
	}{
		{
			name: "nil options",
			opt:  nil,
		},
		{
			name: "empty options",
			opt:  &FineTuningJobsListOptions{},
		},
		{
			name: "with one status",
			opt:  &FineTuningJobsListOptions{Statuses: []string{"created"}},
			out:  "statuses=created",
		},
		{
			name: "with multiple statuses",
			opt:  &FineTuningJobsListOptions{Statuses: []string{"created", "finished"}},
			out:  "statuses=created%2Cfinished",
		},
		{
			name: "with orderBy",
			opt:  &FineTuningJobsListOptions{OrderBy: "createdAt"},
			out:  "orderBy=createdAt",
		},
		{
			name: "with all options",
			opt: &FineTuningJobsListOptions{Statuses: []string{"in_progress"}, OrderBy: "createdAt",
				ListOptions: ListOptions{Limit: 10, Offset: 20}},
			out: "limit=10&offset=20&orderBy=createdAt&statuses=in_progress",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			v, ok := tt.opt.Values()
			if len(tt.out) > 0 {
				assert.True(t, ok)
				assert.Equal(t, tt.out, v.Encode())
			} else {
				assert.False(t, ok)
				assert.Empty(t, v)
			}
		})
	}
}

func TestFineTuningJobCreateRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *FineTuningJobCreateRequest
		err   string
		valid bool
	}{
		{
			name: "nil request",
			req:  nil,
			err:  "request cannot be nil",
		},
		{
			name: "empty trainingOptions",
			req:  &FineTuningJobCreateRequest{},
			err:  "trainingOptions is required",
		},
		{
			name: "valid request",
			req: &FineTuningJobCreateRequest{
				TrainingOptions: &FineTuningJobOptions{},
			},
			valid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.req.Validate(); tt.valid {
				assert.NoError(t, err)
			} else {
				assert.EqualError(t, err, tt.err)
			}
		})
	}
}

func TestAIPromtsListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opt  *AIPromtsListOptions
		out  string
	}{
		{
			name: "nil options",
			opt:  nil,
		},
		{
			name: "empty options",
			opt:  &AIPromtsListOptions{},
		},
		{
			name: "with project ID",
			opt:  &AIPromtsListOptions{ProjectID: 1},
			out:  "projectId=1",
		},
		{
			name: "with action",
			opt:  &AIPromtsListOptions{Action: ActionAssist},
			out:  "action=assist",
		},
		{
			name: "with all options",
			opt:  &AIPromtsListOptions{ProjectID: 2, Action: ActionPreTranslate},
			out:  "action=pre_translate&projectId=2",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			v, ok := tt.opt.Values()
			if len(tt.out) > 0 {
				assert.True(t, ok)
				assert.Equal(t, tt.out, v.Encode())
			} else {
				assert.False(t, ok)
				assert.Empty(t, v)
			}
		})
	}
}

func TestPromptAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *PromptAddRequest
		err   string
		valid bool
	}{
		{
			name: "nil request",
			req:  nil,
			err:  "request cannot be nil",
		},
		{
			name: "empty name",
			req:  &PromptAddRequest{},
			err:  "name is required",
		},
		{
			name: "empty action",
			req:  &PromptAddRequest{Name: "Pre-translate prompt"},
			err:  "action is required",
		},
		{
			name: "empty aiProviderId",
			req:  &PromptAddRequest{Name: "Pre-translate prompt", Action: "pre_translate"},
			err:  "aiProviderId is required",
		},
		{
			name: "empty aiModelId",
			req:  &PromptAddRequest{Name: "Pre-translate prompt", Action: "pre_translate", AIProviderID: 1},
			err:  "aiModelId is required",
		},
		{
			name: "empty config mode",
			req: &PromptAddRequest{Name: "Pre-translate prompt", Action: "pre_translate", AIProviderID: 1,
				AIModelID: "gpt-3.5-turbo-instruct", Config: PromptConfig{},
			},
			err: "config.mode is required",
		},
		{
			name: "valid request",
			req: &PromptAddRequest{Name: "Pre-translate prompt", Action: "pre_translate", AIProviderID: 1,
				AIModelID: "gpt-3.5-turbo-instruct", Config: PromptConfig{Mode: "turbo"}},
			valid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.req.Validate(); tt.valid {
				assert.NoError(t, err)
			} else {
				assert.EqualError(t, err, tt.err)
			}
		})
	}
}

func TestProviderAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *ProviderAddRequest
		err   string
		valid bool
	}{
		{
			name: "nil request",
			req:  nil,
			err:  "request cannot be nil",
		},
		{
			name: "empty name",
			req:  &ProviderAddRequest{},
			err:  "name is required",
		},
		{
			name: "empty type",
			req:  &ProviderAddRequest{Name: "OpenAI"},
			err:  "type is required",
		},
		{
			name: "valid request",
			req: &ProviderAddRequest{
				Name:        "OpenAI",
				Type:        OpenAI,
				Credentials: map[string]string{"api_key": "value123"},
				Config: ProviderConfig{
					ActionRules: []ActionRule{
						{
							Action: "pre_translate", AvailableAIModelIDs: []string{"gpt-3.5-turbo-instruct"},
						},
					},
				},
				IsEnabled:            toPtr(true),
				UseSystemCredentials: toPtr(false),
			},
			valid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.req.Validate(); tt.valid {
				assert.NoError(t, err)
			} else {
				assert.EqualError(t, err, tt.err)
			}
		})
	}
}

func TestCreateProxyChatCompletionRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *CreateProxyChatCompletionRequest
		err   string
		valid bool
	}{
		{
			name: "nil request",
			req:  nil,
			err:  "request cannot be nil",
		},
		{
			name:  "valid request",
			req:   &CreateProxyChatCompletionRequest{ModelID: "gpt-3.5-turbo-instruct", Stream: toPtr(false)},
			valid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.req.Validate(); tt.valid {
				assert.NoError(t, err)
			} else {
				assert.EqualError(t, err, tt.err)
			}
		})
	}
}
