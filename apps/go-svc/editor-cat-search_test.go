package main

import (
	"encoding/json"
	"net/http"
	"net/url"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func editorCatSearchKeys(t *testing.T, api *editorCatAPI, scope *testenv.Scope, sourcePath, locale, search string) []string {
	t.Helper()
	query := url.Values{"sourcePath": {sourcePath}, "targetLocale": {locale}, "search": {search}}
	rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/queue?"+query.Encode()), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		ContentEditorQueue editorCatQueueFile `json:"contentEditorQueue"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	keys := make([]string, 0, len(body.ContentEditorQueue.Segments))
	for _, segment := range body.ContentEditorQueue.Segments {
		keys = append(keys, segment.Key)
	}
	return keys
}

func TestEditorCatQueueSearchNonEnglishLocales(t *testing.T) {
	cases := []struct {
		name         string
		locale       string
		sourceText   string
		sourceSearch string
		target       string
		targetSearch string
	}{
		{"vietnamese", "vi-VN", "Chào mừng bạn trở lại", "trở lại", "Cài đặt tài khoản", "tài khoản"},
		{"chinese", "zh-CN", "欢迎回来", "回来", "账户设置", "设置"},
		{"korean", "ko-KR", "다시 오신 것을 환영합니다", "환영합니다", "계정 설정", "설정"},
		{"arabic", "ar-SA", "مرحبا بعودتك", "بعودتك", "إعدادات الحساب", "الحساب"},
		{"french", "fr-FR", "Bon retour parmi nous", "retour parmi", "Paramètres du compte", "PARAMÈTRES"},
		{"spanish", "es-ES", "Bienvenido de nuevo", "de nuevo", "Configuración de la cuenta", "configuración"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			api, scope := editorCatTestAPI(t, "translator")
			sourcePath := "lang/" + tc.locale + ".json"
			fileID := mustEditorCatSourceFile(t, scope, sourcePath)
			mustEditorCatKey(t, scope, fileID, "hero.title", tc.sourceText)
			settingsKeyID := mustEditorCatKey(t, scope, fileID, "nav.settings", "Account settings")
			mustEditorCatTranslation(t, scope, settingsKeyID, tc.locale, tc.target, "draft")
			mustEditorCatTranslation(t, scope, settingsKeyID, "de-DE", "Kontoeinstellungen", "draft")

			require.Equal(t, []string{"hero.title"}, editorCatSearchKeys(t, api, scope, sourcePath, tc.locale, tc.sourceSearch))
			require.Equal(t, []string{"nav.settings"}, editorCatSearchKeys(t, api, scope, sourcePath, tc.locale, tc.targetSearch))
			// Target text only matches in the locale the editor has open.
			require.Empty(t, editorCatSearchKeys(t, api, scope, sourcePath, "de-DE", tc.targetSearch))
		})
	}
}

func TestEditorCatQueueSearchFoldsCaseOfAccentedLetters(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "lang/vi-VN.json")
	mustEditorCatKey(t, scope, fileID, "hero.title", "Đặt tour ngay")
	keyID := mustEditorCatKey(t, scope, fileID, "nav.last", "Last")
	mustEditorCatTranslation(t, scope, keyID, "vi-VN", "Cuối cùng", "draft")

	require.Equal(t, []string{"hero.title"}, editorCatSearchKeys(t, api, scope, "lang/vi-VN.json", "vi-VN", "đặt TOUR"))
	require.Equal(t, []string{"nav.last"}, editorCatSearchKeys(t, api, scope, "lang/vi-VN.json", "vi-VN", "CUỐI CÙNG"))
}

func TestEditorCatQueueSearchMatchesAcrossUnicodeNormalForms(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "lang/vi-VN.json")
	// "Đặt tour ngay" with each accent stored as a combining mark (NFD).
	mustEditorCatKey(t, scope, fileID, "hero.title", "Đặt tour ngay")
	keyID := mustEditorCatKey(t, scope, fileID, "nav.last", "Last")
	mustEditorCatTranslation(t, scope, keyID, "vi-VN", "Cuối cùng", "draft")

	// A precomposed (NFC) query finds decomposed source text.
	require.Equal(t, []string{"hero.title"}, editorCatSearchKeys(t, api, scope, "lang/vi-VN.json", "vi-VN", "Đặt tour"))
	// A decomposed (NFD) query finds precomposed target text.
	require.Equal(t, []string{"nav.last"}, editorCatSearchKeys(t, api, scope, "lang/vi-VN.json", "vi-VN", "Cuối cùng"))
}
