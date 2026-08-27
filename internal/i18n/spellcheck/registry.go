package spellcheck

import (
	"errors"
	"fmt"
	"sort"
)

type DictionaryFiles struct {
	AffFile string
	DicFile string
}

var ErrUnsupportedLocale = errors.New("spellcheck: locale is not supported")

var supportedDictionaries = map[string]DictionaryFiles{
	"de-DE": {AffFile: "de_DE_frami.aff", DicFile: "de_DE_frami.dic"},
	"en-AU": {AffFile: "en_AU.aff", DicFile: "en_AU.dic"},
	"en-GB": {AffFile: "en_GB.aff", DicFile: "en_GB.dic"},
	"en-US": {AffFile: "en_US.aff", DicFile: "en_US.dic"},
	"es-AR": {AffFile: "es_AR.aff", DicFile: "es_AR.dic"},
	"es-ES": {AffFile: "es_ES.aff", DicFile: "es_ES.dic"},
	"es-MX": {AffFile: "es_MX.aff", DicFile: "es_MX.dic"},
	"fr-FR": {AffFile: "fr.aff", DicFile: "fr.dic"},
	"hi-IN": {AffFile: "hi_IN.aff", DicFile: "hi_IN.dic"},
	"id-ID": {AffFile: "id_ID.aff", DicFile: "id_ID.dic"},
	"it-IT": {AffFile: "it_IT.aff", DicFile: "it_IT.dic"},
	"ko-KR": {AffFile: "ko_KR.aff", DicFile: "ko_KR.dic"},
	"ms-MY": {AffFile: "ms_MY.aff", DicFile: "ms_MY.dic"},
	"nl-NL": {AffFile: "nl_NL.aff", DicFile: "nl_NL.dic"},
	"pl-PL": {AffFile: "pl_PL.aff", DicFile: "pl_PL.dic"},
	"pt-BR": {AffFile: "pt_BR.aff", DicFile: "pt_BR.dic"},
	"pt-PT": {AffFile: "pt_PT.aff", DicFile: "pt_PT.dic"},
	"sv-SE": {AffFile: "sv_SE.aff", DicFile: "sv_SE.dic"},
	"tr-TR": {AffFile: "tr_TR.aff", DicFile: "tr_TR.dic"},
	"vi-VN": {AffFile: "vi_VN.aff", DicFile: "vi_VN.dic"},
}

type Registry struct {
	dictionaries map[string]DictionaryFiles
}

func NewRegistry(dictionaries map[string]DictionaryFiles) *Registry {
	copied := make(map[string]DictionaryFiles, len(dictionaries))
	for locale, files := range dictionaries {
		copied[locale] = files
	}
	return &Registry{dictionaries: copied}
}

func LoadRegistry() *Registry {
	return NewRegistry(supportedDictionaries)
}

func (r *Registry) Resolve(locale string) (DictionaryFiles, error) {
	files, ok := r.dictionaries[locale]
	if !ok {
		return DictionaryFiles{}, fmt.Errorf("%w: %q", ErrUnsupportedLocale, locale)
	}
	return files, nil
}

func (r *Registry) SupportedLocales() []string {
	locales := make([]string, 0, len(r.dictionaries))
	for locale := range r.dictionaries {
		locales = append(locales, locale)
	}
	sort.Strings(locales)
	return locales
}
