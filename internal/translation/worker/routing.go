package worker

import (
	"fmt"
	"sort"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translator"
)

const (
	metadataBudgetTargetKey = "budget_target"
)

// TranslationTask contains all fields needed for routing and translation.
type TranslationTask struct {
	ProjectID      string
	SourceText     string
	SourceLocale   string
	TargetLocale   string
	RuntimeContext string
	Metadata       map[string]string
}

// RoutingDecision captures why provider/model was chosen for a task.
type RoutingDecision struct {
	Provider string
	Model    string
	Reasons  []string
}

type modelCapability struct {
	Name         string
	QualityScore int
	CostScore    int
}

type providerCapability struct {
	Name              string
	LanguagePairAllow map[string]struct{}
	Models            []modelCapability
}

type routePreference struct {
	PreferredProviders []string
	MinQualityScore    int
	MaxCostScore       int
}

type languagePairPolicy struct {
	Pair          string
	BudgetTargets map[string]routePreference
	Default       routePreference
}

type policyEngine struct {
	registry          []providerCapability
	policies          map[string]languagePairPolicy
	globalBudgetRules map[string]routePreference
	fallbackRoute     RoutingDecision
}

func newDefaultPolicyEngine(defaultProvider, defaultModel string) (*policyEngine, error) {
	registry := defaultProviderRegistry()

	pairPolicies := []languagePairPolicy{
		{
			Pair: "en->ja",
			BudgetTargets: map[string]routePreference{
				"economy": {PreferredProviders: []string{"gemini"}, MinQualityScore: 70, MaxCostScore: 2},
				"premium": {PreferredProviders: []string{"anthropic", "openai"}, MinQualityScore: 90, MaxCostScore: 5},
			},
			Default: routePreference{PreferredProviders: []string{"openai", "anthropic", "gemini"}, MinQualityScore: 80, MaxCostScore: 4},
		},
		{
			Pair: "en->de",
			BudgetTargets: map[string]routePreference{
				"economy": {PreferredProviders: []string{"openai", "gemini"}, MinQualityScore: 75, MaxCostScore: 2},
				"premium": {PreferredProviders: []string{"openai", "anthropic"}, MinQualityScore: 90, MaxCostScore: 5},
			},
			Default: routePreference{PreferredProviders: []string{"openai", "gemini", "anthropic"}, MinQualityScore: 80, MaxCostScore: 4},
		},
	}

	policies := make(map[string]languagePairPolicy, len(pairPolicies))
	for _, policy := range pairPolicies {
		policies[policy.Pair] = policy
	}

	provider, ok := findProviderInRegistry(registry, defaultProvider)
	if !ok {
		return nil, fmt.Errorf("translation worker: fallback provider %q is not registered", defaultProvider)
	}

	if _, ok := findModelCapability(provider.Models, defaultModel); !ok {
		return nil, fmt.Errorf("translation worker: fallback model %q is not registered for provider %q", defaultModel, defaultProvider)
	}

	return &policyEngine{
		registry: registry,
		policies: policies,
		globalBudgetRules: map[string]routePreference{
			"economy":  {PreferredProviders: []string{defaultProvider}, MinQualityScore: 0, MaxCostScore: 2},
			"balanced": {PreferredProviders: []string{defaultProvider}, MinQualityScore: 0, MaxCostScore: 5},
			"premium":  {PreferredProviders: []string{defaultProvider}, MinQualityScore: 90, MaxCostScore: 5},
		},
		fallbackRoute: RoutingDecision{
			Provider: defaultProvider,
			Model:    defaultModel,
			Reasons: []string{
				"fallback route from worker configuration",
			},
		},
	}, nil
}

func defaultProviderRegistry() []providerCapability {
	return []providerCapability{
		{
			Name:   translator.ProviderOpenAI,
			Models: []modelCapability{{Name: "gpt-4o-mini", QualityScore: 80, CostScore: 2}, {Name: "gpt-4.1", QualityScore: 96, CostScore: 4}},
		},
		{
			Name:   translator.ProviderAzureOpenAI,
			Models: []modelCapability{{Name: "gpt-4o-mini", QualityScore: 80, CostScore: 2}, {Name: "gpt-4.1", QualityScore: 96, CostScore: 4}},
		},
		{
			Name:   translator.ProviderAnthropic,
			Models: []modelCapability{{Name: "claude-3-5-haiku", QualityScore: 82, CostScore: 2}, {Name: "claude-3-7-sonnet", QualityScore: 95, CostScore: 4}},
		},
		{
			Name:   translator.ProviderGemini,
			Models: []modelCapability{{Name: "gemini-2.0-flash", QualityScore: 78, CostScore: 1}, {Name: "gemini-2.5-pro", QualityScore: 94, CostScore: 4}},
		},
		{
			Name:   translator.ProviderBedrock,
			Models: []modelCapability{{Name: "claude-3-5-haiku", QualityScore: 82, CostScore: 2}, {Name: "claude-3-7-sonnet", QualityScore: 95, CostScore: 4}},
		},
		{
			Name:   translator.ProviderGroq,
			Models: []modelCapability{{Name: "llama-3.1-8b-instant", QualityScore: 76, CostScore: 1}, {Name: "llama-3.3-70b-versatile", QualityScore: 88, CostScore: 3}},
		},
		{
			Name:   translator.ProviderMistral,
			Models: []modelCapability{{Name: "mistral-small-latest", QualityScore: 80, CostScore: 2}, {Name: "mistral-large-latest", QualityScore: 91, CostScore: 4}},
		},
	}
}

func (p *policyEngine) Select(task TranslationTask) RoutingDecision {
	sourceLocale := normalizeLocalePolicyKey(task.SourceLocale)
	targetLocale := normalizeLocalePolicyKey(task.TargetLocale)
	pairKey := sourceLocale + "->" + targetLocale
	budgetTarget := strings.ToLower(strings.TrimSpace(task.Metadata[metadataBudgetTargetKey]))
	if budgetTarget == "" {
		budgetTarget = "balanced"
	}

	reasons := []string{fmt.Sprintf("evaluated language pair policy for %s", pairKey), fmt.Sprintf("budget target=%s", budgetTarget)}
	preference := p.getBudgetRule(budgetTarget)
	if policy, ok := p.policies[pairKey]; ok {
		if rule, ok := policy.BudgetTargets[budgetTarget]; ok {
			preference = rule
			reasons = append(reasons, "matched language-pair budget policy")
		} else {
			preference = policy.Default
			reasons = append(reasons, "used language-pair default policy")
		}
	} else {
		reasons = append(reasons, fmt.Sprintf("no specific language-pair policy; applied global budget rule for %s", budgetTarget))
	}

	for _, providerName := range preference.PreferredProviders {
		provider, ok := p.findProvider(providerName)
		if !ok {
			reasons = append(reasons, fmt.Sprintf("provider %s missing from capability registry", providerName))
			continue
		}
		if !providerSupportsPair(provider, pairKey) {
			reasons = append(reasons, fmt.Sprintf("provider %s does not support %s", provider.Name, pairKey))
			continue
		}
		model, ok := selectModel(provider.Models, preference.MinQualityScore, preference.MaxCostScore)
		if !ok {
			reasons = append(reasons, fmt.Sprintf("provider %s has no model meeting quality/cost guardrails", provider.Name))
			continue
		}

		reasons = append(reasons, fmt.Sprintf("selected %s/%s from capability registry", provider.Name, model.Name))
		return RoutingDecision{Provider: provider.Name, Model: model.Name, Reasons: reasons}
	}

	reasons = append(reasons, fmt.Sprintf("fallback to configured route %s/%s", p.fallbackRoute.Provider, p.fallbackRoute.Model))
	return RoutingDecision{Provider: p.fallbackRoute.Provider, Model: p.fallbackRoute.Model, Reasons: reasons}
}

func (p *policyEngine) findProvider(providerName string) (providerCapability, bool) {
	return findProviderInRegistry(p.registry, providerName)
}

func (p *policyEngine) getBudgetRule(budgetTarget string) routePreference {
	if rule, ok := p.globalBudgetRules[budgetTarget]; ok {
		return rule
	}

	return routePreference{PreferredProviders: []string{p.fallbackRoute.Provider}, MinQualityScore: 0, MaxCostScore: 5}
}

func providerSupportsPair(provider providerCapability, pair string) bool {
	if len(provider.LanguagePairAllow) == 0 {
		return true
	}
	_, ok := provider.LanguagePairAllow[pair]
	return ok
}

func selectModel(models []modelCapability, minQualityScore, maxCostScore int) (modelCapability, bool) {
	candidates := make([]modelCapability, 0, len(models))
	for _, model := range models {
		if model.QualityScore < minQualityScore {
			continue
		}
		if model.CostScore > maxCostScore {
			continue
		}
		candidates = append(candidates, model)
	}
	if len(candidates) == 0 {
		return modelCapability{}, false
	}

	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].QualityScore == candidates[j].QualityScore {
			return candidates[i].CostScore < candidates[j].CostScore
		}
		return candidates[i].QualityScore > candidates[j].QualityScore
	})
	return candidates[0], true
}

func findProviderInRegistry(registry []providerCapability, providerName string) (providerCapability, bool) {
	for _, provider := range registry {
		if provider.Name == providerName {
			return provider, true
		}
	}
	return providerCapability{}, false
}

func findModelCapability(models []modelCapability, modelName string) (modelCapability, bool) {
	for _, model := range models {
		if model.Name == modelName {
			return model, true
		}
	}
	return modelCapability{}, false
}

func normalizeLocalePolicyKey(locale string) string {
	normalized := strings.ToLower(strings.TrimSpace(locale))
	if normalized == "" {
		return ""
	}

	parts := strings.FieldsFunc(normalized, func(r rune) bool {
		return r == '-' || r == '_'
	})
	if len(parts) == 0 {
		return ""
	}

	return parts[0]
}
