package elevenlabs

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"sort"
	"strings"
)

const (
	pronunciationRulesPath = "/v1/pronunciation-dictionaries/add-from-rules"
	// MaxPronunciationLocators is how many dictionaries one speech request takes.
	MaxPronunciationLocators = 3
)

// PronunciationRule says a term the way it is written in Alias. Alias rules
// work on every speech model, where phoneme rules work on a few.
type PronunciationRule struct {
	Term          string
	Alias         string
	CaseSensitive bool
}

// PronunciationLocator names one version of a pronunciation dictionary.
type PronunciationLocator struct {
	ID        string `json:"pronunciation_dictionary_id"`
	VersionID string `json:"version_id,omitempty"`
}

type pronunciationRulePayload struct {
	StringToReplace string `json:"string_to_replace"`
	Type            string `json:"type"`
	Alias           string `json:"alias"`
	CaseSensitive   bool   `json:"case_sensitive"`
	WordBoundaries  bool   `json:"word_boundaries"`
}

type pronunciationDictionaryResponse struct {
	ID        string `json:"id"`
	VersionID string `json:"version_id"`
}

// PronunciationDictionary returns a dictionary holding exactly these rules,
// creating it the first time this client sees the set. Dictionaries are
// immutable once made here, so the same rules always resolve to the same
// locator. No rules is no dictionary: ok is false.
func (c *Client) PronunciationDictionary(ctx context.Context, rules []PronunciationRule) (PronunciationLocator, bool, error) {
	payload := pronunciationRulePayloads(rules)
	if len(payload) == 0 {
		return PronunciationLocator{}, false, nil
	}
	key := pronunciationRulesKey(payload)
	c.dictionariesMu.Lock()
	cached, ok := c.dictionaries[key]
	c.dictionariesMu.Unlock()
	if ok {
		return cached, true, nil
	}
	var created pronunciationDictionaryResponse
	if err := c.doJSON(ctx, http.MethodPost, pronunciationRulesPath, map[string]any{
		"name":  "hyperlocalise-" + key[:16],
		"rules": payload,
	}, &created); err != nil {
		return PronunciationLocator{}, false, err
	}
	if strings.TrimSpace(created.ID) == "" {
		return PronunciationLocator{}, false, newError(ErrorCodeInvalidResponse, "ElevenLabs returned no pronunciation dictionary id", pronunciationRulesPath, 0)
	}
	locator := PronunciationLocator(created)
	c.dictionariesMu.Lock()
	c.dictionaries[key] = locator
	c.dictionariesMu.Unlock()
	return locator, true, nil
}

// pronunciationRulePayloads drops empty and self-referencing rules and keeps
// the first rule for each term, longest terms first so a phrase wins over a
// word inside it.
func pronunciationRulePayloads(rules []PronunciationRule) []pronunciationRulePayload {
	out := make([]pronunciationRulePayload, 0, len(rules))
	seen := map[string]bool{}
	for _, rule := range rules {
		term := strings.TrimSpace(rule.Term)
		alias := strings.TrimSpace(rule.Alias)
		if term == "" || alias == "" || alias == term {
			continue
		}
		key := term
		if !rule.CaseSensitive {
			key = strings.ToLower(term)
		}
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, pronunciationRulePayload{
			StringToReplace: term,
			Type:            "alias",
			Alias:           alias,
			CaseSensitive:   rule.CaseSensitive,
			WordBoundaries:  true,
		})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if len(out[i].StringToReplace) != len(out[j].StringToReplace) {
			return len(out[i].StringToReplace) > len(out[j].StringToReplace)
		}
		return out[i].StringToReplace < out[j].StringToReplace
	})
	return out
}

func pronunciationRulesKey(rules []pronunciationRulePayload) string {
	hash := sha256.New()
	for _, rule := range rules {
		hash.Write([]byte(rule.StringToReplace))
		hash.Write([]byte{0})
		hash.Write([]byte(rule.Alias))
		if rule.CaseSensitive {
			hash.Write([]byte{1})
		} else {
			hash.Write([]byte{0})
		}
	}
	return hex.EncodeToString(hash.Sum(nil))
}

func pronunciationLocators(locators []PronunciationLocator) []PronunciationLocator {
	out := make([]PronunciationLocator, 0, len(locators))
	for _, locator := range locators {
		if strings.TrimSpace(locator.ID) == "" {
			continue
		}
		out = append(out, locator)
		if len(out) == MaxPronunciationLocators {
			break
		}
	}
	return out
}
