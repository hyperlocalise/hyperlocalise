package main

import (
	"context"
	"log/slog"
	"strings"
)

// The workspace's glossaries reach Iris's audio too: a term's pronunciation
// is how ElevenLabs says it in speech and dialogue, and the glossary's terms
// are the keyterms Scribe listens for in a transcript.

const (
	irisMaxPronunciations   = 200
	irisMaxGlossaryKeyterms = 500
)

// irisPronunciation says Term the way Alias spells it out.
type irisPronunciation struct {
	Term          string `json:"term"`
	Alias         string `json:"alias"`
	CaseSensitive bool   `json:"caseSensitive,omitempty"`
}

// attachGlossaryAudio reads what the job's model takes from the glossaries.
// A glossary that cannot be read leaves the job as it was: the speech is
// still made, only without the workspace's pronunciations.
func (api *irisGenerationAPI) attachGlossaryAudio(ctx context.Context, scope irisOrgScope, job *irisJobRecord) {
	if api.pool == nil {
		return
	}
	switch job.Model {
	case "elevenlabs-v3", "elevenlabs-v4", "elevenlabs-dialogue":
		rules, err := api.glossaryPronunciations(ctx, scope, job.Request.languageCode(), irisSpokenText(job.Request))
		if err != nil {
			slog.WarnContext(ctx, "iris_generation_pronunciations_failed", "organization_id", scope.OrganizationID, "job_id", job.ID, "error", err)
			return
		}
		job.Pronunciations = rules
	case "elevenlabs-scribe":
		terms, err := api.glossaryKeyterms(ctx, scope, job.Request.languageCode())
		if err != nil {
			slog.WarnContext(ctx, "iris_generation_keyterms_failed", "organization_id", scope.OrganizationID, "job_id", job.ID, "error", err)
			return
		}
		job.Keyterms = terms
	}
}

// irisSpokenText is the script a speech request says.
func irisSpokenText(req irisGenerateRequest) string {
	if lines := req.dialogueLines(); len(lines) > 0 {
		texts := make([]string, 0, len(lines))
		for _, line := range lines {
			texts = append(texts, line.Text)
		}
		return strings.Join(texts, "\n")
	}
	return req.prompt()
}

// glossaryPronunciations returns the pronunciations of the glossary terms
// the text contains, in the language when one is given.
func (api *irisGenerationAPI) glossaryPronunciations(ctx context.Context, scope irisOrgScope, language, text string) ([]irisPronunciation, error) {
	if strings.TrimSpace(text) == "" {
		return nil, nil
	}
	actor := glossaryActor{userID: scope.UserID, organizationID: scope.OrganizationID, role: scope.Role}
	rows, err := api.pool.Query(ctx, `select t.term, t.pronunciation, coalesce(t.case_sensitive, false)
from glossary_terms t
join glossary_concepts c on c.id = t.concept_id and c.archived_at is null
join glossaries g on g.id = t.glossary_id
where `+glossaryAccessPredicate("g", 1, 2, 3)+`
  and g.source = 'native' and g.status <> 'archived'
  and t.archived_at is null and coalesce(t.forbidden, false) = false
  and coalesce(t.pronunciation, '') <> ''
  and ($4 = '' or lower(replace(t.locale, '_', '-')) = lower($4) or split_part(lower(replace(t.locale, '_', '-')), '-', 1) = lower($5))
  and char_length(t.term) >= 2
  and (case when coalesce(t.case_sensitive, false) then strpos($6, t.term) else strpos(lower($6), lower(t.term)) end) > 0
order by char_length(t.term) desc
limit $7`,
		actor.organizationID, actor.userID, actor.orgWideAccess(), strings.TrimSpace(language), irisLanguage(strings.TrimSpace(language)), text, irisMaxPronunciations*2)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []irisPronunciation{}
	for rows.Next() {
		var rule irisPronunciation
		if err := rows.Scan(&rule.Term, &rule.Alias, &rule.CaseSensitive); err != nil {
			return nil, err
		}
		rule.Term, rule.Alias = strings.TrimSpace(rule.Term), strings.TrimSpace(rule.Alias)
		if rule.Alias == "" || !containsTerm(text, rule.Term, rule.CaseSensitive) {
			continue
		}
		out = append(out, rule)
		if len(out) == irisMaxPronunciations {
			break
		}
	}
	return out, rows.Err()
}

// glossaryKeyterms returns the glossary's allowed terms in the language,
// most recently edited first. Without a language they are the glossaries'
// source terms.
func (api *irisGenerationAPI) glossaryKeyterms(ctx context.Context, scope irisOrgScope, language string) ([]string, error) {
	actor := glossaryActor{userID: scope.UserID, organizationID: scope.OrganizationID, role: scope.Role}
	rows, err := api.pool.Query(ctx, `select t.term
from glossary_terms t
join glossary_concepts c on c.id = t.concept_id and c.archived_at is null
join glossaries g on g.id = t.glossary_id
where `+glossaryAccessPredicate("g", 1, 2, 3)+`
  and g.source = 'native' and g.status <> 'archived'
  and t.archived_at is null and coalesce(t.forbidden, false) = false
  and char_length(t.term) between 2 and 50
  and case when $4 = '' then lower(replace(t.locale, '_', '-')) = lower(replace(g.source_locale, '_', '-'))
           else lower(replace(t.locale, '_', '-')) = lower($4) or split_part(lower(replace(t.locale, '_', '-')), '-', 1) = lower($5) end
order by t.updated_at desc
limit $6`,
		actor.organizationID, actor.userID, actor.orgWideAccess(), strings.TrimSpace(language), irisLanguage(strings.TrimSpace(language)), irisMaxGlossaryKeyterms)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	terms := []string{}
	for rows.Next() {
		var term string
		if err := rows.Scan(&term); err != nil {
			return nil, err
		}
		terms = append(terms, term)
	}
	return terms, rows.Err()
}
