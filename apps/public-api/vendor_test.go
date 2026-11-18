package main

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// memberWithRole adds a workspace member with the given role, in no team, and returns their id and email.
func (f dbFixture) memberWithRole(t *testing.T, role string) (id, email string) {
	t.Helper()
	id = uuid.NewString()
	email = id + "@example.com"
	f.exec(t, `INSERT INTO users (id, workos_user_id, email) VALUES ($1, $2, $3)`, id, "user_"+id, email)
	f.exec(t, `INSERT INTO organization_memberships (organization_id, user_id, workos_membership_id, role)
		VALUES ($1, $2, $3, $4::organization_membership_role)`, f.actor.OrganizationID, id, "om_"+id, role)
	t.Cleanup(func() { _, _ = f.pool.Exec(t.Context(), `DELETE FROM users WHERE id = $1`, id) })
	return id, email
}

// The API never acts for a vendor: a token is refused while its owner is one.
func TestVendorTokenIsRefused(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	auth := newPostgresAuthenticator(f.pool, nil)
	ownerID, _ := f.memberWithRole(t, "translator")
	token := "hl_test_" + uuid.NewString()
	hash := sha256.Sum256([]byte(token))
	f.exec(t, `INSERT INTO organization_api_keys
		(organization_id, name, key_hash, key_prefix, permissions, created_by_user_id)
		VALUES ($1, 'Made before becoming a vendor', $2, $3, '["jobs:read","files:read"]'::jsonb, $4)`,
		f.actor.OrganizationID, hex.EncodeToString(hash[:]), token[:8], ownerID)

	_, err := auth.authenticate(ctx, token)
	require.NoError(t, err)

	f.exec(t, `UPDATE organization_memberships SET role = 'vendor' WHERE user_id = $1`, ownerID)
	_, err = auth.authenticate(ctx, token)
	require.ErrorIs(t, err, errForbidden)

	f.exec(t, `UPDATE organization_memberships SET role = 'translator' WHERE user_id = $1`, ownerID)
	_, err = auth.authenticate(ctx, token)
	require.NoError(t, err)
}

// Permission checks never see the role, because the token is refused first. Should one ever
// reach them, a vendor's token carries nothing.
func TestVendorRoleHasNoPermission(t *testing.T) {
	stored := make([]string, 0, len(apiKeyScopeCapability))
	for scope := range apiKeyScopeCapability {
		stored = append(stored, scope)
	}
	require.Empty(t, effectivePermissions(stored, roleVendor))
	require.NotEmpty(t, effectivePermissions(stored, "member"))
}

// Who a job can be given to: any active member for a post-edit or proofread task on a file, a
// vendor included; for any other job, someone who can open the project, and never a vendor.
func TestJobOwnerRule(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	_, vendorEmail := f.memberWithRole(t, "vendor")
	_, offTeamEmail := f.memberWithRole(t, "translator")
	pendingID, pendingEmail := f.memberWithRole(t, "translator")
	f.exec(t, `UPDATE organization_memberships SET workos_membership_id = NULL WHERE user_id = $1`, pendingID)

	fileTask := "job_" + uuid.NewString()
	f.exec(t, `INSERT INTO jobs (id, organization_id, project_id, kind, status, input_payload)
		VALUES ($1, $2, $3, 'proofread', 'waiting_for_review', '{"sourceFileId":"file_1","targetLocales":["fr"]}'::jsonb)`,
		fileTask, f.actor.OrganizationID, f.project)
	otherJob := "job_" + uuid.NewString()
	f.exec(t, `INSERT INTO jobs (id, organization_id, project_id, kind, status, input_payload)
		VALUES ($1, $2, $3, 'translation', 'queued', '{"sourceFileId":"file_1"}'::jsonb)`,
		otherJob, f.actor.OrganizationID, f.project)
	stringsTask := "job_" + uuid.NewString()
	f.exec(t, `INSERT INTO jobs (id, organization_id, project_id, kind, status, input_payload)
		VALUES ($1, $2, $3, 'proofread', 'waiting_for_review', '{}'::jsonb)`,
		stringsTask, f.actor.OrganizationID, f.project)

	give := func(jobID, email string) error {
		_, err := f.store.updateJob(ctx, f.actor, jobID, jobPatch{OwnerEmail: optionalString{Set: true, Value: &email}})
		return err
	}

	t.Run("a task on a file goes to any active member", func(t *testing.T) {
		require.NoError(t, give(fileTask, vendorEmail))
		require.NoError(t, give(fileTask, offTeamEmail))
		require.ErrorIs(t, give(fileTask, pendingEmail), errJobOwnerUnassigable)
	})

	t.Run("any other job is never given to a vendor", func(t *testing.T) {
		require.ErrorIs(t, give(otherJob, vendorEmail), errJobOwnerVendor)
		require.ErrorIs(t, give(stringsTask, vendorEmail), errJobOwnerVendor)
	})

	t.Run("any other job still needs someone who can open the project", func(t *testing.T) {
		require.ErrorIs(t, give(otherJob, offTeamEmail), errJobOwnerUnassigable)
		require.ErrorIs(t, give(stringsTask, offTeamEmail), errJobOwnerUnassigable)
	})

	t.Run("a vendor left in the project's team is still refused", func(t *testing.T) {
		var teamID string
		require.NoError(t, f.pool.QueryRow(ctx, `INSERT INTO teams (organization_id, slug, name) VALUES ($1, 'default', 'Default') RETURNING id`,
			f.actor.OrganizationID).Scan(&teamID))
		f.exec(t, `INSERT INTO team_memberships (team_id, user_id, role)
			SELECT $1, u.id, 'member' FROM users u WHERE u.email = ANY($2)`, teamID, []string{vendorEmail, offTeamEmail})
		require.ErrorIs(t, give(otherJob, vendorEmail), errJobOwnerVendor)
		require.NoError(t, give(otherJob, offTeamEmail))
	})
}

func TestVendorOwnerErrorResponse(t *testing.T) {
	store := &fakeResourceStore{}
	store.jobErr = errJobOwnerVendor
	w := sendResource(t, resourcePrincipal(jobWriteScopes...), store, http.MethodPatch, "/v1/jobs/job_1", `{"title":"x"}`)
	require.Equal(t, http.StatusBadRequest, w.Code)
	require.Contains(t, w.Body.String(), "vendor_owner_not_allowed")
	require.Contains(t, w.Body.String(), vendorOwnerNotAllowedMessage)
}
