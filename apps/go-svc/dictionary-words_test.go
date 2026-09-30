package main

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestDictionaryWordMutations(t *testing.T) {
	t.Run("creates and bumps version", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "admin")
		id := scope.MustDictionary(t, "", "Brand names")
		rec := dictionaryRequest(api, scope, "POST", scope.OrgPath("/dictionaries/"+id+"/words"), `{"locale":"en_us","word":"AuthKit"}`)
		require.Equal(t, 201, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "AuthKit")
	})
	t.Run("duplicate", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "admin")
		id := scope.MustDictionary(t, "", "Brand names")
		scope.MustDictionaryWord(t, id, "en-US", "AuthKit")
		rec := dictionaryRequest(api, scope, "POST", scope.OrgPath("/dictionaries/"+id+"/words"), `{"locale":"en_us","word":"AuthKit"}`)
		require.Equal(t, 409, rec.Code, rec.Body.String())
	})
}

func TestDictionaryImportOnlyNovelWordsWithinCapacity(t *testing.T) {
	t.Run("novel", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "admin")
		id := scope.MustDictionary(t, "", "Brand names")
		scope.MustDictionaryWord(t, id, "en-US", "AuthKit")
		rec := dictionaryRequest(api, scope, "POST", scope.OrgPath("/dictionaries/"+id+"/words/import"), `{"locale":"en-US","content":"# comment\nAuthKit\nauthkit\nHyperlocalise\ninvalid phrase"}`)
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.JSONEq(t, `{"import":{"imported":1,"skipped":1}}`, rec.Body.String())
	})
	t.Run("duplicate only", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "admin")
		id := scope.MustDictionary(t, "", "Brand names")
		scope.MustDictionaryWord(t, id, "en-US", "AuthKit")
		scope.MustDictionaryWord(t, id, "en-US", "Hyperlocalise")
		rec := dictionaryRequest(api, scope, "POST", scope.OrgPath("/dictionaries/"+id+"/words/import"), `{"locale":"en-US","content":"# comment\nAuthKit\nauthkit\nHyperlocalise\ninvalid phrase"}`)
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.JSONEq(t, `{"import":{"imported":0,"skipped":2}}`, rec.Body.String())
	})
}

func TestDictionaryWordDelete(t *testing.T) {
	t.Run("exists", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "admin")
		id := scope.MustDictionary(t, "", "Brand names")
		wordID := scope.MustDictionaryWord(t, id, "en-US", "AuthKit")
		rec := dictionaryRequest(api, scope, "DELETE", scope.OrgPath("/dictionaries/"+id+"/words/"+wordID), "")
		require.Equal(t, 204, rec.Code)
		require.Empty(t, rec.Body.String())
	})
	t.Run("absent", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "admin")
		id := scope.MustDictionary(t, "", "Brand names")
		rec := dictionaryRequest(api, scope, "DELETE", scope.OrgPath("/dictionaries/"+id+"/words/"+uuid.NewString()), "")
		require.Equal(t, 404, rec.Code)
	})
}

func TestDictionaryWordListAndExport(t *testing.T) {
	t.Run("filtered words", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "member")
		id := scope.MustDictionary(t, "", "Brand names")
		for i := 0; i < 21; i++ {
			scope.MustDictionaryWord(t, id, "en-US", "Word"+uuid.NewString()[:8])
		}
		rec := dictionaryRequest(api, scope, "GET", scope.OrgPath("/dictionaries/"+id+"/words?locale=en_us&limit=10&offset=20"), "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"total":21`)
	})
	t.Run("empty export", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "member")
		id := scope.MustDictionary(t, "", "Brand names")
		rec := dictionaryRequest(api, scope, "GET", scope.OrgPath("/dictionaries/"+id+"/words/export?locale=en-US"), "")
		require.Equal(t, 200, rec.Code)
		require.Equal(t, "\n", rec.Body.String())
		require.Equal(t, `attachment; filename="en-US.txt"`, rec.Header().Get("Content-Disposition"))
	})
	t.Run("word export", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "member")
		id := scope.MustDictionary(t, "", "Brand names")
		scope.MustDictionaryWord(t, id, "en-US", "AuthKit")
		scope.MustDictionaryWord(t, id, "en-US", "Hyperlocalise")
		rec := dictionaryRequest(api, scope, "GET", scope.OrgPath("/dictionaries/"+id+"/words/export?locale=en-US"), "")
		require.Equal(t, 200, rec.Code)
		require.Equal(t, "AuthKit\nHyperlocalise\n", rec.Body.String())
		require.Equal(t, `attachment; filename="en-US.txt"`, rec.Header().Get("Content-Disposition"))
	})
}

func TestDictionaryWordValidation(t *testing.T) {
	for _, body := range []string{`{"locale":"en","word":"two words"}`, `{"locale":"../../x","word":"safe"}`, `{"locale":"en","word":null}`, `{"locale":"en"}`} {
		t.Run(body, func(t *testing.T) {
			api, scope := dictionaryTestAPI(t, "admin")
			id := scope.MustDictionary(t, "", "Brand names")
			rec := dictionaryRequest(api, scope, "POST", scope.OrgPath("/dictionaries/"+id+"/words"), body)
			require.Equal(t, 400, rec.Code)
		})
	}
}
