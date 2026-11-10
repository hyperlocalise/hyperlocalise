package tmscatalog

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// Lokalise projects and the files its keys name, as the web's
// lokalise-provider.ts reads them. Lokalise has no file objects: a file is
// every key that lists the same filename on the same platform.

const (
	lokaliseDefaultBaseURL = "https://api.lokalise.com/api2"
	lokalisePageLimit      = 100
	lokaliseKeyPageLimit   = 500
	lokaliseLocaleParallel = 15
	lokaliseMaxErrorBytes  = 64 << 10
)

var lokalisePlatforms = []string{"web", "ios", "android", "other"}

type lokalise struct {
	credentials Credentials
	http        HTTPDoer
}

func newLokalise(credentials Credentials, httpClient HTTPDoer) *lokalise {
	credentials.BaseURL = strings.TrimRight(strings.TrimSpace(credentials.BaseURL), "/")
	if credentials.BaseURL == "" {
		credentials.BaseURL = lokaliseDefaultBaseURL
	}
	return &lokalise{credentials: credentials, http: httpClient}
}

type lokaliseProject struct {
	ProjectID       string  `json:"project_id"`
	Name            string  `json:"name"`
	Description     *string `json:"description"`
	ProjectType     *string `json:"project_type"`
	TeamID          *int    `json:"team_id"`
	BaseLanguageID  *int    `json:"base_language_id"`
	BaseLanguageISO *string `json:"base_language_iso"`
}

type lokaliseLanguage struct {
	LangID  int    `json:"lang_id"`
	LangISO string `json:"lang_iso"`
}

type lokaliseKey struct {
	KeyID                  int             `json:"key_id"`
	Filenames              json.RawMessage `json:"filenames"`
	ModifiedAt             *string         `json:"modified_at"`
	TranslationsModifiedAt *string         `json:"translations_modified_at"`
}

// get decodes a Lokalise response and returns its next-page cursor, if any.
func (l *lokalise) get(ctx context.Context, path string, out any) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, l.credentials.BaseURL+path, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set(l.credentials.HeaderName, l.credentials.HeaderValue)
	req.Header.Set("Accept", "application/json")
	res, err := l.http.Do(req)
	if err != nil {
		return "", err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return "", lokaliseError(res)
	}
	if err := json.NewDecoder(res.Body).Decode(out); err != nil {
		return "", err
	}
	return strings.TrimSpace(res.Header.Get("X-Pagination-Next-Cursor")), nil
}

// lokaliseError keeps Lokalise's message: {"error":{"message":"…","code":401}}.
func lokaliseError(res *http.Response) error {
	raw, _ := io.ReadAll(io.LimitReader(res.Body, lokaliseMaxErrorBytes))
	var body struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	_ = json.Unmarshal(raw, &body)
	message := strings.TrimSpace(body.Error.Message)
	if message != "" {
		message = "Lokalise: " + message
	}
	return &ProviderError{Status: res.StatusCode, Message: message}
}

func (l *lokalise) ListProjects(ctx context.Context) ([]Project, error) {
	projects := []lokaliseProject{}
	for page := 1; ; page++ {
		var body struct {
			Projects []lokaliseProject `json:"projects"`
		}
		if _, err := l.get(ctx, "/projects?page="+strconv.Itoa(page)+"&limit="+strconv.Itoa(lokalisePageLimit), &body); err != nil {
			return nil, err
		}
		projects = append(projects, body.Projects...)
		if len(body.Projects) < lokalisePageLimit {
			break
		}
	}
	return mapConcurrent(ctx, projects, lokaliseLocaleParallel, l.projectWithLanguages)
}

func (l *lokalise) GetProject(ctx context.Context, externalID string) (*Project, error) {
	externalID = strings.TrimSpace(externalID)
	if externalID == "" {
		return nil, nil
	}
	var project lokaliseProject
	if _, err := l.get(ctx, "/projects/"+url.PathEscape(externalID), &project); err != nil {
		var providerErr *ProviderError
		if errors.As(err, &providerErr) && providerErr.Status == http.StatusNotFound {
			return nil, nil
		}
		return nil, err
	}
	out, err := l.projectWithLanguages(ctx, project)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (l *lokalise) projectWithLanguages(ctx context.Context, project lokaliseProject) (Project, error) {
	projectURL := lokaliseProjectURL(project.ProjectID)
	out := Project{
		ExternalID:    project.ProjectID,
		Name:          project.Name,
		TargetLocales: []string{},
		URL:           &projectURL,
		IsActive:      true,
		Metadata: map[string]any{
			"projectType":    project.ProjectType,
			"teamId":         project.TeamID,
			"description":    project.Description,
			"baseLanguageId": project.BaseLanguageID,
		},
	}
	languages, err := l.languages(ctx, project.ProjectID)
	if err != nil {
		var providerErr *ProviderError
		if errors.As(err, &providerErr) && (providerErr.Status == http.StatusUnauthorized || providerErr.Status == http.StatusForbidden) {
			return Project{}, err
		}
		out.Metadata["syncWarning"] = err.Error()
		return out, nil
	}
	out.SourceLocale = trimmedPtr(project.BaseLanguageISO)
	out.TargetLocales = lokaliseTargets(project.BaseLanguageID, out.SourceLocale, languages)
	return out, nil
}

func (l *lokalise) languages(ctx context.Context, projectID string) ([]lokaliseLanguage, error) {
	languages := []lokaliseLanguage{}
	for page := 1; ; page++ {
		var body struct {
			Languages []lokaliseLanguage `json:"languages"`
		}
		path := "/projects/" + url.PathEscape(projectID) + "/languages?page=" + strconv.Itoa(page) + "&limit=" + strconv.Itoa(lokalisePageLimit)
		if _, err := l.get(ctx, path, &body); err != nil {
			return nil, err
		}
		languages = append(languages, body.Languages...)
		if len(body.Languages) < lokalisePageLimit {
			return languages, nil
		}
	}
}

func lokaliseTargets(baseLanguageID *int, sourceLocale *string, languages []lokaliseLanguage) []string {
	targets := []string{}
	for _, language := range languages {
		switch {
		case baseLanguageID != nil:
			if language.LangID == *baseLanguageID {
				continue
			}
		case sourceLocale != nil:
			if strings.TrimSpace(language.LangISO) == *sourceLocale {
				continue
			}
		default:
			continue
		}
		if iso := strings.TrimSpace(language.LangISO); iso != "" {
			targets = append(targets, iso)
		}
	}
	return targets
}

// ListBranches: the web app lists no Lokalise branches.
func (l *lokalise) ListBranches(context.Context, string) ([]Branch, error) {
	return []Branch{}, nil
}

// ListFiles groups keys by the filename they name per platform.
func (l *lokalise) ListFiles(ctx context.Context, project Project, _ string, _ int) ([]File, error) {
	projectID := strings.TrimSpace(project.ExternalID)
	if projectID == "" {
		return nil, errors.New("lokalise: invalid project id")
	}
	keys, err := l.keys(ctx, projectID)
	if err != nil {
		return nil, err
	}
	sourceLocale := project.SourceLocale
	targetLocales := project.TargetLocales
	if sourceLocale == nil || len(targetLocales) == 0 {
		languages, err := l.languages(ctx, projectID)
		if err != nil {
			return nil, err
		}
		baseLanguageID, _ := project.Metadata["baseLanguageId"].(*int)
		if sourceLocale == nil && baseLanguageID != nil {
			for _, language := range languages {
				if language.LangID == *baseLanguageID {
					sourceLocale = stringPtr(language.LangISO)
				}
			}
		}
		if len(targetLocales) == 0 {
			targetLocales = lokaliseTargets(baseLanguageID, sourceLocale, languages)
		}
	}

	type discovered struct {
		platform, filename string
		revision           *string
	}
	order := []string{}
	files := map[string]*discovered{}
	for _, key := range keys {
		revision := firstPtr(key.TranslationsModifiedAt, key.ModifiedAt)
		for _, entry := range lokaliseFilenameEntries(key.Filenames) {
			resourceID := entry[0] + "::" + entry[1]
			if existing, ok := files[resourceID]; ok {
				existing.revision = laterRevision(existing.revision, revision)
				continue
			}
			files[resourceID] = &discovered{platform: entry[0], filename: entry[1], revision: revision}
			order = append(order, resourceID)
		}
	}

	projectURL := lokaliseProjectURL(projectID)
	out := make([]File, 0, len(order))
	for _, resourceID := range order {
		file := files[resourceID]
		out = append(out, File{
			ExternalResourceID: resourceID,
			ResourceType:       "file",
			SourcePath:         lokaliseSourcePath(sourceLocale, file.platform, file.filename),
			DisplayName:        file.filename,
			Format:             inferFormat(file.filename),
			Revision:           file.revision,
			ExternalURL:        &projectURL,
			SyncState:          "synced",
			SourceLocale:       sourceLocale,
			TargetLocales:      targetLocales,
		})
	}
	return out, nil
}

func (l *lokalise) keys(ctx context.Context, projectID string) ([]lokaliseKey, error) {
	keys := []lokaliseKey{}
	cursor := ""
	for {
		params := url.Values{}
		params.Set("pagination", "cursor")
		params.Set("limit", strconv.Itoa(lokaliseKeyPageLimit))
		params.Set("include_translations", "0")
		if cursor != "" {
			params.Set("cursor", cursor)
		}
		var body struct {
			Keys []lokaliseKey `json:"keys"`
		}
		next, err := l.get(ctx, "/projects/"+url.PathEscape(projectID)+"/keys?"+params.Encode(), &body)
		if err != nil {
			return nil, err
		}
		keys = append(keys, body.Keys...)
		if next == "" {
			return keys, nil
		}
		cursor = next
	}
}

// FileProgress: the web app reads per-file progress from Crowdin only.
func (l *lokalise) FileProgress(context.Context, string, string) ([]FileProgress, error) {
	return []FileProgress{}, nil
}

// HiddenFileIDs: the web app reads hidden files from Crowdin only.
func (l *lokalise) HiddenFileIDs(context.Context, string) ([]string, error) {
	return []string{}, nil
}

// lokaliseFilenameEntries reads a key's filenames, a string for every platform
// or an object per platform, as [platform, filename] pairs.
func lokaliseFilenameEntries(raw json.RawMessage) [][2]string {
	byPlatform := map[string]string{}
	var single string
	if err := json.Unmarshal(raw, &single); err == nil {
		for _, platform := range lokalisePlatforms {
			byPlatform[platform] = single
		}
	} else {
		_ = json.Unmarshal(raw, &byPlatform)
	}
	entries := [][2]string{}
	for _, platform := range lokalisePlatforms {
		if filename := strings.TrimSpace(byPlatform[platform]); filename != "" {
			entries = append(entries, [2]string{platform, filename})
		}
	}
	return entries
}

func lokaliseSourcePath(sourceLocale *string, platform, filename string) string {
	platform, filename = strings.TrimSpace(platform), strings.TrimSpace(filename)
	if sourceLocale != nil && strings.TrimSpace(*sourceLocale) != "" {
		return "locales/" + strings.TrimSpace(*sourceLocale) + "/" + platform + "/" + filename
	}
	return "files/" + platform + "/" + filename
}

func lokaliseProjectURL(projectID string) string {
	return "https://app.lokalise.com/project/" + encodeURIComponent(projectID) + "/"
}

func inferFormat(filename string) *string {
	dot := strings.LastIndex(filename, ".")
	if dot <= 0 || dot == len(filename)-1 {
		return nil
	}
	return stringPtr(strings.ToLower(filename[dot+1:]))
}

// laterRevision keeps the later of two timestamps, as strings compare for
// Lokalise's fixed "2006-01-02 15:04:05 (Etc/UTC)" format.
func laterRevision(current, next *string) *string {
	if current == nil {
		return next
	}
	if next != nil && *next > *current {
		return next
	}
	return current
}
