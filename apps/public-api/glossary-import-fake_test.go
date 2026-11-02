package main

import "context"

// fakeGlossaryImportStore satisfies resourceStore's glossary import methods for handler tests.
type fakeGlossaryImportStore struct{}

func (fakeGlossaryImportStore) queueGlossaryImport(context.Context, principal, string, glossaryImportInput) (glossaryImportReport, error) {
	return glossaryImportReport{}, errGlossaryImportUnavailable
}

func (fakeGlossaryImportStore) getGlossaryImportReport(context.Context, principal, string, string) (glossaryImportReport, error) {
	return glossaryImportReport{}, errGlossaryImportNotFound
}
