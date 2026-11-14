package reporting

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// DB is a pool or transaction the Reports queries run on.
type DB interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

// Pool begins the read-only or write transaction a report uses.
type Pool interface {
	DB
	Begin(context.Context) (pgx.Tx, error)
}

func isNoRows(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func utf16Length(value string) int {
	for i := 0; i < len(value); i++ {
		if value[i] >= 0x80 {
			n := 0
			for _, r := range value {
				if r > 0xffff {
					n += 2
				} else {
					n++
				}
			}
			return n
		}
	}
	return len(value)
}

func jsTrim(value string) string {
	isSpace := func(r rune) bool {
		return r >= '\t' && r <= '\r' || r == '\uFEFF' || r == '\u2028' || r == '\u2029' || unicode.Is(unicode.Zs, r)
	}
	start, end := 0, len(value)
	for start < end {
		r, size := utf8.DecodeRuneInString(value[start:])
		if !isSpace(r) {
			break
		}
		start += size
	}
	for end > start {
		r, size := utf8.DecodeLastRuneInString(value[:end])
		if !isSpace(r) {
			break
		}
		end -= size
	}
	return value[start:end]
}

func isJSONNull(raw json.RawMessage) bool {
	trimmed := bytes.TrimSpace(raw)
	return len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null"))
}

var apiKeyIDPattern = regexp.MustCompile(`^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$`)

const qaProjectTeamAccessSQL = `($%d or exists(
            select 1 from team_memberships m
            join teams t on t.id = m.team_id
            where m.user_id = $%d and t.organization_id = $%d
            and (t.id = p.team_id or (p.team_id is null and t.slug = 'default'))
        ))`

func formatQaProjectTeamAccessSQL(orgWideParam, userParam, orgParam int) string {
	return fmt.Sprintf(qaProjectTeamAccessSQL, orgWideParam, userParam, orgParam)
}

// organizationCapabilityByRole is the subset of the web policy table Reports checks.
var organizationCapabilityByRole = map[string]map[string]struct{}{
	"admin": {
		"workspace:read": {}, "workspace:update": {}, "members:invite": {}, "teams:write": {},
		"projects:read": {}, "jobs:read": {}, "jobs:create": {}, "jobs:write": {},
		"memories:read": {}, "memories:write": {},
		"api_keys:read": {}, "api_keys:write": {},
		"integrations:write": {},
		"ai_actions:run":     {}, "billing:read": {}, "billing:write": {},
	},
	"localization_manager": {
		"workspace:read": {}, "workspace:update": {}, "members:invite": {}, "teams:write": {},
		"projects:read": {}, "jobs:read": {}, "jobs:create": {}, "jobs:write": {},
		"memories:read": {}, "memories:write": {},
		"api_keys:read": {}, "api_keys:write": {},
		"integrations:write": {},
		"ai_actions:run":     {}, "billing:read": {},
	},
	"developer": {
		"workspace:read": {},
		"projects:read":  {}, "jobs:read": {}, "jobs:create": {}, "jobs:write": {},
		"memories:read":  {},
		"ai_actions:run": {},
	},
	"reviewer": {
		"workspace:read": {},
		"projects:read":  {}, "jobs:read": {}, "jobs:create": {}, "jobs:write": {},
		"memories:read":  {},
		"ai_actions:run": {},
	},
	"translator": {
		"workspace:read": {},
		"projects:read":  {}, "jobs:read": {}, "jobs:create": {}, "jobs:write": {},
		"memories:read":  {},
		"ai_actions:run": {},
	},
	"member": {
		"workspace:read": {},
		"projects:read":  {}, "jobs:read": {}, "memories:read": {},
	},
}

func hasOrganizationCapability(role, capability string) bool {
	caps, ok := organizationCapabilityByRole[role]
	if !ok {
		return false
	}
	_, ok = caps[capability]
	return ok
}

var jsDecimalLiteralPattern = regexp.MustCompile(`^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$`)

func jsNumber(raw string) float64 {
	value := jsTrim(raw)
	switch value {
	case "":
		return 0
	case "Infinity", "+Infinity":
		return math.Inf(1)
	case "-Infinity":
		return math.Inf(-1)
	}
	if len(value) > 2 && value[0] == '0' {
		base := 0
		switch value[1] {
		case 'x', 'X':
			base = 16
		case 'o', 'O':
			base = 8
		case 'b', 'B':
			base = 2
		}
		if base != 0 {
			return jsRadixNumber(value[2:], base)
		}
	}
	if !jsDecimalLiteralPattern.MatchString(value) {
		return math.NaN()
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil && !errors.Is(err, strconv.ErrRange) {
		return math.NaN()
	}
	return parsed
}

func jsRadixNumber(digits string, base int) float64 {
	var result float64
	for _, r := range digits {
		digit, err := strconv.ParseUint(string(r), base, 8)
		if err != nil {
			return math.NaN()
		}
		result = result*float64(base) + float64(digit)
	}
	return result
}

func readWorkspaceObject(r *http.Request) (map[string]json.RawMessage, error) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, reportingInvalid("invalid_payload")
	}
	if len(strings.TrimSpace(string(body))) == 0 {
		return map[string]json.RawMessage{}, nil
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(body, &fields); err != nil {
		return nil, reportingInvalid("invalid_payload")
	}
	return fields, nil
}
