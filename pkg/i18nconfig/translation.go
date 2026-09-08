package config

import (
	"fmt"
	"strings"
)

const (
	TranslationTypeLLM = "llm"
	TranslationTypeMT  = "mt"

	mtProviderGoogle = "google"
	mtProviderDeepL  = "deepl"
)

type TranslationConfig struct {
	Default TranslationSelection `json:"default" jsonschema:"required"`
	Rules   []TranslationRule    `json:"rules,omitempty"`
}

type TranslationSelection struct {
	Type    string `json:"type" jsonschema:"required"`
	Profile string `json:"profile" jsonschema:"required"`
}

type TranslationRule struct {
	Priority int    `json:"priority" jsonschema:"required"`
	Group    string `json:"group" jsonschema:"required"`
	Type     string `json:"type" jsonschema:"required"`
	Profile  string `json:"profile" jsonschema:"required"`
}

type MTConfig struct {
	Profiles map[string]MTProfile `json:"profiles" jsonschema:"required"`
}

// MTProfile stores environment variable names.
type MTProfile struct {
	Provider           string `json:"provider" jsonschema:"required"`
	APIKeyEnv          string `json:"api_key_env,omitempty"`
	SubscriptionKeyEnv string `json:"subscription_key_env,omitempty"`
	AccessKeyIDEnv     string `json:"access_key_id_env,omitempty"`
	SecretAccessKeyEnv string `json:"secret_access_key_env,omitempty"`
	SessionTokenEnv    string `json:"session_token_env,omitempty"`
	Region             string `json:"region,omitempty"`
	BaseURL            string `json:"base_url,omitempty"`
	CustomModel        string `json:"custom_model,omitempty"`
}

func (c I18NConfig) validateMT() error {
	if c.MT == nil {
		return nil
	}

	if len(c.MT.Profiles) == 0 {
		return fmt.Errorf("mt.profiles: must not be empty")
	}

	for profileName, profile := range c.MT.Profiles {
		if strings.TrimSpace(profileName) == "" {
			return fmt.Errorf("mt.profiles: profile name must not be empty")
		}

		if err := validateMTProfile("mt.profiles."+profileName, profile); err != nil {
			return err
		}
	}

	return nil
}

func validateMTProfile(fieldPrefix string, profile MTProfile) error {
	provider := strings.ToLower(strings.TrimSpace(profile.Provider))
	if provider == "" {
		return fmt.Errorf("%s.provider: must not be empty", fieldPrefix)
	}

	switch provider {
	case mtProviderGoogle:
		if strings.TrimSpace(profile.APIKeyEnv) == "" {
			return fmt.Errorf("%s.api_key_env: must not be empty", fieldPrefix)
		}
	case mtProviderDeepL:
		if strings.TrimSpace(profile.APIKeyEnv) == "" {
			return fmt.Errorf("%s.api_key_env: must not be empty", fieldPrefix)
		}
		if strings.TrimSpace(profile.BaseURL) == "" {
			return fmt.Errorf("%s.base_url: must not be empty", fieldPrefix)
		}
	default:
		return fmt.Errorf("%s.provider: unsupported provider %q", fieldPrefix, profile.Provider)
	}

	return nil
}

func (c I18NConfig) validateTranslation(groupSet map[string]struct{}) error {
	if c.Translation == nil {
		return nil
	}

	if len(c.Translation.Rules) > 0 && len(c.LLM.Rules) > 0 {
		return fmt.Errorf("translation.rules: must not be combined with llm.rules; migrate llm.rules entries to translation.rules")
	}

	if err := validateTranslationSelection("translation.default", c.Translation.Default, c.LLM.Profiles, c.MT); err != nil {
		return err
	}

	seenPriorityByGroup := make(map[string]map[int]struct{}, len(c.Translation.Rules))

	for i, rule := range c.Translation.Rules {
		if err := c.validateTranslationRule(i, rule, groupSet, seenPriorityByGroup); err != nil {
			return err
		}
	}

	return nil
}

func validateTranslationSelection(fieldPrefix string, selection TranslationSelection, llmProfiles map[string]LLMProfile, mtCfg *MTConfig) error {
	selectionType := strings.ToLower(strings.TrimSpace(selection.Type))
	if selectionType == "" {
		return fmt.Errorf("%s.type: must not be empty", fieldPrefix)
	}

	if strings.TrimSpace(selection.Profile) == "" {
		return fmt.Errorf("%s.profile: must not be empty", fieldPrefix)
	}

	switch selectionType {
	case TranslationTypeLLM:
		if _, exists := llmProfiles[selection.Profile]; !exists {
			return fmt.Errorf("%s.profile: unknown llm profile %q", fieldPrefix, selection.Profile)
		}
	case TranslationTypeMT:
		if mtCfg == nil {
			return fmt.Errorf("%s.profile: unknown mt profile %q", fieldPrefix, selection.Profile)
		}
		if _, exists := mtCfg.Profiles[selection.Profile]; !exists {
			return fmt.Errorf("%s.profile: unknown mt profile %q", fieldPrefix, selection.Profile)
		}
	default:
		return fmt.Errorf("%s.type: unsupported type %q", fieldPrefix, selection.Type)
	}

	return nil
}

func (c I18NConfig) validateTranslationRule(index int, rule TranslationRule, groupSet map[string]struct{}, seenPriorityByGroup map[string]map[int]struct{}) error {
	if rule.Priority < 0 {
		return fmt.Errorf("translation.rules[%d].priority: must be >= 0", index)
	}

	if strings.TrimSpace(rule.Group) == "" {
		return fmt.Errorf("translation.rules[%d].group: must not be empty", index)
	}

	if _, exists := groupSet[rule.Group]; !exists {
		return fmt.Errorf("translation.rules[%d].group: unknown group %q", index, rule.Group)
	}

	selection := TranslationSelection{Type: rule.Type, Profile: rule.Profile}
	if err := validateTranslationSelection(fmt.Sprintf("translation.rules[%d]", index), selection, c.LLM.Profiles, c.MT); err != nil {
		return err
	}

	groupPriorities, ok := seenPriorityByGroup[rule.Group]
	if !ok {
		groupPriorities = make(map[int]struct{})
		seenPriorityByGroup[rule.Group] = groupPriorities
	}

	if _, exists := groupPriorities[rule.Priority]; exists {
		return fmt.Errorf("translation.rules[%d].priority: duplicate priority %d for group %q", index, rule.Priority, rule.Group)
	}

	groupPriorities[rule.Priority] = struct{}{}

	return nil
}
