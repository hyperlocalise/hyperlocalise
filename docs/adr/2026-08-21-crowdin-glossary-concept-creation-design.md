# Crowdin glossary concept creation

## Decision

Create a Crowdin glossary concept by adding its source term without a
`conceptId`. Crowdin creates the concept and returns its `conceptId`.

Then update the generated concept with concept-level metadata and add any
remaining terms using the returned `conceptId`.

## Failure behavior

The provider does not delete the created concept when a later metadata or term
request fails. This preserves the provider state and lets the user retry or
repair the partially created concept.

## Verification

Provider tests assert that the source term omits `conceptId`, metadata uses
`PUT /glossaries/{glossaryId}/concepts/{conceptId}`, and subsequent terms use
the generated concept ID. A failure test verifies that the source term remains
created when metadata update fails.
