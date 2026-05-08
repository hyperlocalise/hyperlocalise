package model

import (
	"errors"
	"fmt"
	"net/url"
)

// FineTuningDataset represents a fine-tuning dataset.
type FineTuningDataset struct {
	Identifier string                       `json:"identifier"`
	Status     string                       `json:"status"`
	Progress   int                          `json:"progress"`
	Attributes *FineTuningDatasetAttributes `json:"attributes"`
	CreatedAt  string                       `json:"createdAt"`
	UpdatedAt  string                       `json:"updatedAt"`
	StartedAt  string                       `json:"startedAt"`
	FinishedAt string                       `json:"finishedAt"`
}

// FineTuningDatasetAttributes represents the attributes of a fine-tuning dataset.
// It is used to generate a fine-tuning dataset.
type FineTuningDatasetAttributes struct {
	// Project identifiers from which the dataset will be generated.
	// Note: Required if `tmIds` is not provided.
	ProjectIDs []int `json:"projectIds,omitempty"`
	// TM identifiers from which the dataset will be generated.
	// Note: This parameter is not supported for the prompt with the
	// external configuraion.
	TMIDs []int `json:"tmIds,omitempty"`
	// Purpose of the dataset. Enum: training, validation. Default: training.
	Purpose string `json:"purpose,omitempty"`
	// Start date for dataset generation.
	DateFrom string `json:"dateFrom,omitempty"`
	// End date for dataset generation.
	DateTo string `json:"dateTo,omitempty"`
	// Maximum dataset file size in bytes.
	// Note: If not provided, default limits based on the model will be applied.
	MaxFileSize int `json:"maxFileSize,omitempty"`
	// Minimum number of examples in the dataset.
	// Note: If not provided, default limits based on the model will be applied.
	MinExamplesCount int `json:"minExamplesCount,omitempty"`
	// Maximum number of examples in the dataset.
	// Note: If not provided, default limits based on the model will be applied.
	MaxExamplesCount int `json:"maxExamplesCount,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *FineTuningDatasetAttributes) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if len(r.ProjectIDs) == 0 && len(r.TMIDs) == 0 {
		return errors.New("projectIds or tmIds are required")
	}

	return nil
}

// FineTuningDatasetResponse defines the structure of a response when
// getting a single fine-tuning dataset.
type FineTuningDatasetResponse struct {
	Data *FineTuningDataset `json:"data"`
}

type (
	// FineTuningEvent represents a fine-tuning event.
	FineTuningEvent struct {
		ID        string               `json:"id"`
		Type      string               `json:"type"` // enum: message, metrics
		Message   string               `json:"message"`
		Data      *FineTuningEventData `json:"data,omitempty"`
		CreatedAt string               `json:"createdAt"`
	}

	// FineTuningEventData represents the data of a fine-tuning event.
	FineTuningEventData struct {
		Step               int     `json:"step"`
		TotalSteps         int     `json:"totalSteps"`
		TrainingLoss       float64 `json:"trainingLoss"`
		ValidationLoss     float64 `json:"validationLoss"`
		FullValidationLoss float64 `json:"fullValidationLoss"`
	}
)

// FineTuningEventsListResponse defines the structure of a response when
// getting a list of fine-tuning events.
type FineTuningEventsListResponse struct {
	Data []struct {
		Data *FineTuningEvent `json:"data"`
	} `json:"data"`
}

type (
	// FineTuningJob represents a fine-tuning job.
	FineTuningJob struct {
		Identifier string                   `json:"identifier"`
		Status     string                   `json:"status"`
		Progress   int                      `json:"progress"`
		Attributes *FineTuningJobAttributes `json:"attributes"`
		CreatedAt  string                   `json:"createdAt"`
		UpdatedAt  string                   `json:"updatedAt"`
		StartedAt  string                   `json:"startedAt"`
		FinishedAt string                   `json:"finishedAt"`
	}

	// FineTuningJobAttributes represents the attributes of a fine-tuning job.
	FineTuningJobAttributes struct {
		DryRun               bool                          `json:"dryRun"`
		AIPromptID           int                           `json:"aiPromptId"`
		Hyperparameters      *FineTuningJobHyperparameters `json:"hyperparameters"`
		TrainingOptions      *FineTuningJobOptions         `json:"trainingOptions"`
		ValidationOptions    *FineTuningJobOptions         `json:"validationOptions"`
		BaseModel            string                        `json:"baseModel"`
		FineTunedModel       string                        `json:"fineTunedModel"`
		TrainedTokensCount   int                           `json:"trainedTokensCount"`
		TrainingDatasetURL   string                        `json:"trainingDatasetUrl"`
		ValidationDatasetURL string                        `json:"validationDatasetUrl"`
		Metadata             *FineTuningJobMetadata        `json:"metadata"`
	}

	// FineTuningJobHyperparameters represents the hyperparameters of a fine-tuning job.
	FineTuningJobHyperparameters struct {
		// Number of examples in each batch. A larger batch size means that model
		// parameters are updated less frequently, but with lower variance.
		// Note: This parameter is not supported by Mistral AI.
		BatchSize int `json:"batchSize,omitempty"`
		// Scaling factor for the learning rate. A smaller learning rate may be useful
		// to avoid overfitting. Note: This parameter is not supported by Mistral AI.
		LearningRateMultiplier float64 `json:"learningRateMultiplier,omitempty"`
		// The number of epochs to train the model for. An epoch refers to one full
		// cycle through the training dataset.
		NEpochs int `json:"nEpochs,omitempty"`
	}

	// FineTuningJobOptions represents the options of a fine-tuning job.
	FineTuningJobOptions struct {
		// Project identifiers from which the dataset will be generated.
		// Note: Required if `tmIds` is not provided.
		ProjectIDs []int `json:"projectIds,omitempty"`
		// TM identifiers from which the dataset will be generated.
		// Note: This parameteris not supported for the prompt with
		// external configuraion.
		TMIDs []int `json:"tmIds,omitempty"`
		// Start date for the dataset generation.
		DateFrom string `json:"dateFrom,omitempty"`
		// End date for the dataset generation.
		DateTo string `json:"dateTo,omitempty"`
		// Maximum dataset file size in bytes.
		// Note: If not provided, default limits based on the model will be applied.
		MaxFileSize int `json:"maxFileSize,omitempty"`
		// Minimum number of examples in the dataset.
		// Note: If not provided, default limits based on the model will be applied.
		MinExamplesCount int `json:"minExamplesCount,omitempty"`
		// Maximum number of examples in the dataset.
		// Note: If not provided, default limits based on the model will be applied.
		MaxExamplesCount int `json:"maxExamplesCount,omitempty"`
	}

	// FineTuningJobMetadata represents the metadata of a fine-tuning job.
	FineTuningJobMetadata struct {
		Cost         float64 `json:"cost"`
		CostCurrency string  `json:"costCurrency"`
	}
)

// FineTuningJobResponse defines the structure of a response when
// getting a fine-tuning job.
type FineTuningJobResponse struct {
	Data *FineTuningJob `json:"data"`
}

// FineTuningJobsListResponse defines the structure of a response when
// getting a list of fine-tuning jobs.
type FineTuningJobsListResponse struct {
	Data []*FineTuningJobResponse `json:"data"`
}

// FineTuningJobsListOptions specifies the optional parameters to the
// AIService.ListFineTuningJobs method.
type FineTuningJobsListOptions struct {
	// Filter the collection by the specified status. It can be one status or
	// a list of comma-separated ones.
	// Enum: created, in_progress, canceled, failed, finished.
	Statuses []string `json:"statuses,omitempty"`
	// Sort the collection by the specified field. Example: orderBy=createdAt desc.
	// Enum: createdAt, updatedAt, startedAt, finishedAt.
	OrderBy string `json:"orderBy,omitempty"`

	ListOptions
}

// Values returns the url.Values encoding of FineTuningJobsListOptions.
// It implements the crowdin.ListOptionsProvider interface.
func (o *FineTuningJobsListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()

	if len(o.Statuses) > 0 {
		v.Add("statuses", JoinSlice(o.Statuses))
	}
	if o.OrderBy != "" {
		v.Add("orderBy", o.OrderBy)
	}

	return v, len(v) > 0
}

// FineTuningJobCreateRequest defines the structure of a request to create a fine-tuning job.
type FineTuningJobCreateRequest struct {
	// Options for generating the fine-tuning dataset.
	TrainingOptions *FineTuningJobOptions `json:"trainingOptions"`
	// Options for generating the fine-tuning dataset.
	ValidationOptions *FineTuningJobOptions `json:"validationOptions,omitempty"`
	// The hyperparameters used for the fine-tuning job.
	Hyperparameters *FineTuningJobHyperparameters `json:"hyperparameters,omitempty"`
	// Simulate the fine-tuning of job creation without actually
	// creating them. Default: false.
	DryRun *bool `json:"dryRun,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *FineTuningJobCreateRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.TrainingOptions == nil {
		return errors.New("trainingOptions is required")
	}

	return nil
}

type PromptAction string

const (
	ActionPreTranslate PromptAction = "pre_translate"
	ActionAssist       PromptAction = "assist"
)

type PromptMode string

const (
	ModeBasic    PromptMode = "basic"
	ModeAdvanced PromptMode = "advanced"
)

// Prompt represents an AI prompt.
type Prompt struct {
	ID                int          `json:"id"`
	Name              string       `json:"name"`
	Action            string       `json:"action"`
	AIProviderID      int          `json:"aiProviderId"`
	AIModelID         string       `json:"aiModelId"`
	IsEnabled         bool         `json:"isEnabled"`
	EnabledProjectIDs []int        `json:"enabledProjectIds"`
	Config            PromptConfig `json:"config"`
	CreatedAt         string       `json:"createdAt"`
	UpdatedAt         string       `json:"updatedAt"`
}

type (
	// PromptConfig represents the configuration of an AI prompt.
	PromptConfig struct {
		Mode                      PromptMode                 `json:"mode"`
		CompanyDescription        *string                    `json:"companyDescription,omitempty"`
		ProjectDescription        *string                    `json:"projectDescription,omitempty"`
		AudienceDescription       *string                    `json:"audienceDescription,omitempty"`
		OtherLanguageTranslations *OtherLanguageTranslations `json:"otherLanguageTranslations,omitempty"`
		GlossaryTerms             *bool                      `json:"glossaryTerms,omitempty"`
		TMSuggestions             *bool                      `json:"tmSuggestions,omitempty"`
		FileContent               *bool                      `json:"fileContent,omitempty"`
		FileContext               *bool                      `json:"fileContext,omitempty"`
		PublicProjectDescription  *bool                      `json:"publicProjectDescription,omitempty"`
		SiblingsStrings           *bool                      `json:"siblingsStrings,omitempty"`
		FilteredStrings           *bool                      `json:"filteredStrings,omitempty"`
		Prompt                    *string                    `json:"prompt,omitempty"`
	}

	OtherLanguageTranslations struct {
		IsEnabled   *bool    `json:"isEnabled,omitempty"`
		LanguageIDs []string `json:"languageIds,omitempty"`
	}
)

// PromptResponse defines the structure of a response when
// getting a single AI prompt.
type PromptResponse struct {
	Data *Prompt `json:"data"`
}

// PromptsListResponse defines the structure of a response when
// getting a list of AI prompts.
type PromptsListResponse struct {
	Data []*PromptResponse `json:"data"`
}

// AIPromtsListOptions specifies the optional parameters to the
// AIService.ListPrompts method.
type AIPromtsListOptions struct {
	// Allows to filter the prompts available for the specific action.
	ProjectID int `json:"projectId,omitempty"`
	// Allows to filter the prompts available for the specific action.
	// Enum: pre_translate, assist.
	Action PromptAction `json:"action,omitempty"`

	ListOptions
}

// Values returns the url.Values encoding of AIPromtsListOptions.
// It implements the crowdin.ListOptionsProvider interface.
func (o *AIPromtsListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()

	if o.ProjectID > 0 {
		v.Add("projectId", fmt.Sprintf("%d", o.ProjectID))
	}
	if o.Action != "" {
		v.Add("action", string(o.Action))
	}

	return v, len(v) > 0
}

// PromptAddRequest defines the structure of a request to add an AI prompt.
type PromptAddRequest struct {
	// AI prompt name.
	Name string `json:"name"`
	// AI prompt action. Enum: pre_translate, assist.
	Action PromptAction `json:"action"`
	// AI Provider identifier.
	AIProviderID int `json:"aiProviderId"`
	// AI Model identifier.
	AIModelID string `json:"aiModelId"`
	// Is AI prompt enabled. Default: true.
	IsEnabled *bool `json:"isEnabled,omitempty"`
	// List of enabled project IDs.
	EnabledProjectIDs []int `json:"enabledProjectIds,omitempty"`
	// AI prompt configuration.
	Config PromptConfig `json:"config"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *PromptAddRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.Name == "" {
		return errors.New("name is required")
	}
	if r.Action == "" {
		return errors.New("action is required")
	}
	if r.AIProviderID == 0 {
		return errors.New("aiProviderId is required")
	}
	if r.AIModelID == "" {
		return errors.New("aiModelId is required")
	}
	if r.Config.Mode == "" {
		return errors.New("config.mode is required")
	}

	return nil
}

type ProviderType string

const (
	OpenAI       ProviderType = "open_ai"
	AzureOpenAI  ProviderType = "azure_open_ai"
	GoogleGemini ProviderType = "google_gemini"
	MistralAI    ProviderType = "mistral_ai"
	Anthropic    ProviderType = "anthropic"
	CustomAI     ProviderType = "custom_ai"
)

// Provider represents an AI provider.
type Provider struct {
	ID                   int               `json:"id"`
	Name                 string            `json:"name"`
	Type                 ProviderType      `json:"type"`
	Credentials          map[string]string `json:"credentials"`
	Config               ProviderConfig    `json:"config"`
	IsEnabled            bool              `json:"isEnabled"`
	UseSystemCredentials bool              `json:"useSystemCredentials"`
	CreatedAt            string            `json:"createdAt"`
	UpdatedAt            string            `json:"updatedAt"`
}

// ProviderResponse defines the structure of a response when
// getting a single AI provider.
type ProviderResponse struct {
	Data *Provider `json:"data"`
}

// ProvidersListResponse defines the structure of a response when
// getting a list of AI providers.
type ProvidersListResponse struct {
	Data []*ProviderResponse `json:"data"`
}

// ProviderAddRequest defines the structure of a request to add an AI provider.
type ProviderAddRequest struct {
	// AI provider name.
	Name string `json:"name"`
	// AI provider type.
	// Enum: open_ai, azure_open_ai, google_gemini, mistral_ai, anthropic, custom_ai.
	Type ProviderType `json:"type"`
	// User’s own AI provider credentials.
	// Note: Use only if useSystemCredentials is set to `false`.
	Credentials map[string]string `json:"credentials,omitempty"`
	// AI provider configuration.
	Config ProviderConfig `json:"config,omitempty"`
	// Defines whether to AI provider is enabled. Default: true.
	IsEnabled *bool `json:"isEnabled,omitempty"`
	// Enables the paid service AI provider via Crowdin.
	// Note: Set to true if `credentials` is not provided. Not supported
	// for `custom_ai` type.
	UseSystemCredentials *bool `json:"useSystemCredentials,omitempty"`
}

// ProviderConfig represents the configuration of an AI provider.
type ProviderConfig struct {
	// Action rules.
	ActionRules []ActionRule `json:"actionRules"`
}

// ActionRule represents an action rule of an AI provider.
type ActionRule struct {
	// Action name.
	Action PromptAction `json:"action"`
	// Available AI provider model ids.
	AvailableAIModelIDs []string `json:"availableAiModelIds"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *ProviderAddRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.Name == "" {
		return errors.New("name is required")
	}
	if r.Type == "" {
		return errors.New("type is required")
	}

	return nil
}

// ProviderModel represents an AI provider model.
type ProviderModel struct {
	ID string `json:"id"`
}

// ProviderModelResponse defines the structure of a response when
// getting an AI provider model.
type ProviderModelResponse struct {
	Data *ProviderModel `json:"data"`
}

// ProviderModelsListResponse defines the structure of a response when
// getting a list of AI provider models.
type ProviderModelsListResponse struct {
	Data []*ProviderModelResponse `json:"data"`
}

// ProxyChatCompletion represents an AI proxy chat completion.
type ProxyChatCompletion struct{}

// ProxyChatCompletionResponse defines the structure of a response when
// getting an AI proxy chat completion.
type ProxyChatCompletionResponse struct {
	Data *ProxyChatCompletion `json:"data"`
}

// CreateProxyChatCompletionRequest defines the structure of a request
// to create an AI proxy chat completion.
type CreateProxyChatCompletionRequest struct {
	// ID of the model to use.
	ModelID string `json:"modelId,omitempty"`
	// Tokens will be sent as data-only server-sent events as they become available,
	// with the stream terminated by a data: [DONE] message.
	Stream *bool `json:"stream,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *CreateProxyChatCompletionRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}

	return nil
}
