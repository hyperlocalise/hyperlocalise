package main

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

func TestDictionaryWordMutations(t *testing.T) {
	for _, tc := range []struct {
		name                        string
		count                       int
		insertErr, errorAfterInsert error
		status                      int
	}{
		{name: "creates and bumps version", status: 201},
		{name: "at capacity", count: dictionaryMaxWords, status: 400},
		{name: "duplicate", insertErr: &pgconn.PgError{Code: "23505"}, status: 409},
		{name: "insert fails", insertErr: errors.New("write failed"), status: 500},
		{name: "version bump fails", errorAfterInsert: errors.New("write failed"), status: 500},
	} {
		t.Run(tc.name, func(t *testing.T) {
			steps := append([]dictionaryDBStep{dictionaryOwnedStep()}, dictionaryWordTransactionSteps()...)
			steps = append(steps, dictionaryRowStep("count(*)", tc.count))
			if tc.count < dictionaryMaxWords {
				step := dictionaryRowStep("insert into spellcheck_word_library_words", testDictionaryWordID, "en-US", "AuthKit", testDictionaryTime)
				step.args = []any{testDictionaryID, "en-US", "AuthKit", "authkit", testDictionaryUserID}
				step.err = tc.insertErr
				steps = append(steps, step)
				if tc.insertErr == nil {
					steps = append(steps, dictionaryDBStep{kind: "exec", sql: "words_version=words_version+1", err: tc.errorAfterInsert})
				}
				if tc.insertErr == nil && tc.errorAfterInsert == nil {
					steps = append(steps, dictionaryDBStep{kind: "commit"})
				}
			}
			api, db := dictionaryTestAPI(t, "admin", steps...)
			rec := dictionaryRequestForTest(api, "POST", testDictionaryBase+"/"+testDictionaryID+"/words", `{"locale":"en_us","word":"AuthKit"}`)
			require.Equal(t, tc.status, rec.Code, rec.Body.String())
			require.Equal(t, tc.status == 201, db.committed)
			require.Equal(t, 1, db.rollbacks)
		})
	}
}

func TestDictionaryImportOnlyNovelWordsWithinCapacity(t *testing.T) {
	for _, tc := range []struct {
		name     string
		count    int
		existing [][]any
		insert   bool
		skipped  int
	}{
		{"novel", 0, [][]any{{"authkit"}}, true, 1},
		{"full", dictionaryMaxWords, nil, false, 2},
		{"duplicate only", 1, [][]any{{"authkit"}, {"hyperlocalise"}}, false, 2},
		{"last slot", dictionaryMaxWords - 1, nil, true, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			steps := append([]dictionaryDBStep{dictionaryOwnedStep()}, dictionaryWordTransactionSteps()...)
			steps = append(steps, dictionaryRowStep("count(*)", tc.count), dictionaryDBStep{kind: "query", sql: "select word_normalized", values: tc.existing})
			if tc.insert {
				word, folded := "Hyperlocalise", "hyperlocalise"
				if tc.name == "last slot" {
					word, folded = "AuthKit", "authkit"
				}
				steps = append(steps, dictionaryDBStep{kind: "exec", sql: "from unnest($4::text[],$5::text[])", args: []any{testDictionaryID, "en-US", testDictionaryUserID, []string{word}, []string{folded}}, affected: 1}, dictionaryDBStep{kind: "exec", sql: "words_version=words_version+1"})
			}
			steps = append(steps, dictionaryDBStep{kind: "commit"})
			api, db := dictionaryTestAPI(t, "admin", steps...)
			rec := dictionaryRequestForTest(api, "POST", testDictionaryBase+"/"+testDictionaryID+"/words/import", `{"locale":"en-US","content":"# comment\nAuthKit\nauthkit\nHyperlocalise\ninvalid phrase"}`)
			require.Equal(t, 200, rec.Code, rec.Body.String())
			require.True(t, db.committed)
			if tc.insert {
				require.JSONEq(t, `{"import":{"imported":1,"skipped":1}}`, rec.Body.String())
			} else {
				require.JSONEq(t, `{"import":{"imported":0,"skipped":2}}`, rec.Body.String())
			}
		})
	}
}

func TestDictionaryWordDelete(t *testing.T) {
	for _, found := range []bool{true, false} {
		t.Run(map[bool]string{true: "exists", false: "absent"}[found], func(t *testing.T) {
			steps := append([]dictionaryDBStep{dictionaryOwnedStep()}, dictionaryWordTransactionSteps()...)
			affected := int64(0)
			if found {
				affected = 1
			}
			steps = append(steps, dictionaryDBStep{kind: "exec", sql: "id=$1 and library_id=$2", args: []any{testDictionaryWordID, testDictionaryID}, affected: affected})
			if found {
				steps = append(steps, dictionaryDBStep{kind: "exec", sql: "words_version=words_version+1"}, dictionaryDBStep{kind: "commit"})
			}
			api, db := dictionaryTestAPI(t, "admin", steps...)
			rec := dictionaryRequestForTest(api, "DELETE", testDictionaryBase+"/"+testDictionaryID+"/words/"+testDictionaryWordID, "")
			if found {
				require.Equal(t, 204, rec.Code)
				require.Empty(t, rec.Body.String())
			} else {
				require.Equal(t, 404, rec.Code)
			}
			require.Equal(t, found, db.committed)
		})
	}
}

func TestDictionaryWordListAndExport(t *testing.T) {
	t.Run("filtered words", func(t *testing.T) {
		api, _ := dictionaryTestAPI(t, "member", dictionaryOwnedStep(), dictionaryDBStep{kind: "query", sql: "order by locale,word limit $3 offset $4", args: []any{testDictionaryID, "en-US", 10, 20}, values: [][]any{{testDictionaryWordID, "en-US", "AuthKit", testDictionaryTime}}}, dictionaryRowStep("select count(*)", 21))
		rec := dictionaryRequestForTest(api, "GET", testDictionaryBase+"/"+testDictionaryID+"/words?locale=en_us&limit=10&offset=20", "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"total":21`)
	})
	for _, empty := range []bool{true, false} {
		t.Run(map[bool]string{true: "empty export", false: "word export"}[empty], func(t *testing.T) {
			values := [][]any(nil)
			want := "\n"
			if !empty {
				values = [][]any{{"AuthKit"}, {"Hyperlocalise"}}
				want = "AuthKit\nHyperlocalise\n"
			}
			api, _ := dictionaryTestAPI(t, "member", dictionaryOwnedStep(), dictionaryDBStep{kind: "query", sql: "locale=$2 order by word", args: []any{testDictionaryID, "en-US"}, values: values})
			rec := dictionaryRequestForTest(api, "GET", testDictionaryBase+"/"+testDictionaryID+"/words/export?locale=en-US", "")
			require.Equal(t, 200, rec.Code)
			require.Equal(t, want, rec.Body.String())
			require.Equal(t, `attachment; filename="en-US.txt"`, rec.Header().Get("Content-Disposition"))
		})
	}
}

func TestDictionaryWordValidation(t *testing.T) {
	for _, body := range []string{`{"locale":"en","word":"two words"}`, `{"locale":"../../x","word":"safe"}`, `{"locale":"en","word":null}`, `{"locale":"en"}`} {
		t.Run(body, func(t *testing.T) {
			api, _ := dictionaryTestAPI(t, "admin", dictionaryOwnedStep())
			rec := dictionaryRequestForTest(api, "POST", testDictionaryBase+"/"+testDictionaryID+"/words", body)
			require.Equal(t, 400, rec.Code)
		})
	}
}
