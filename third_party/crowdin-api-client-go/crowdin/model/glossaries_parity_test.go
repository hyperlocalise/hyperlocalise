package model

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGlossary_Unmarshal(t *testing.T) {
	jsonResp := `{
		"id": 2,
		"name": "My Glossary",
		"description": "Description of my glossary",
		"groupId": 1,
		"userId": 12,
		"terms": 25,
		"concepts": 10,
		"languageId": "en",
		"languageIds": ["en", "uk"],
		"defaultProjectIds": [1, 2],
		"projectIds": [1, 2, 3],
		"webUrl": "https://crowdin.com/glossary/2",
		"createdAt": "2023-09-19T15:10:43+00:00",
		"updatedAt": "2023-09-19T15:10:46+00:00"
	}`

	var glossary Glossary
	err := json.Unmarshal([]byte(jsonResp), &glossary)
	require.NoError(t, err)

	assert.Equal(t, 2, glossary.ID)
	assert.Equal(t, "My Glossary", glossary.Name)
	assert.Equal(t, "Description of my glossary", glossary.Description)
	assert.Equal(t, 1, glossary.GroupID)
	assert.Equal(t, 12, glossary.UserID)
	assert.Equal(t, 25, glossary.Terms)
	assert.Equal(t, 10, glossary.Concepts)
	assert.Equal(t, "en", glossary.LanguageID)
	assert.Equal(t, []string{"en", "uk"}, glossary.LanguageIDs)
	assert.Equal(t, []int{1, 2}, glossary.DefaultProjectIDs)
	assert.Equal(t, []int{1, 2, 3}, glossary.ProjectIDs)
	assert.Equal(t, "https://crowdin.com/glossary/2", glossary.WebURL)
	assert.Equal(t, "2023-09-19T15:10:43+00:00", glossary.CreatedAt)
	assert.Equal(t, "2023-09-19T15:10:46+00:00", glossary.UpdatedAt)
}
