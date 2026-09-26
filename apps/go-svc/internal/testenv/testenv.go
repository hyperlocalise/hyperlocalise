package testenv

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	gosvcvalkey "github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/valkey"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

const (
	EnvIntegration = "GO_SVC_INTEGRATION"
	EnvDatabaseURL = "DATABASE_URL"
	EnvValkeyURL   = "VALKEY_URL"
)

var (
	startOnce sync.Once
	startErr  error
	pool      *pgxpool.Pool
	valkey    *gosvcvalkey.Client
)

// Require fails the test when GO_SVC_INTEGRATION=1 and dependencies are missing.
// Otherwise it skips so local `go test ./...` without Docker still runs unit tests.
func Require(t *testing.T) {
	t.Helper()
	missing := missingDeps()
	if len(missing) == 0 {
		return
	}
	if os.Getenv(EnvIntegration) == "1" {
		t.Fatalf("%s=1 requires %s", EnvIntegration, strings.Join(missing, " and "))
	}
	t.Skipf("set %s to run go-svc integration tests", strings.Join(missing, " and "))
}

func missingDeps() []string {
	var missing []string
	if strings.TrimSpace(os.Getenv(EnvDatabaseURL)) == "" {
		missing = append(missing, EnvDatabaseURL)
	}
	if strings.TrimSpace(os.Getenv(EnvValkeyURL)) == "" {
		missing = append(missing, EnvValkeyURL)
	}
	return missing
}

// Open returns the process-wide pool and Valkey client.
func Open(t *testing.T) (*pgxpool.Pool, *gosvcvalkey.Client) {
	t.Helper()
	Require(t)
	startOnce.Do(func() {
		ctx := context.Background()
		pool, startErr = pgxpool.New(ctx, os.Getenv(EnvDatabaseURL))
		if startErr != nil {
			return
		}
		if startErr = pool.Ping(ctx); startErr != nil {
			pool.Close()
			pool = nil
			return
		}
		valkey, startErr = gosvcvalkey.NewClient(gosvcvalkey.Config{URL: os.Getenv(EnvValkeyURL)})
		if startErr != nil {
			pool.Close()
			pool = nil
			return
		}
		if startErr = valkey.Ping(ctx); startErr != nil {
			valkey.Close()
			pool.Close()
			valkey = nil
			pool = nil
			return
		}
		_ = valkey.Inner().Do(ctx, valkey.Inner().B().Flushdb().Build()).Error()
	})
	require.NoError(t, startErr)
	require.NotNil(t, pool)
	require.NotNil(t, valkey)
	return pool, valkey
}

// Scope is one isolated org/user/membership (and optional project) for a test.
type Scope struct {
	Pool                 *pgxpool.Pool
	Valkey               *gosvcvalkey.Client
	UserID               string
	OrganizationID       string
	WorkOSUserID         string
	WorkOSOrganizationID string
	WorkOSMembershipID   string
	Slug                 string
	Role                 string
	ProjectID            string
}

// Options controls Seed.
type Options struct {
	Role        string
	WithProject bool
	ProjectID   string
}

// Seed inserts a unique org, user, and membership. Cleanup deletes the org (cascades) and user.
func Seed(t *testing.T, opts Options) *Scope {
	t.Helper()
	db, cache := Open(t)
	role := strings.TrimSpace(opts.Role)
	if role == "" {
		role = "admin"
	}
	suffix := uuid.NewString()
	scope := &Scope{
		Pool:                 db,
		Valkey:               cache,
		UserID:               uuid.NewString(),
		OrganizationID:       uuid.NewString(),
		WorkOSUserID:         "user_" + suffix,
		WorkOSOrganizationID: "org_" + suffix,
		WorkOSMembershipID:   "om_" + suffix,
		Slug:                 "org-" + strings.ReplaceAll(suffix[:12], "-", ""),
		Role:                 role,
		ProjectID:            opts.ProjectID,
	}
	if scope.ProjectID == "" {
		scope.ProjectID = "project_" + strings.ReplaceAll(suffix[:8], "-", "")
	}
	ctx := t.Context()
	_, err := db.Exec(ctx, `
        insert into users (id, workos_user_id, email)
        values ($1, $2, $3)`,
		scope.UserID, scope.WorkOSUserID, suffix+"@example.com")
	require.NoError(t, err)
	_, err = db.Exec(ctx, `
        insert into organizations (id, workos_organization_id, name, slug, lifecycle_status)
        values ($1, $2, $3, $4, 'active')`,
		scope.OrganizationID, scope.WorkOSOrganizationID, "Acme "+suffix, scope.Slug)
	require.NoError(t, err)
	_, err = db.Exec(ctx, `
        insert into organization_memberships (organization_id, user_id, workos_membership_id, role)
        values ($1, $2, $3, $4)`,
		scope.OrganizationID, scope.UserID, scope.WorkOSMembershipID, mapSeedRole(role))
	require.NoError(t, err)
	if opts.WithProject {
		scope.MustProject(t, scope.ProjectID, "Project")
	}
	t.Cleanup(func() {
		cleanupCtx := context.Background()
		_, _ = db.Exec(cleanupCtx, `delete from organizations where id=$1`, scope.OrganizationID)
		_, _ = db.Exec(cleanupCtx, `delete from users where id=$1`, scope.UserID)
	})
	return scope
}

func mapSeedRole(role string) string {
	switch role {
	case "admin", "member":
		return role
	default:
		// organization_memberships.role is owner|admin|member. Fine-grained
		// product roles come from the WorkOS lookup stub, not this column.
		return "member"
	}
}

// Membership returns a WorkOS lookup that matches the seeded identity.
func (s *Scope) Membership(role string) func(context.Context, string) (*workos.UserOrganizationMembership, error) {
	if role == "" {
		role = s.Role
	}
	return func(_ context.Context, id string) (*workos.UserOrganizationMembership, error) {
		return &workos.UserOrganizationMembership{
			ID:             s.WorkOSMembershipID,
			UserID:         s.WorkOSUserID,
			OrganizationID: s.WorkOSOrganizationID,
			Status:         "active",
			Role:           &workos.SlimRole{Slug: role},
		}, nil
	}
}

// OrgPath is /v1/orgs/{slug}{suffix}.
func (s *Scope) OrgPath(suffix string) string {
	if suffix == "" {
		return "/v1/orgs/" + s.Slug
	}
	if !strings.HasPrefix(suffix, "/") {
		suffix = "/" + suffix
	}
	return "/v1/orgs/" + s.Slug + suffix
}

// MustProject inserts a native project owned by the seeded org.
func (s *Scope) MustProject(t *testing.T, projectID, name string) string {
	t.Helper()
	if projectID == "" {
		projectID = s.ProjectID
	}
	if name == "" {
		name = "Project"
	}
	identifier := projectIdentifier(projectID)
	_, err := s.Pool.Exec(t.Context(), `
        insert into projects (
            id, organization_id, created_by_user_id, name, identifier, source
        ) values ($1, $2, $3, $4, $5, 'native')`,
		projectID, s.OrganizationID, s.UserID, name, identifier)
	require.NoError(t, err)
	s.ProjectID = projectID
	return projectID
}

func projectIdentifier(projectID string) string {
	trimmed := strings.ToUpper(strings.ReplaceAll(projectID, "_", ""))
	if len(trimmed) > 10 {
		trimmed = trimmed[:10]
	}
	if trimmed == "" || trimmed[0] < 'A' || trimmed[0] > 'Z' {
		return "P" + strings.ToUpper(strings.ReplaceAll(uuid.NewString(), "-", "")[:8])
	}
	return trimmed
}

// MustDictionary inserts an active spellcheck word library.
func (s *Scope) MustDictionary(t *testing.T, id, name string) string {
	t.Helper()
	if id == "" {
		id = uuid.NewString()
	}
	if name == "" {
		name = "Brand names"
	}
	_, err := s.Pool.Exec(t.Context(), `
        insert into spellcheck_word_libraries (
            id, organization_id, created_by_user_id, name, description, status, words_version
        ) values ($1, $2, $3, $4, '', 'active', 1)`,
		id, s.OrganizationID, s.UserID, name)
	require.NoError(t, err)
	return id
}

// MustDictionaryWord inserts an accepted token.
func (s *Scope) MustDictionaryWord(t *testing.T, dictionaryID, locale, word string) string {
	t.Helper()
	id := uuid.NewString()
	_, err := s.Pool.Exec(t.Context(), `
        insert into spellcheck_word_library_words (
            id, library_id, locale, word, word_normalized, created_by_user_id
        ) values ($1, $2, $3, $4, $5, $6)`,
		id, dictionaryID, locale, word, strings.ToLower(word), s.UserID)
	require.NoError(t, err)
	return id
}

// MustAttachDictionary attaches a library to a project.
func (s *Scope) MustAttachDictionary(t *testing.T, projectID, dictionaryID string, priority int) {
	t.Helper()
	_, err := s.Pool.Exec(t.Context(), `
        insert into project_spellcheck_word_libraries (
            organization_id, project_id, library_id, priority
        ) values ($1, $2, $3, $4)`,
		s.OrganizationID, projectID, dictionaryID, priority)
	require.NoError(t, err)
}

// MustTeam inserts a team and optional membership for the seeded user.
func (s *Scope) MustTeam(t *testing.T, slug, name, memberRole string) string {
	t.Helper()
	id := uuid.NewString()
	_, err := s.Pool.Exec(t.Context(), `
        insert into teams (id, organization_id, slug, name) values ($1, $2, $3, $4)`,
		id, s.OrganizationID, slug, name)
	require.NoError(t, err)
	if memberRole != "" {
		_, err = s.Pool.Exec(t.Context(), `
            insert into team_memberships (team_id, user_id, role) values ($1, $2, $3)`,
			id, s.UserID, memberRole)
		require.NoError(t, err)
	}
	return id
}

// MustGlossary inserts a native org-controlled glossary.
func (s *Scope) MustGlossary(t *testing.T, id, name, sourceLocale string) string {
	t.Helper()
	if id == "" {
		id = uuid.NewString()
	}
	if name == "" {
		name = "Marketing Glossary"
	}
	if sourceLocale == "" {
		sourceLocale = "en"
	}
	_, err := s.Pool.Exec(t.Context(), `
        insert into glossaries (
            id, organization_id, created_by_user_id, name, description, source_locale, status, source, control_level
        ) values ($1, $2, $3, $4, '', $5, 'active', 'native', 'org')`,
		id, s.OrganizationID, s.UserID, name, sourceLocale)
	require.NoError(t, err)
	return id
}

// MustMemory inserts a native translation memory.
func (s *Scope) MustMemory(t *testing.T, id, name string) string {
	t.Helper()
	if id == "" {
		id = uuid.NewString()
	}
	if name == "" {
		name = "Product TM"
	}
	_, err := s.Pool.Exec(t.Context(), `
        insert into memories (
            id, organization_id, created_by_user_id, name, description, status, source
        ) values ($1, $2, $3, $4, '', 'active', 'native')`,
		id, s.OrganizationID, s.UserID, name)
	require.NoError(t, err)
	return id
}

// String is a stable debug label.
func (s *Scope) String() string {
	return fmt.Sprintf("org=%s slug=%s user=%s", s.OrganizationID, s.Slug, s.UserID)
}
