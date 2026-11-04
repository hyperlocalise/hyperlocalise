package main

import (
	"errors"
	"net/http"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/tmscatalog"
)

func TestRequireTMSConnectionRejectsMissingIDs(t *testing.T) {
	t.Parallel()

	_, err := requireTMSConnection(t.Context(), nil, "org-1", tmsImportRequest{CredentialID: "", ExternalID: "ext-1"})
	var failure *tmsFailure
	if !errors.As(err, &failure) || failure.status != http.StatusBadRequest {
		t.Fatalf("err = %v", err)
	}
	_, err = requireTMSConnection(t.Context(), nil, "org-1", tmsImportRequest{CredentialID: "cred-1", ExternalID: ""})
	if !errors.As(err, &failure) || failure.status != http.StatusBadRequest {
		t.Fatalf("err = %v", err)
	}
}

func TestRequireTMSExportContent(t *testing.T) {
	t.Parallel()

	conn := tmsConnection{DisplayName: "Crowdin"}
	if err := requireTMSExportContent(tmscatalog.Export{Content: []byte("<tbx/>")}, conn); err != nil {
		t.Fatalf("non-empty: %v", err)
	}
	err := requireTMSExportContent(tmscatalog.Export{Content: []byte("  \n")}, conn)
	var failure *tmsFailure
	if !errors.As(err, &failure) || failure.code != "tms_export_empty" {
		t.Fatalf("err = %v", err)
	}
}

func TestTMSResourcesMapsCounts(t *testing.T) {
	t.Parallel()

	count := 4
	source := "en"
	resources := []tmscatalog.Resource{{
		ExternalID:    "g-1",
		Name:          "Brand",
		SourceLocale:  &source,
		TargetLocales: []string{"fr"},
		Count:         &count,
	}}
	glossaries := tmsResources(resources, true)
	if glossaries[0].TermCount == nil || *glossaries[0].TermCount != 4 || glossaries[0].SegmentCount != nil {
		t.Fatalf("glossaries = %#v", glossaries)
	}
	memories := tmsResources(resources, false)
	if memories[0].SegmentCount == nil || *memories[0].SegmentCount != 4 || memories[0].TermCount != nil {
		t.Fatalf("memories = %#v", memories)
	}
}
