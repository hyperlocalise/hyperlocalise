package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func TestResolveLinkedDomainIdentity(t *testing.T) {
	domainKey, slug, source, err := resolveLinkedDomainIdentity("https://www.Example.com/path?q=1")
	require.NoError(t, err)
	require.Equal(t, "example.com", domainKey)
	require.Regexp(t, `^example-com-[a-z]{6}$`, slug)
	require.Equal(t, "https://example.com/", source)
	_, _, _, err = resolveLinkedDomainIdentity("http://127.0.0.1/")
	require.Error(t, err)
	_, _, _, err = resolveLinkedDomainIdentity("ftp://example.com/")
	require.Error(t, err)
}

func TestLinkedDomainCreateListAndCancel(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	h := workspaceHandler(scope, "admin", stubWorkspaceFlags{enabled: true})
	domain := fmt.Sprintf("migrate-%s.example", strings.ReplaceAll(uuid.NewString(), "-", ""))
	create := workspaceRequest(t, h, scope, http.MethodPost, scope.OrgPath("/domains/linked-domains"), `{"domain":"`+domain+`","marketIds":["france-fr"]}`)
	require.Equal(t, http.StatusCreated, create.Code, create.Body.String())
	var created struct {
		LinkedDomain struct {
			ID         string `json:"id"`
			DomainKey  string `json:"domainKey"`
			Status     string `json:"status"`
			Challenges struct {
				Token string `json:"token"`
			} `json:"challenges"`
		} `json:"linkedDomain"`
	}
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &created))
	require.NotEmpty(t, created.LinkedDomain.ID)
	require.Equal(t, domain, created.LinkedDomain.DomainKey)
	require.Equal(t, "pending_verification", created.LinkedDomain.Status)
	require.Len(t, created.LinkedDomain.Challenges.Token, 64)

	list := workspaceRequest(t, h, scope, http.MethodGet, scope.OrgPath("/domains/linked-domains"), "")
	require.Equal(t, http.StatusOK, list.Code, list.Body.String())
	require.Contains(t, list.Body.String(), created.LinkedDomain.ID)

	cancel := workspaceRequest(t, h, scope, http.MethodDelete, scope.OrgPath("/domains/linked-domains/"+created.LinkedDomain.ID), "")
	require.Equal(t, http.StatusNoContent, cancel.Code, cancel.Body.String())
}
