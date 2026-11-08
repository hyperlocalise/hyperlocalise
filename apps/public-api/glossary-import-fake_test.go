package main

import "context"

// fakeGlossaryImportStore satisfies resourceStore's glossary import methods for handler tests.
type fakeGlossaryImportStore struct {
	importErr        error
	importInput      glossaryImportInput
	importGlossaryID string
	report           glossaryImportReport
	reportErr        error
	reportGlossaryID string
	reportID         string
}

func (s *fakeGlossaryImportStore) queueGlossaryImport(_ context.Context, _ principal, glossaryID string, input glossaryImportInput) (glossaryImportReport, error) {
	s.importGlossaryID = glossaryID
	s.importInput = input
	if s.importErr != nil {
		return glossaryImportReport{}, s.importErr
	}
	if s.report.ID != "" {
		return s.report, nil
	}
	return glossaryImportReport{
		ID:         "run-1",
		GlossaryID: glossaryID,
		Format:     input.Format,
		Mode:       input.Mode,
		Status:     "queued",
		Counts:     map[string]int{},
	}, nil
}

func (s *fakeGlossaryImportStore) getGlossaryImportReport(_ context.Context, _ principal, glossaryID, reportID string) (glossaryImportReport, error) {
	s.reportGlossaryID = glossaryID
	s.reportID = reportID
	if s.reportErr != nil {
		return glossaryImportReport{}, s.reportErr
	}
	if s.report.ID != "" {
		return s.report, nil
	}
	return glossaryImportReport{}, errGlossaryImportNotFound
}
