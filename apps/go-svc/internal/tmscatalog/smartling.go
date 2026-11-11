package tmscatalog

import (
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

const (
	smartlingPageLimit      = 100
	smartlingTMEntryLimit   = 500
	smartlingGlossaryLimit  = 5000
	smartlingMaxErrorBytes  = 64 << 10
	smartlingTbxVersion     = "TBXcoreStructV03"
	smartlingSuccessCode    = "SUCCESS"
	smartlingGlossaryAPI    = "/glossary-api/v2"
	smartlingGlossaryV3API  = "/glossary-api/v3"
	smartlingMemoryAPI      = "/translation-memory-api/v2"
	smartlingProjectsAPI    = "/projects-api/v2"
	smartlingJobsAPI        = "/jobs-api/v3"
	smartlingDefaultBaseURL = "https://api.smartling.com"
)

// ErrAccountRequired means Smartling's account UID is neither on the
// credential nor discoverable from a synced project.
var ErrAccountRequired = errors.New("tmscatalog: the Smartling account UID is unknown")

// smartling talks to Smartling's REST APIs. Glossaries and memories belong to
// an account, so every call needs its UID: from the credential, or resolved
// once from a project the workspace has synced.
type smartling struct {
	credentials Credentials
	http        HTTPDoer
	accountUID  string
}

func newSmartling(credentials Credentials, httpClient HTTPDoer) *smartling {
	credentials.BaseURL = strings.TrimRight(strings.TrimSpace(credentials.BaseURL), "/")
	if credentials.BaseURL == "" {
		credentials.BaseURL = smartlingDefaultBaseURL
	}
	return &smartling{
		credentials: credentials,
		http:        httpClient,
		accountUID:  strings.TrimSpace(credentials.AccountID),
	}
}

type smartlingSummary struct {
	GlossaryUID          string   `json:"glossaryUid"`
	TranslationMemoryUID string   `json:"translationMemoryUid"`
	Name                 string   `json:"name"`
	GlossaryName         string   `json:"glossaryName"`
	SourceLocaleID       string   `json:"sourceLocaleId"`
	LocaleIDs            []string `json:"localeIds"`
}

type smartlingTMEntry struct {
	EntryUID       string `json:"entryUid"`
	SourceText     string `json:"sourceText"`
	SourceLocaleID string `json:"sourceLocaleId"`
	Translations   []struct {
		TargetLocaleID  string `json:"targetLocaleId"`
		TranslationText string `json:"translationText"`
	} `json:"translations"`
}

type smartlingPage[T any] struct {
	TotalCount *int `json:"totalCount"`
	Items      []T  `json:"items"`
}

func (s *smartling) ListGlossaries(ctx context.Context) ([]Resource, error) {
	account, err := s.account(ctx)
	if err != nil {
		return nil, err
	}
	summaries, err := smartlingList[smartlingSummary](ctx, s, smartlingGlossaryAPI+"/accounts/"+url.PathEscape(account)+"/glossaries", nil, smartlingPageLimit)
	if err != nil {
		return nil, err
	}
	resources := make([]Resource, 0, len(summaries))
	for _, summary := range summaries {
		name := firstNonBlank(summary.Name, summary.GlossaryName, summary.GlossaryUID)
		// Smartling glossaries have no source language, only the locales they cover.
		resources = append(resources, Resource{
			ExternalID:    summary.GlossaryUID,
			Name:          name,
			TargetLocales: nonNil(summary.LocaleIDs),
		})
	}
	return resources, nil
}

func (s *smartling) ListMemories(ctx context.Context) ([]Resource, error) {
	memories, err := s.memories(ctx)
	if err != nil {
		return nil, err
	}
	resources := make([]Resource, 0, len(memories))
	for _, memory := range memories {
		resource := Resource{
			ExternalID:    memory.TranslationMemoryUID,
			Name:          firstNonBlank(memory.Name, memory.TranslationMemoryUID),
			TargetLocales: []string{},
		}
		if memory.SourceLocaleID != "" {
			source := memory.SourceLocaleID
			resource.SourceLocale = &source
		}
		for _, locale := range memory.LocaleIDs {
			if locale != memory.SourceLocaleID {
				resource.TargetLocales = append(resource.TargetLocales, locale)
			}
		}
		resources = append(resources, resource)
	}
	return resources, nil
}

// ExportGlossary uses Smartling's own TBX download. It returns up to the first
// 5,000 entries, the most one download request pages.
func (s *smartling) ExportGlossary(ctx context.Context, externalID string, maxBytes int64) (Export, error) {
	account, err := s.account(ctx)
	if err != nil {
		return Export{}, err
	}
	glossaryPath := smartlingGlossaryV3API + "/accounts/" + url.PathEscape(account) + "/glossaries/" + url.PathEscape(externalID)
	var glossary smartlingSummary
	if err := s.doData(ctx, http.MethodGet, glossaryPath, nil, &glossary); err != nil {
		return Export{}, err
	}
	if len(glossary.LocaleIDs) == 0 {
		return Export{}, &ProviderError{Status: http.StatusUnprocessableEntity, Message: "This Smartling glossary has no languages to export"}
	}
	body := map[string]any{
		"format":     "TBX",
		"tbxVersion": smartlingTbxVersion,
		"localeIds":  glossary.LocaleIDs,
		"filter":     map[string]any{"paging": map[string]int{"offset": 0, "limit": smartlingGlossaryLimit}},
	}
	res, err := s.do(ctx, http.MethodPost, glossaryPath+"/entries/download", body)
	if err != nil {
		return Export{}, err
	}
	defer func() { _ = res.Body.Close() }()
	content, err := readExportFile(res, "Smartling", maxBytes)
	if err != nil {
		return Export{}, err
	}
	return Export{Format: "tbx", Content: content}, nil
}

// ExportMemory builds TMX from the memory's entries; Smartling's TM API lists
// entries rather than handing back a TMX file.
func (s *smartling) ExportMemory(ctx context.Context, externalID string, maxBytes int64) (Export, error) {
	account, err := s.account(ctx)
	if err != nil {
		return Export{}, err
	}
	memories, err := s.memories(ctx)
	if err != nil {
		return Export{}, err
	}
	var memory *smartlingSummary
	for i := range memories {
		if memories[i].TranslationMemoryUID == externalID {
			memory = &memories[i]
			break
		}
	}
	if memory == nil {
		return Export{}, &ProviderError{Status: http.StatusNotFound, Message: "That Smartling translation memory no longer exists"}
	}
	if memory.SourceLocaleID == "" {
		return Export{}, &ProviderError{Status: http.StatusUnprocessableEntity, Message: "This Smartling translation memory has no source language"}
	}
	entries, err := smartlingList[smartlingTMEntry](ctx, s,
		smartlingMemoryAPI+"/accounts/"+url.PathEscape(account)+"/translation-memories/"+url.PathEscape(externalID)+"/entries",
		url.Values{"sourceLocaleId": {memory.SourceLocaleID}}, smartlingTMEntryLimit)
	if err != nil {
		return Export{}, err
	}
	content, err := smartlingTMX(memory.SourceLocaleID, entries, maxBytes)
	if err != nil {
		return Export{}, err
	}
	return Export{Format: "tmx", Content: content}, nil
}

func (s *smartling) memories(ctx context.Context) ([]smartlingSummary, error) {
	account, err := s.account(ctx)
	if err != nil {
		return nil, err
	}
	return smartlingList[smartlingSummary](ctx, s, smartlingMemoryAPI+"/accounts/"+url.PathEscape(account)+"/translation-memories", nil, smartlingPageLimit)
}

// account resolves the account UID from a synced project when the credential
// doesn't carry it.
func (s *smartling) account(ctx context.Context) (string, error) {
	if s.accountUID != "" {
		return s.accountUID, nil
	}
	projectID := strings.TrimSpace(s.credentials.ProjectID)
	if projectID == "" {
		return "", ErrAccountRequired
	}
	var project struct {
		AccountUID string `json:"accountUid"`
	}
	if err := s.doData(ctx, http.MethodGet, smartlingProjectsAPI+"/projects/"+url.PathEscape(projectID), nil, &project); err != nil {
		return "", err
	}
	if strings.TrimSpace(project.AccountUID) == "" {
		return "", ErrAccountRequired
	}
	s.accountUID = strings.TrimSpace(project.AccountUID)
	return s.accountUID, nil
}

func smartlingList[T any](ctx context.Context, s *smartling, path string, query url.Values, limit int) ([]T, error) {
	items := []T{}
	for offset := 0; ; offset += limit {
		params := url.Values{}
		for key, values := range query {
			params[key] = values
		}
		params.Set("limit", strconv.Itoa(limit))
		params.Set("offset", strconv.Itoa(offset))
		var page smartlingPage[T]
		if err := s.doData(ctx, http.MethodGet, path+"?"+params.Encode(), nil, &page); err != nil {
			return nil, err
		}
		items = append(items, page.Items...)
		if len(page.Items) < limit || (page.TotalCount != nil && len(items) >= *page.TotalCount) {
			return items, nil
		}
	}
}

// doData decodes Smartling's envelope, {"response":{"code":"SUCCESS","data":…}}.
// Some TM endpoints put data beside response rather than in it.
func (s *smartling) doData(ctx context.Context, method, path string, body any, out any) error {
	res, err := s.do(ctx, method, path, body)
	if err != nil {
		return err
	}
	defer func() { _ = res.Body.Close() }()
	var envelope struct {
		Response struct {
			Code string          `json:"code"`
			Data json.RawMessage `json:"data"`
		} `json:"response"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.NewDecoder(res.Body).Decode(&envelope); err != nil {
		return fmt.Errorf("smartling: decode response: %w", err)
	}
	if code := strings.TrimSpace(envelope.Response.Code); code != "" && !strings.EqualFold(code, smartlingSuccessCode) {
		return &ProviderError{Status: http.StatusBadGateway, Message: "Smartling answered " + code}
	}
	data := envelope.Response.Data
	if len(data) == 0 || string(data) == "null" {
		data = envelope.Data
	}
	if len(data) == 0 || string(data) == "null" {
		return fmt.Errorf("smartling: empty response data")
	}
	return json.Unmarshal(data, out)
}

func (s *smartling) do(ctx context.Context, method, path string, body any) (*http.Response, error) {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, s.credentials.BaseURL+path, reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set(s.credentials.HeaderName, s.credentials.HeaderValue)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		defer func() { _ = res.Body.Close() }()
		return nil, smartlingError(res)
	}
	return res, nil
}

// smartlingError keeps Smartling's message: {"response":{"errors":[{"message":"…"}]}}.
func smartlingError(res *http.Response) error {
	raw, _ := io.ReadAll(io.LimitReader(res.Body, smartlingMaxErrorBytes))
	var body struct {
		Response struct {
			Errors []struct {
				Message string `json:"message"`
			} `json:"errors"`
		} `json:"response"`
	}
	_ = json.Unmarshal(raw, &body)
	message := ""
	if len(body.Response.Errors) > 0 {
		message = strings.TrimSpace(body.Response.Errors[0].Message)
	}
	if message != "" {
		message = "Smartling: " + message
	}
	return &ProviderError{Status: res.StatusCode, Message: message}
}

// smartlingTMX writes entries as TMX 1.4, stopping once it passes maxBytes.
func smartlingTMX(sourceLocale string, entries []smartlingTMEntry, maxBytes int64) ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteString(xml.Header)
	encoder := xml.NewEncoder(&buf)
	attr := func(name, value string) xml.Attr { return xml.Attr{Name: xml.Name{Local: name}, Value: value} }
	tmx := xml.StartElement{Name: xml.Name{Local: "tmx"}, Attr: []xml.Attr{attr("version", "1.4")}}
	header := xml.StartElement{Name: xml.Name{Local: "header"}, Attr: []xml.Attr{
		attr("creationtool", "hyperlocalise"), attr("creationtoolversion", "1"), attr("segtype", "sentence"),
		attr("adminlang", "en"), attr("srclang", sourceLocale), attr("datatype", "PlainText"), attr("o-tmf", "smartling"),
	}}
	body := xml.StartElement{Name: xml.Name{Local: "body"}}
	seg := xml.StartElement{Name: xml.Name{Local: "seg"}}
	variant := func(locale, text string) error {
		tuv := xml.StartElement{Name: xml.Name{Local: "tuv"}, Attr: []xml.Attr{{Name: xml.Name{Local: "xml:lang"}, Value: locale}}}
		if err := encoder.EncodeToken(tuv); err != nil {
			return err
		}
		if err := encoder.EncodeElement(text, seg); err != nil {
			return err
		}
		return encoder.EncodeToken(tuv.End())
	}
	for _, token := range []xml.Token{tmx, header, header.End(), body} {
		if err := encoder.EncodeToken(token); err != nil {
			return nil, err
		}
	}
	for _, entry := range entries {
		if len(entry.Translations) == 0 {
			continue
		}
		tu := xml.StartElement{Name: xml.Name{Local: "tu"}, Attr: []xml.Attr{attr("tuid", entry.EntryUID)}}
		if err := encoder.EncodeToken(tu); err != nil {
			return nil, err
		}
		if err := variant(firstNonBlank(entry.SourceLocaleID, sourceLocale), entry.SourceText); err != nil {
			return nil, err
		}
		for _, translation := range entry.Translations {
			if err := variant(translation.TargetLocaleID, translation.TranslationText); err != nil {
				return nil, err
			}
		}
		if err := encoder.EncodeToken(tu.End()); err != nil {
			return nil, err
		}
		if err := encoder.Flush(); err != nil {
			return nil, err
		}
		if int64(buf.Len()) > maxBytes {
			return nil, tooLarge("Smartling", maxBytes)
		}
	}
	for _, token := range []xml.Token{body.End(), tmx.End()} {
		if err := encoder.EncodeToken(token); err != nil {
			return nil, err
		}
	}
	if err := encoder.Flush(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func tooLarge(provider string, maxBytes int64) error {
	return &ProviderError{Status: http.StatusRequestEntityTooLarge, Message: fmt.Sprintf("The %s export is larger than %d MB", provider, maxBytes>>20)}
}

func firstNonBlank(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func nonNil(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}
