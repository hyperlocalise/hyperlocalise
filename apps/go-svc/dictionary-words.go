package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/text/cases"
	"golang.org/x/text/language"
	"golang.org/x/text/unicode/norm"
)

const (
	dictionaryMaxWordLength    = 64
	dictionaryMaxWords         = 20000
	dictionaryMaxResolvedWords = 5000
	dictionaryMaxResolvedBytes = 256 * 1024
)

// BOLT OPTIMIZATION: Reuse package-level Caser to avoid allocation on every normalization.
var englishLowerCaser = cases.Lower(language.English)

type normalizedDictionaryWord struct{ word, folded string }

func isASCII(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] >= utf8.RuneSelf {
			return false
		}
	}
	return true
}

func normalizeDictionaryWord(raw string) (normalizedDictionaryWord, bool) {
	trimmed := trimDictionaryInput(raw)
	var word string
	// BOLT OPTIMIZATION: Bypass NFC normalization for plain ASCII strings.
	if isASCII(trimmed) {
		word = trimmed
	} else {
		word = norm.NFC.String(trimmed)
	}
	if word == "" || utf8.RuneCountInString(word) > dictionaryMaxWordLength {
		return normalizedDictionaryWord{}, false
	}
	for _, char := range word {
		if !unicode.IsLetter(char) && !unicode.IsMark(char) && !unicode.Is(unicode.Nd, char) && !strings.ContainsRune("'’ʼʻ-‐‑", char) {
			return normalizedDictionaryWord{}, false
		}
	}
	return normalizedDictionaryWord{word, englishLowerCaser.String(word)}, true
}

func parseDictionaryWords(content string) []normalizedDictionaryWord {
	// BOLT OPTIMIZATION: Pre-allocate result and seen map based on line count hint.
	linesCount := strings.Count(content, "\n") + 1
	result := make([]normalizedDictionaryWord, 0, min(linesCount, dictionaryMaxWords))
	seen := make(map[string]bool, min(linesCount, dictionaryMaxWords))

	// BOLT OPTIMIZATION: Stream lines with IndexByte instead of allocating a []string slice via strings.Split.
	for len(content) > 0 {
		var line string
		if idx := strings.IndexByte(content, '\n'); idx >= 0 {
			line = content[:idx]
			content = content[idx+1:]
		} else {
			line = content
			content = ""
		}

		trimmed := trimDictionaryInput(line)
		if strings.HasPrefix(trimmed, "#") {
			continue
		}
		word, ok := normalizeDictionaryWord(trimmed)
		if !ok || seen[word.folded] {
			continue
		}
		seen[word.folded] = true
		result = append(result, word)
	}
	return result
}

func dictionaryLocale(raw string) (string, error) {
	locale := strings.ReplaceAll(trimDictionaryInput(raw), "_", "-")
	if locale == "" || utf16Length(locale) > 50 {
		return "", invalidDictionary()
	}
	tag, err := language.Parse(locale)
	if err != nil {
		return "", invalidDictionary()
	}
	return tag.String(), nil
}

type dictionaryWordRecord struct {
	ID        string `json:"id"`
	Locale    string `json:"locale"`
	Word      string `json:"word"`
	CreatedAt string `json:"createdAt"`
}

func scanDictionaryWord(row pgx.Row) (dictionaryWordRecord, error) {
	var word dictionaryWordRecord
	var created time.Time
	err := row.Scan(&word.ID, &word.Locale, &word.Word, &created)
	word.CreatedAt = created.UTC().Format("2006-01-02T15:04:05.000Z")
	return word, err
}

type dictionaryWordPayload struct {
	Locale  string `json:"locale"`
	Word    string `json:"word"`
	Content string `json:"content"`
}

func (api *dictionaryAPI) exportDictionaryWords(r *http.Request, actor dictionaryActor, d dictionaryRecord) (any, int, error) {
	locale, err := dictionaryLocale(r.URL.Query().Get("locale"))
	if err != nil {
		return nil, 0, err
	}
	rows, err := api.pool.Query(r.Context(), `select word from spellcheck_word_library_words where library_id=$1 and locale=$2 order by word`, d.ID, locale)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	words := []string{}
	for rows.Next() {
		var word string
		if err := rows.Scan(&word); err != nil {
			return nil, 0, err
		}
		words = append(words, word)
	}
	return dictionaryExport{locale, strings.Join(words, "\n") + "\n"}, 200, rows.Err()
}

func (api *dictionaryAPI) listDictionaryWords(r *http.Request, actor dictionaryActor, d dictionaryRecord) (any, int, error) {
	limit, offset, err := dictionaryPage(r, 100, 500)
	if err != nil {
		return nil, 0, err
	}
	locale := ""
	if r.URL.Query().Has("locale") {
		locale, err = dictionaryLocale(r.URL.Query().Get("locale"))
		if err != nil {
			return nil, 0, err
		}
	}
	rows, err := api.pool.Query(r.Context(), `select id,locale,word,created_at from spellcheck_word_library_words where library_id=$1 and ($2='' or locale=$2) order by locale,word limit $3 offset $4`, d.ID, locale, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	words := []dictionaryWordRecord{}
	for rows.Next() {
		word, err := scanDictionaryWord(rows)
		if err != nil {
			rows.Close()
			return nil, 0, err
		}
		words = append(words, word)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	var total int
	err = api.pool.QueryRow(r.Context(), `select count(*) from spellcheck_word_library_words where library_id=$1 and ($2='' or locale=$2)`, d.ID, locale).Scan(&total)
	return map[string]any{"words": words, "total": total}, 200, err
}

func (api *dictionaryAPI) deleteDictionaryWord(r *http.Request, actor dictionaryActor, d dictionaryRecord) (any, int, error) {
	wordID := r.PathValue("wordId")
	if !validDictionaryID(wordID) {
		return nil, 0, missingDictionary()
	}
	err := api.withDictionaryWords(r.Context(), actor, d.ID, func(tx pgx.Tx) error {
		deleted, err := tx.Exec(r.Context(), `delete from spellcheck_word_library_words where id=$1 and library_id=$2`, wordID, d.ID)
		if err != nil {
			return err
		}
		if deleted.RowsAffected() == 0 {
			return missingDictionary()
		}
		return bumpDictionary(r.Context(), tx, d.ID)
	})
	return nil, 204, err
}

func (api *dictionaryAPI) createDictionaryWord(r *http.Request, actor dictionaryActor, d dictionaryRecord) (any, int, error) {
	return api.writeDictionaryWords(r, actor, d, false)
}

func (api *dictionaryAPI) importDictionaryWords(r *http.Request, actor dictionaryActor, d dictionaryRecord) (any, int, error) {
	return api.writeDictionaryWords(r, actor, d, true)
}

func (api *dictionaryAPI) writeDictionaryWords(r *http.Request, actor dictionaryActor, d dictionaryRecord, importing bool) (any, int, error) {
	ctx := r.Context()
	var payload dictionaryWordPayload
	if err := readDictionaryBody(r, &payload); err != nil {
		return nil, 0, err
	}
	locale, err := dictionaryLocale(payload.Locale)
	if err != nil {
		return nil, 0, err
	}
	var words []normalizedDictionaryWord
	if importing {
		if payload.Content == "" || utf16Length(payload.Content) > 1000000 {
			return nil, 0, invalidDictionary()
		}
		words = parseDictionaryWords(payload.Content)
	} else {
		word, ok := normalizeDictionaryWord(payload.Word)
		if !ok || utf16Length(trimDictionaryInput(payload.Word)) > dictionaryMaxWordLength {
			return nil, 0, invalidDictionary()
		}
		words = []normalizedDictionaryWord{word}
	}
	inserted := 0
	var created dictionaryWordRecord
	err = api.withDictionaryWords(ctx, actor, d.ID, func(tx pgx.Tx) error {
		count, err := dictionaryCount(ctx, tx, d.ID)
		if err != nil {
			return err
		}
		if !importing {
			if count >= dictionaryMaxWords {
				return invalidDictionary()
			}
			created, err = scanDictionaryWord(tx.QueryRow(ctx, `insert into spellcheck_word_library_words (library_id,locale,word,word_normalized,created_by_user_id) values ($1,$2,$3,$4,$5) returning id,locale,word,created_at`, d.ID, locale, words[0].word, words[0].folded, actor.userID))
			if err != nil {
				var pgErr *pgconn.PgError
				if errors.As(err, &pgErr) && pgErr.Code == "23505" {
					return dictionaryFailure(409, "dictionary_word_exists", "That word is already in this locale")
				}
				return err
			}
			inserted = 1
		} else {
			existing := map[string]bool{}
			rows, err := tx.Query(ctx, `select word_normalized from spellcheck_word_library_words where library_id=$1 and locale=$2`, d.ID, locale)
			if err != nil {
				return err
			}
			for rows.Next() {
				var folded string
				if err := rows.Scan(&folded); err != nil {
					rows.Close()
					return err
				}
				existing[folded] = true
			}
			rows.Close()
			if err := rows.Err(); err != nil {
				return err
			}
			novel := []string{}
			folded := []string{}
			for _, word := range words {
				if len(novel) >= dictionaryMaxWords-count {
					break
				}
				if existing[word.folded] {
					continue
				}
				novel = append(novel, word.word)
				folded = append(folded, word.folded)
			}
			if len(novel) > 0 {
				tag, err := tx.Exec(ctx, `insert into spellcheck_word_library_words (library_id,locale,word,word_normalized,created_by_user_id) select $1,$2,w.word,w.folded,$3 from unnest($4::text[],$5::text[]) as w(word,folded) on conflict do nothing`, d.ID, locale, actor.userID, novel, folded)
				if err != nil {
					return err
				}
				inserted = int(tag.RowsAffected())
			}
		}
		if inserted > 0 {
			return bumpDictionary(ctx, tx, d.ID)
		}
		return nil
	})
	if importing {
		return map[string]any{"import": map[string]int{"imported": inserted, "skipped": len(words) - inserted}}, 200, err
	}
	return map[string]any{"word": created}, 201, err
}

func capDictionaryWords(words []string) []string {
	result := []string{}
	bytes := 2
	for _, word := range words {
		encoded, err := json.Marshal(word)
		if err != nil {
			break
		} // Strings always marshal successfully.
		extra := len(encoded)
		if len(result) > 0 {
			extra++
		}
		if len(result) >= dictionaryMaxResolvedWords || bytes+extra > dictionaryMaxResolvedBytes {
			break
		}
		result = append(result, word)
		bytes += extra
	}
	return result
}

func isDictionaryTrimRune(r rune) bool {
	if r <= ' ' {
		return r == ' ' || (r >= '\t' && r <= '\r')
	}
	switch r {
	case '\u00a0', '\u1680', '\u2000', '\u2001', '\u2002', '\u2003', '\u2004', '\u2005', '\u2006', '\u2007', '\u2008', '\u2009', '\u200a', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff':
		return true
	}
	return false
}

// Match JavaScript String.trim, including the BOM commonly found in word files.
func trimDictionaryInput(value string) string {
	if value == "" {
		return ""
	}
	// BOLT OPTIMIZATION: ASCII fast path to avoid TrimFunc when bounds are non-whitespace.
	if value[0] > ' ' && value[0] < utf8.RuneSelf && value[len(value)-1] > ' ' && value[len(value)-1] < utf8.RuneSelf {
		return value
	}
	// BOLT OPTIMIZATION: Use top-level function to avoid closure allocation and strings.ContainsRune.
	return strings.TrimFunc(value, isDictionaryTrimRune)
}
