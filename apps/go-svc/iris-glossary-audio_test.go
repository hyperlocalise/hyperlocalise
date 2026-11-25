package main

import (
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func TestIrisSpokenText(t *testing.T) {
	require.Equal(t, "Hello\nThere", irisSpokenText(irisGenerateRequest{
		"lines": []any{
			map[string]any{"text": "Hello", "voice": "Roger"},
			map[string]any{"text": "There", "voice": "Sarah"},
		},
		"prompt": "ignored when lines are set",
	}))
	require.Equal(t, "Say checkout", irisSpokenText(irisGenerateRequest{"prompt": "  Say checkout  "}))
}

func TestAttachGlossaryAudioLeavesJobWhenPoolMissing(t *testing.T) {
	job := &irisJobRecord{Model: "elevenlabs-v3", Request: irisGenerateRequest{"prompt": "Checkout"}}
	(&irisGenerationAPI{}).attachGlossaryAudio(t.Context(), irisOrgScope{}, job)
	require.Empty(t, job.Pronunciations)
	require.Empty(t, job.Keyterms)
}

func TestGlossaryPronunciationsMatchSpokenTerms(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	api := &irisGenerationAPI{pool: scope.Pool}
	irisScope := irisOrgScope{OrganizationID: scope.OrganizationID, UserID: scope.UserID, Role: "admin"}

	activeID := scope.MustGlossary(t, "", "Brand", "en-US")
	archivedID := scope.MustGlossary(t, "", "Old Brand", "en-US")
	_, err := scope.Pool.Exec(t.Context(), `update glossaries set status='archived' where id=$1`, archivedID)
	require.NoError(t, err)

	activeConcept := mustGlossaryConcept(t, scope, activeID, "Checkout", "", "")
	checkout := mustGlossaryTerm(t, scope, activeID, activeConcept, "en-US", "Checkout")
	mustSetPronunciation(t, scope, checkout, "check out")
	french := mustGlossaryTerm(t, scope, activeID, activeConcept, "fr-FR", "Paiement")
	mustSetPronunciation(t, scope, french, "pay-MAHN")
	forbidden := mustGlossaryTerm(t, scope, activeID, activeConcept, "en-US", "SecretWord")
	mustSetPronunciation(t, scope, forbidden, "secret")
	_, err = scope.Pool.Exec(t.Context(), `update glossary_terms set forbidden=true where id=$1`, forbidden)
	require.NoError(t, err)
	plain := mustGlossaryTerm(t, scope, activeID, activeConcept, "en-US", "Invoice")
	require.NotEmpty(t, plain)
	sensitive := mustGlossaryTerm(t, scope, activeID, activeConcept, "en-US", "IRIS")
	mustSetPronunciation(t, scope, sensitive, "EYE-ris")
	_, err = scope.Pool.Exec(t.Context(), `update glossary_terms set case_sensitive=true where id=$1`, sensitive)
	require.NoError(t, err)

	archivedConcept := mustGlossaryConcept(t, scope, archivedID, "Legacy", "", "")
	legacy := mustGlossaryTerm(t, scope, archivedID, archivedConcept, "en-US", "Legacy")
	mustSetPronunciation(t, scope, legacy, "leg-uh-see")

	rules, err := api.glossaryPronunciations(t.Context(), irisScope, "en-US", "Open Checkout then Legacy SecretWord Invoice")
	require.NoError(t, err)
	require.Equal(t, []irisPronunciation{{Term: "Checkout", Alias: "check out"}}, rules)

	byLanguage, err := api.glossaryPronunciations(t.Context(), irisScope, "en", "Pay at Checkout")
	require.NoError(t, err)
	require.Equal(t, []irisPronunciation{{Term: "Checkout", Alias: "check out"}}, byLanguage)

	frenchOnly, err := api.glossaryPronunciations(t.Context(), irisScope, "fr-FR", "Paiement Checkout")
	require.NoError(t, err)
	require.Equal(t, []irisPronunciation{{Term: "Paiement", Alias: "pay-MAHN"}}, frenchOnly)

	empty, err := api.glossaryPronunciations(t.Context(), irisScope, "en-US", "   ")
	require.NoError(t, err)
	require.Empty(t, empty)

	caseFolded, err := api.glossaryPronunciations(t.Context(), irisScope, "en-US", "The iris lens")
	require.NoError(t, err)
	require.Empty(t, caseFolded)
	caseExact, err := api.glossaryPronunciations(t.Context(), irisScope, "en-US", "The IRIS lens")
	require.NoError(t, err)
	require.Equal(t, []irisPronunciation{{Term: "IRIS", Alias: "EYE-ris", CaseSensitive: true}}, caseExact)
}

func TestGlossaryPronunciationsRespectTeamACL(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "translator"})
	api := &irisGenerationAPI{pool: scope.Pool}
	irisScope := irisOrgScope{OrganizationID: scope.OrganizationID, UserID: scope.UserID, Role: "translator"}

	visibleID := scope.MustGlossary(t, "", "Shared", "en-US")
	visibleConcept := mustGlossaryConcept(t, scope, visibleID, "Checkout", "", "")
	visibleTerm := mustGlossaryTerm(t, scope, visibleID, visibleConcept, "en-US", "Checkout")
	mustSetPronunciation(t, scope, visibleTerm, "check out")

	teamID := scope.MustTeam(t, "platform", "Platform", "")
	privateID := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
            insert into glossaries (
                id, organization_id, created_by_user_id, name, source_locale, status, source, control_level, team_id
            ) values ($1, $2, $3, 'Private', 'en-US', 'active', 'native', 'team', $4)`,
		privateID, scope.OrganizationID, scope.UserID, teamID)
	require.NoError(t, err)
	privateConcept := mustGlossaryConcept(t, scope, privateID, "SecretPhrase", "", "")
	privateTerm := mustGlossaryTerm(t, scope, privateID, privateConcept, "en-US", "SecretPhrase")
	mustSetPronunciation(t, scope, privateTerm, "keep-out")

	rules, err := api.glossaryPronunciations(t.Context(), irisScope, "en-US", "Checkout SecretPhrase")
	require.NoError(t, err)
	require.Equal(t, []irisPronunciation{{Term: "Checkout", Alias: "check out"}}, rules)
}

func TestGlossaryKeytermsUseLanguageAndSkipForbidden(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	api := &irisGenerationAPI{pool: scope.Pool}
	irisScope := irisOrgScope{OrganizationID: scope.OrganizationID, UserID: scope.UserID, Role: "admin"}

	glossaryID := scope.MustGlossary(t, "", "Scribe terms", "en-US")
	concept := mustGlossaryConcept(t, scope, glossaryID, "Checkout", "", "")
	mustGlossaryTerm(t, scope, glossaryID, concept, "en-US", "Checkout")
	mustGlossaryTerm(t, scope, glossaryID, concept, "fr-FR", "Paiement")
	blocked := mustGlossaryTerm(t, scope, glossaryID, concept, "en-US", "BlockedTerm")
	_, err := scope.Pool.Exec(t.Context(), `update glossary_terms set forbidden=true where id=$1`, blocked)
	require.NoError(t, err)

	sourceTerms, err := api.glossaryKeyterms(t.Context(), irisScope, "")
	require.NoError(t, err)
	require.Equal(t, []string{"Checkout"}, sourceTerms)

	frenchTerms, err := api.glossaryKeyterms(t.Context(), irisScope, "fr")
	require.NoError(t, err)
	require.Equal(t, []string{"Paiement"}, frenchTerms)
}

func TestAttachGlossaryAudioSetsPronunciationsAndKeyterms(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	api := &irisGenerationAPI{pool: scope.Pool}
	irisScope := irisOrgScope{OrganizationID: scope.OrganizationID, UserID: scope.UserID, Role: "admin"}

	glossaryID := scope.MustGlossary(t, "", "Audio", "en-US")
	concept := mustGlossaryConcept(t, scope, glossaryID, "Checkout", "", "")
	termID := mustGlossaryTerm(t, scope, glossaryID, concept, "en-US", "Checkout")
	mustSetPronunciation(t, scope, termID, "check out")

	speech := &irisJobRecord{
		ID:    "job_speech",
		Model: "elevenlabs-v3",
		Request: irisGenerateRequest{
			"prompt":       "Please say Checkout clearly",
			"languageCode": "en-US",
		},
	}
	api.attachGlossaryAudio(t.Context(), irisScope, speech)
	require.Equal(t, []irisPronunciation{{Term: "Checkout", Alias: "check out"}}, speech.Pronunciations)
	require.Empty(t, speech.Keyterms)

	dialogue := &irisJobRecord{
		ID:    "job_dialogue",
		Model: "elevenlabs-dialogue",
		Request: irisGenerateRequest{
			"languageCode": "en",
			"lines": []any{
				map[string]any{"text": "Checkout is ready", "voice": "Roger"},
			},
		},
	}
	api.attachGlossaryAudio(t.Context(), irisScope, dialogue)
	require.Equal(t, []irisPronunciation{{Term: "Checkout", Alias: "check out"}}, dialogue.Pronunciations)

	scribe := &irisJobRecord{
		ID:      "job_scribe",
		Model:   "elevenlabs-scribe",
		Request: irisGenerateRequest{"languageCode": "en-US"},
	}
	api.attachGlossaryAudio(t.Context(), irisScope, scribe)
	require.Equal(t, []string{"Checkout"}, scribe.Keyterms)
	require.Empty(t, scribe.Pronunciations)

	isolator := &irisJobRecord{ID: "job_isolator", Model: "elevenlabs-voice-isolator"}
	api.attachGlossaryAudio(t.Context(), irisScope, isolator)
	require.Empty(t, isolator.Pronunciations)
	require.Empty(t, isolator.Keyterms)
}

func mustSetPronunciation(t *testing.T, scope *testenv.Scope, termID, pronunciation string) {
	t.Helper()
	_, err := scope.Pool.Exec(t.Context(), `update glossary_terms set pronunciation=$1 where id=$2`, pronunciation, termID)
	require.NoError(t, err)
}
