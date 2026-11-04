package tmscatalog

import (
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Phrase is two products, and the connection's auth mode says which one the
// token is for: OAuth connections reach Phrase TMS (translation memories and
// term bases), API tokens reach Phrase Strings (glossaries, no memories).

const (
	phraseOAuthMode         = "oauth"
	phraseTMSPageSize       = 50
	phraseStringsPageSize   = 100
	phraseExportPoll        = time.Second
	phraseMaxErrorBytes     = 64 << 10
	phraseStringsIDSplitter = ":"
)

func newPhrase(credentials Credentials, httpClient HTTPDoer) Provider {
	credentials.BaseURL = strings.TrimRight(strings.TrimSpace(credentials.BaseURL), "/")
	client := phraseClient{credentials: credentials, http: httpClient}
	if strings.EqualFold(strings.TrimSpace(credentials.AuthMode), phraseOAuthMode) {
		return &phraseTMS{client: client, pollEvery: phraseExportPoll}
	}
	return &phraseStrings{client: client}
}

type phraseClient struct {
	credentials Credentials
	http        HTTPDoer
}

func (c phraseClient) do(ctx context.Context, method, path string, body any) (*http.Response, error) {
	return c.request(ctx, method, path, body, "application/json")
}

// doDownload fetches a TBX/TMX file. Do not send Accept: application/json —
// Phrase then answers 406 or wraps the file in JSON.
func (c phraseClient) doDownload(ctx context.Context, path string) (*http.Response, error) {
	return c.request(ctx, http.MethodGet, path, nil, "")
}

func (c phraseClient) request(ctx context.Context, method, path string, body any, accept string) (*http.Response, error) {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.credentials.BaseURL+path, reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set(c.credentials.HeaderName, c.credentials.HeaderValue)
	if accept != "" {
		req.Header.Set("Accept", accept)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return c.http.Do(req)
}

func (c phraseClient) doJSON(ctx context.Context, method, path string, body any, out any) error {
	res, err := c.do(ctx, method, path, body)
	if err != nil {
		return err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return phraseError(res)
	}
	return json.NewDecoder(res.Body).Decode(out)
}

// phraseError keeps Phrase's message. TMS answers {"errorDescription":"…"},
// Strings {"message":"…"}.
func phraseError(res *http.Response) error {
	raw, _ := io.ReadAll(io.LimitReader(res.Body, phraseMaxErrorBytes))
	var body struct {
		ErrorDescription string `json:"errorDescription"`
		Message          string `json:"message"`
	}
	_ = json.Unmarshal(raw, &body)
	message := firstNonBlank(body.ErrorDescription, body.Message)
	if message != "" {
		message = "Phrase: " + message
	}
	return &ProviderError{Status: res.StatusCode, Message: message}
}

// phraseTMS reads Phrase TMS (api2), whose BaseURL is the …/web origin.
type phraseTMS struct {
	client    phraseClient
	pollEvery time.Duration
}

type phraseTMSResource struct {
	UID         string   `json:"uid"`
	Name        string   `json:"name"`
	SourceLang  string   `json:"sourceLang"`
	TargetLangs []string `json:"targetLangs"`
	Langs       []string `json:"langs"`
}

func phraseTMSList(ctx context.Context, c phraseClient, path string) ([]phraseTMSResource, error) {
	items := []phraseTMSResource{}
	for page := 0; ; page++ {
		var body struct {
			Content    []phraseTMSResource `json:"content"`
			TotalPages int                 `json:"totalPages"`
		}
		query := "?pageNumber=" + strconv.Itoa(page) + "&pageSize=" + strconv.Itoa(phraseTMSPageSize)
		if err := c.doJSON(ctx, http.MethodGet, path+query, nil, &body); err != nil {
			return nil, err
		}
		items = append(items, body.Content...)
		if len(body.Content) < phraseTMSPageSize || page+1 >= body.TotalPages {
			return items, nil
		}
	}
}

func (p *phraseTMS) ListGlossaries(ctx context.Context) ([]Resource, error) {
	termBases, err := phraseTMSList(ctx, p.client, "/api2/v1/termBases")
	if err != nil {
		return nil, err
	}
	resources := make([]Resource, 0, len(termBases))
	for _, termBase := range termBases {
		// Term bases are multilingual with no source language; prefer English.
		source := phraseTermBaseSource(termBase.Langs)
		resource := Resource{ExternalID: termBase.UID, Name: firstNonBlank(termBase.Name, termBase.UID), TargetLocales: []string{}}
		if source != "" {
			resource.SourceLocale = &source
		}
		for _, lang := range termBase.Langs {
			if lang != source {
				resource.TargetLocales = append(resource.TargetLocales, lang)
			}
		}
		resources = append(resources, resource)
	}
	return resources, nil
}

func phraseTermBaseSource(langs []string) string {
	for _, lang := range langs {
		if lang == "en" || strings.HasPrefix(strings.ToLower(lang), "en_") || strings.HasPrefix(strings.ToLower(lang), "en-") {
			return lang
		}
	}
	if len(langs) > 0 {
		return langs[0]
	}
	return ""
}

func (p *phraseTMS) ListMemories(ctx context.Context) ([]Resource, error) {
	memories, err := phraseTMSList(ctx, p.client, "/api2/v1/transMemories")
	if err != nil {
		return nil, err
	}
	resources := make([]Resource, 0, len(memories))
	for _, memory := range memories {
		resource := Resource{ExternalID: memory.UID, Name: firstNonBlank(memory.Name, memory.UID), TargetLocales: nonNil(memory.TargetLangs)}
		if memory.SourceLang != "" {
			source := memory.SourceLang
			resource.SourceLocale = &source
		}
		resources = append(resources, resource)
	}
	return resources, nil
}

func (p *phraseTMS) ExportGlossary(ctx context.Context, externalID string, maxBytes int64) (Export, error) {
	res, err := p.client.doDownload(ctx, "/api2/v1/termBases/"+url.PathEscape(externalID)+"/export?format=Tbx")
	if err != nil {
		return Export{}, err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		return Export{}, phraseError(res)
	}
	content, err := readExportFile(res, "Phrase", maxBytes)
	return Export{Format: "tbx", Content: content}, err
}

// ExportMemory starts Phrase TMS's async TMX export for every target language
// and downloads it once ready.
func (p *phraseTMS) ExportMemory(ctx context.Context, externalID string, maxBytes int64) (Export, error) {
	var memory phraseTMSResource
	if err := p.client.doJSON(ctx, http.MethodGet, "/api2/v1/transMemories/"+url.PathEscape(externalID), nil, &memory); err != nil {
		return Export{}, err
	}
	if len(memory.TargetLangs) == 0 {
		return Export{}, &ProviderError{Status: http.StatusUnprocessableEntity, Message: "This Phrase translation memory has no target languages"}
	}
	var started struct {
		AsyncRequest struct {
			ID string `json:"id"`
		} `json:"asyncRequest"`
	}
	if err := p.client.doJSON(ctx, http.MethodPost, "/api2/v2/transMemories/"+url.PathEscape(externalID)+"/export", map[string]any{"exportTargetLangs": memory.TargetLangs}, &started); err != nil {
		return Export{}, err
	}
	if strings.TrimSpace(started.AsyncRequest.ID) == "" {
		return Export{}, fmt.Errorf("phrase: export started without an async request id")
	}
	downloadPath := "/api2/v1/transMemories/downloadExport/" + url.PathEscape(started.AsyncRequest.ID) + "?format=TMX"
	for {
		res, err := p.client.doDownload(ctx, downloadPath)
		if err != nil {
			return Export{}, err
		}
		switch res.StatusCode {
		case http.StatusOK:
			content, err := readExportFile(res, "Phrase", maxBytes)
			_ = res.Body.Close()
			return Export{Format: "tmx", Content: content}, err
		case http.StatusAccepted, http.StatusRequestTimeout, http.StatusTooManyRequests:
			// Not ready yet.
			_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, phraseMaxErrorBytes))
			_ = res.Body.Close()
		default:
			err := phraseError(res)
			_ = res.Body.Close()
			return Export{}, err
		}
		select {
		case <-ctx.Done():
			return Export{}, ctx.Err()
		case <-time.After(p.pollEvery):
		}
	}
}

// phraseStrings reads Phrase Strings (v2), whose glossaries belong to accounts.
// An external ID is "accountID:glossaryID".
type phraseStrings struct {
	client phraseClient
}

type phraseStringsGlossary struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Projects []struct {
		ID string `json:"id"`
	} `json:"projects"`
}

type phraseStringsTerm struct {
	ID           string `json:"id"`
	Term         string `json:"term"`
	Description  string `json:"description"`
	Translations []struct {
		LocaleCode string `json:"locale_code"`
		Content    string `json:"content"`
	} `json:"translations"`
}

func phraseStringsList[T any](ctx context.Context, c phraseClient, path string) ([]T, error) {
	items := []T{}
	for page := 1; ; page++ {
		separator := "?"
		if strings.Contains(path, "?") {
			separator = "&"
		}
		var batch []T
		query := separator + "page=" + strconv.Itoa(page) + "&per_page=" + strconv.Itoa(phraseStringsPageSize)
		if err := c.doJSON(ctx, http.MethodGet, path+query, nil, &batch); err != nil {
			return nil, err
		}
		items = append(items, batch...)
		if len(batch) < phraseStringsPageSize {
			return items, nil
		}
	}
}

func (p *phraseStrings) ListGlossaries(ctx context.Context) ([]Resource, error) {
	accounts, err := phraseStringsList[struct {
		ID string `json:"id"`
	}](ctx, p.client, "/accounts")
	if err != nil {
		return nil, err
	}
	sources := map[string]string{}
	resources := []Resource{}
	for _, account := range accounts {
		glossaries, err := phraseStringsList[phraseStringsGlossary](ctx, p.client, "/accounts/"+url.PathEscape(account.ID)+"/glossaries")
		if err != nil {
			return nil, err
		}
		for _, glossary := range glossaries {
			resource := Resource{
				ExternalID:    account.ID + phraseStringsIDSplitter + glossary.ID,
				Name:          firstNonBlank(glossary.Name, glossary.ID),
				TargetLocales: []string{},
			}
			if source := p.sourceLocale(ctx, glossary, sources); source != "" {
				resource.SourceLocale = &source
			}
			resources = append(resources, resource)
		}
	}
	return resources, nil
}

// ListMemories is empty: Phrase Strings has no translation memories.
func (p *phraseStrings) ListMemories(context.Context) ([]Resource, error) {
	return []Resource{}, nil
}

func (p *phraseStrings) ExportMemory(context.Context, string, int64) (Export, error) {
	return Export{}, &ProviderError{Status: http.StatusUnprocessableEntity, Message: "Phrase Strings has no translation memories. Connect Phrase TMS to import them."}
}

// ExportGlossary builds TBX from the glossary's terms; Phrase Strings has no
// glossary file export.
func (p *phraseStrings) ExportGlossary(ctx context.Context, externalID string, maxBytes int64) (Export, error) {
	accountID, glossaryID, ok := strings.Cut(externalID, phraseStringsIDSplitter)
	if !ok || accountID == "" || glossaryID == "" {
		return Export{}, &ProviderError{Status: http.StatusBadRequest, Message: "That Phrase glossary ID is not valid"}
	}
	glossaryPath := "/accounts/" + url.PathEscape(accountID) + "/glossaries/" + url.PathEscape(glossaryID)
	var glossary phraseStringsGlossary
	if err := p.client.doJSON(ctx, http.MethodGet, glossaryPath, nil, &glossary); err != nil {
		return Export{}, err
	}
	terms, err := phraseStringsList[phraseStringsTerm](ctx, p.client, glossaryPath+"/terms")
	if err != nil {
		return Export{}, err
	}
	source := p.sourceLocale(ctx, glossary, map[string]string{})
	if source == "" {
		source = "en"
	}
	content, err := phraseTBX(source, terms, maxBytes)
	return Export{Format: "tbx", Content: content}, err
}

// sourceLocale is the default locale of the glossary's first linked project,
// the language its terms are written in. Empty when no project says.
func (p *phraseStrings) sourceLocale(ctx context.Context, glossary phraseStringsGlossary, cache map[string]string) string {
	for _, project := range glossary.Projects {
		if source, ok := cache[project.ID]; ok {
			return source
		}
		locales, err := phraseStringsList[struct {
			Code    string `json:"code"`
			Default bool   `json:"default"`
		}](ctx, p.client, "/projects/"+url.PathEscape(project.ID)+"/locales")
		if err != nil {
			continue
		}
		for _, locale := range locales {
			if locale.Default {
				cache[project.ID] = locale.Code
				return locale.Code
			}
		}
	}
	return ""
}

// phraseTBX writes Phrase Strings terms as TBX-Basic: one termEntry per term,
// the term itself in the source language and each translation beside it.
func phraseTBX(sourceLocale string, terms []phraseStringsTerm, maxBytes int64) ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteString(xml.Header)
	encoder := xml.NewEncoder(&buf)
	name := func(local string) xml.Name { return xml.Name{Local: local} }
	lang := func(locale string) xml.Attr { return xml.Attr{Name: name("xml:lang"), Value: locale} }
	martif := xml.StartElement{Name: name("martif"), Attr: []xml.Attr{{Name: name("type"), Value: "TBX-Basic"}, lang(sourceLocale)}}
	text := xml.StartElement{Name: name("text")}
	body := xml.StartElement{Name: name("body")}
	langSet := func(locale, term string) error {
		start := xml.StartElement{Name: name("langSet"), Attr: []xml.Attr{lang(locale)}}
		tig := xml.StartElement{Name: name("tig")}
		if err := encoder.EncodeToken(start); err != nil {
			return err
		}
		if err := encoder.EncodeToken(tig); err != nil {
			return err
		}
		if err := encoder.EncodeElement(term, xml.StartElement{Name: name("term")}); err != nil {
			return err
		}
		if err := encoder.EncodeToken(tig.End()); err != nil {
			return err
		}
		return encoder.EncodeToken(start.End())
	}
	for _, token := range []xml.Token{martif, text, body} {
		if err := encoder.EncodeToken(token); err != nil {
			return nil, err
		}
	}
	for _, term := range terms {
		if strings.TrimSpace(term.Term) == "" {
			continue
		}
		entry := xml.StartElement{Name: name("termEntry"), Attr: []xml.Attr{{Name: name("id"), Value: term.ID}}}
		if err := encoder.EncodeToken(entry); err != nil {
			return nil, err
		}
		if description := strings.TrimSpace(term.Description); description != "" {
			if err := encoder.EncodeElement(description, xml.StartElement{Name: name("descrip"), Attr: []xml.Attr{{Name: name("type"), Value: "definition"}}}); err != nil {
				return nil, err
			}
		}
		if err := langSet(sourceLocale, term.Term); err != nil {
			return nil, err
		}
		for _, translation := range term.Translations {
			if strings.TrimSpace(translation.Content) == "" || translation.LocaleCode == sourceLocale {
				continue
			}
			if err := langSet(translation.LocaleCode, translation.Content); err != nil {
				return nil, err
			}
		}
		if err := encoder.EncodeToken(entry.End()); err != nil {
			return nil, err
		}
		if err := encoder.Flush(); err != nil {
			return nil, err
		}
		if int64(buf.Len()) > maxBytes {
			return nil, tooLarge("Phrase", maxBytes)
		}
	}
	for _, token := range []xml.Token{body.End(), text.End(), martif.End()} {
		if err := encoder.EncodeToken(token); err != nil {
			return nil, err
		}
	}
	if err := encoder.Flush(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
