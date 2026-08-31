"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const glossaryDetailPageContentMessages = defineMessages({
  editName: {
    defaultMessage: "Edit glossary name",
    id: "8Pm5sD+4i4",
    description: "Accessible label for editing the glossary name",
  },
  saveName: {
    defaultMessage: "Save glossary name",
    id: "oHlz44sQOv",
    description: "Accessible label for saving the glossary name",
  },
  cancelNameEdit: {
    defaultMessage: "Cancel glossary name edit",
    id: "fxdG0zsb5y",
    description: "Accessible label for canceling the glossary name edit",
  },
  glossaryNameUpdated: {
    defaultMessage: "Glossary name updated",
    id: "wOWEjY5VIH",
    description: "Toast after the glossary name is updated successfully",
  },
  updateGlossaryNameFailed: {
    defaultMessage: "Unable to update glossary name",
    id: "nIdUueH9Jz",
    description: "Fallback error when updating the glossary name fails",
  },
  loadGlossaryFailed: {
    defaultMessage: "Unable to load glossary",
    id: "zdN3ToHnj1",
    description: "Fallback error when a glossary fails to load",
  },
  loadTermsFailed: {
    defaultMessage: "Unable to load terms",
    id: "JemgHUamHh",
    description: "Fallback error when glossary terms fail to load",
  },
  loadProjectsFailed: {
    defaultMessage: "Unable to load projects",
    id: "XYe4THixuv",
    description: "Fallback error when projects fail to load on the glossary detail page",
  },
  saveTermFailed: {
    defaultMessage: "Unable to save term",
    id: "iCizofrwwK",
    description: "Fallback error when saving a glossary term fails",
  },
  importTermsFailed: {
    defaultMessage: "Unable to import terms",
    id: "ujii3FwBE5",
    description: "Fallback error when importing glossary terms fails",
  },
  importGlossary: {
    defaultMessage: "Import glossary",
    id: "xhz41Pr74m",
    description: "Button to import a glossary file",
  },
  importingGlossary: {
    defaultMessage: "Importing glossary…",
    id: "JkMnd1m3E/",
    description: "Loading label shown while importing a glossary file",
  },
  importFormats: {
    defaultMessage: "TBX, XLSX, or CSV",
    id: "GEtF0nELl/",
    description: "Accepted glossary import file formats",
  },
  glossaryActions: {
    defaultMessage: "Glossary actions",
    id: "OU8ZFDP47O",
    description: "Accessible label for the glossary actions menu",
  },
  exportAsTbx: {
    defaultMessage: "Export as TBX",
    id: "Jh6eXznG+8",
    description: "Glossary action to export all concepts as TBX",
  },
  exportAsCsv: {
    defaultMessage: "Export as CSV",
    id: "j3NSWZrB6O",
    description: "Glossary action to export all concepts as CSV",
  },
  exportAsXlsx: {
    defaultMessage: "Export as XLSX",
    id: "duzSZb/s6p",
    description: "Glossary action to export all concepts as XLSX",
  },
  exportFilteredAsTbx: {
    defaultMessage: "Export filtered as TBX",
    id: "ksdqzG4/Xq",
    description: "Glossary action to export the current language filter as TBX",
  },
  exportFilteredAsCsv: {
    defaultMessage: "Export filtered as CSV",
    id: "erXgCbsSqH",
    description: "Glossary action to export the current language filter as CSV",
  },
  exportFilteredAsXlsx: {
    defaultMessage: "Export filtered as XLSX",
    id: "d9+py8mf04",
    description: "Glossary action to export the current language filter as XLSX",
  },
  exportComplete: {
    defaultMessage: "Glossary exported",
    id: "A/WlUY8Nlp",
    description: "Toast after a glossary export downloads successfully",
  },
  exportWarnings: {
    defaultMessage: "Glossary exported with {count} metadata warnings",
    id: "VzEu1cp3Je",
    description: "Toast after an export with representational warnings",
  },
  exportFailed: {
    defaultMessage: "Unable to export glossary",
    id: "TWs2x7bzrZ",
    description: "Fallback error when glossary export fails",
  },
  assignProjectFailed: {
    defaultMessage: "Unable to assign project",
    id: "TiFchnoh6y",
    description: "Fallback error when assigning a project to a glossary fails",
  },
  removeProjectFailed: {
    defaultMessage: "Unable to remove project",
    id: "1iMVYFQbGc",
    description: "Fallback error when removing a project from a glossary fails",
  },
  termUpdated: {
    defaultMessage: "Term updated",
    id: "msSg0cV36G",
    description: "Toast after a glossary term is updated successfully",
  },
  termAdded: {
    defaultMessage: "Term added",
    id: "y4YFxtSnJF",
    description: "Toast after a glossary term is added successfully",
  },
  termDeleted: {
    defaultMessage: "Term deleted",
    id: "isRKrk8w8z",
    description: "Toast after a glossary term is deleted successfully",
  },
  termsImported: {
    defaultMessage: "Imported {count, plural, one {# term} other {# terms}}",
    id: "w69BfzSUw0",
    description: "Toast after glossary terms are imported from a file",
  },
  projectAssigned: {
    defaultMessage: "Project assigned",
    id: "lgRbICxGNz",
    description: "Toast after a project is assigned to a glossary",
  },
  projectRemoved: {
    defaultMessage: "Project removed",
    id: "j+qma/tVWn",
    description: "Toast after a project is removed from a glossary",
  },
  loading: {
    defaultMessage: "Loading glossary...",
    id: "wZxi05pu7D",
    description: "Loading state on the glossary detail page",
  },
  notFound: {
    defaultMessage: "Glossary not found.",
    id: "NZeEWnotlt",
    description: "Empty state when a glossary cannot be found",
  },
  backToList: {
    defaultMessage: "Glossaries",
    id: "a4IAS0WZRR",
    description: "Back link from glossary detail to the list page",
  },
  backToGlossary: {
    defaultMessage: "Back to glossary",
    id: "rZcCh1J3Qx",
    description: "Back link from a concept detail page to its glossary",
  },
  sourceWorkspace: {
    defaultMessage: "Workspace",
    id: "5orwY/wNVx",
    description: "Badge for a native workspace glossary",
  },
  sourceProvider: {
    defaultMessage: "Provider",
    id: "RsvatD0q4G",
    description: "Badge for a provider-managed glossary",
  },
  controlLevelOrg: {
    defaultMessage: "Org",
    id: "P/pTxjwRBx",
    description: "Badge and option for an org-controlled glossary",
  },
  controlLevelTeam: {
    defaultMessage: "Team",
    id: "XcO+si/Q8F",
    description: "Badge and option for a team-controlled glossary",
  },
  deleteGlossary: {
    defaultMessage: "Delete glossary",
    id: "M66Lw6ds7d",
    description: "Button to delete the current glossary",
  },
  confirmDeleteGlossaryTitle: {
    defaultMessage: "Delete this glossary?",
    id: "vDWu8NEPDA",
    description: "Title of the glossary deletion confirmation dialog",
  },
  confirmDeleteGlossaryDescription: {
    defaultMessage:
      "This permanently deletes {glossaryName} and all of its concepts and terms. This action cannot be undone.",
    id: "TwXDgIzwCq",
    description: "Description of the glossary deletion confirmation dialog",
  },
  deleteGlossaryFailed: {
    defaultMessage: "Unable to delete glossary",
    id: "T4Nt0cVH3/",
    description: "Fallback error when deleting a glossary fails",
  },
  glossaryDeleted: {
    defaultMessage: "Glossary deleted",
    id: "NflNg4/F7g",
    description: "Toast after a glossary is deleted successfully",
  },
  localePair: {
    defaultMessage: "{sourceLocale} → {targetLocale}",
    id: "BOP4Yb+urd",
    description: "Locale pair badge on the glossary detail page",
  },
  descriptionFallback: {
    defaultMessage: "Manage terms and assign this glossary to projects.",
    id: "weWSzrQ1Qp",
    description: "Fallback description when a glossary has no description",
  },
  termsTitle: {
    defaultMessage: "Terms",
    id: "A025GrWZhB",
    description: "Section title for glossary terms",
  },
  termsDescription: {
    defaultMessage: "Add terms manually or import CSV/TBX files.",
    id: "QFfnQnu5uG",
    description: "Section description for glossary terms",
  },
  sourceTermLabel: {
    defaultMessage: "Source term",
    id: "2bzJ4YBqX2",
    description: "Label for the source term field on a glossary term form",
  },
  targetTermLabel: {
    defaultMessage: "Target term",
    id: "lOhCmO7eKl",
    description: "Label for the target term field on a glossary term form",
  },
  partOfSpeechLabel: {
    defaultMessage: "Part of speech",
    id: "r1aEK84u1V",
    description: "Label for the part of speech field on a glossary term form",
  },
  partOfSpeechSearchPlaceholder: {
    defaultMessage: "Search part of speech...",
    id: "wsUFAfa8Hd",
    description: "Search placeholder for the part of speech picker",
  },
  partOfSpeechNoMatches: {
    defaultMessage: "No categories found.",
    id: "CCHRUS19n3",
    description: "Empty search result in the part of speech picker",
  },
  termTypeFullFormDescription: {
    defaultMessage: "Complete form of a term",
    id: "F+qlLuaEi6",
    description: "Description for the full form term type",
  },
  termTypeAcronymDescription: {
    defaultMessage: "Initials pronounced as a word",
    id: "OMHukdK6Wt",
    description: "Description for the acronym term type",
  },
  termTypeAbbreviationDescription: {
    defaultMessage: "Shortened written form",
    id: "r7qqla56RV",
    description: "Description for the abbreviation term type",
  },
  termTypeShortFormDescription: {
    defaultMessage: "Informal shortened name",
    id: "04/aNgNk5U",
    description: "Description for the short form term type",
  },
  termTypePhraseDescription: {
    defaultMessage: "Multi-word expression",
    id: "kDMX9jypDk",
    description: "Description for the phrase term type",
  },
  termTypeVariantDescription: {
    defaultMessage: "Alternative form",
    id: "3s0Ll5QBJY",
    description: "Description for the variant term type",
  },
  descriptionLabel: {
    defaultMessage: "Description",
    id: "zXcAMcp/DE",
    description: "Label for the description field on a glossary term form",
  },
  updateTerm: {
    defaultMessage: "Update term",
    id: "cpV11AmTHs",
    description: "Button to save edits to an existing glossary term",
  },
  addTerm: {
    defaultMessage: "Add term",
    id: "inRpXeF/YP",
    description: "Button to add a new glossary term",
  },
  chooseTermLanguage: {
    defaultMessage: "Choose a language",
    id: "ihy++kxglc",
    description: "Title for the locale picker used when adding a concept term",
  },
  chooseTermLanguageDescription: {
    defaultMessage: "Choose the language for the new term.",
    id: "75hJUfKEfF",
    description: "Description for the locale picker used when adding a concept term",
  },
  cancelEdit: {
    defaultMessage: "Cancel edit",
    id: "eV8dpp9Cb+",
    description: "Button to cancel editing a glossary term",
  },
  editTerm: {
    defaultMessage: "Edit",
    id: "XOUlOpKBrL",
    description: "Button to edit a glossary term",
  },
  deleteTerm: {
    defaultMessage: "Delete",
    id: "ntLrh30Crw",
    description: "Button to delete a glossary term",
  },
  noTerms: {
    defaultMessage: "No terms yet.",
    id: "Nke6y6zMfg",
    description: "Empty state when a glossary has no terms",
  },
  assignedProjectsTitle: {
    defaultMessage: "Assigned projects",
    id: "SzY95cmXPi",
    description: "Section title for projects assigned to a glossary",
  },
  assignedProjectsDescription: {
    defaultMessage: "This glossary is used only by the projects listed here.",
    id: "LMGo1sN8VQ",
    description: "Section description for projects assigned to a glossary",
  },
  linkedProjectTitle: {
    defaultMessage: "Linked project",
    id: "kngndgvdvd",
    description: "Section title for the project linked to a provider glossary",
  },
  linkedProjectDescription: {
    defaultMessage: "This project is linked to the glossary in Crowdin.",
    id: "wdTIdTeD/X",
    description: "Section description for a provider-linked project",
  },
  selectProjectPlaceholder: {
    defaultMessage: "Select project",
    id: "PtdBUhTKib",
    description: "Placeholder for the project selector on the glossary detail page",
  },
  assignToProject: {
    defaultMessage: "Assign to project",
    id: "mmfrG6qsJL",
    description: "Button to assign a project to a glossary",
  },
  removeProject: {
    defaultMessage: "Remove",
    id: "n1O3p9QRl7",
    description: "Button to remove a project from a glossary",
  },
  noProjectsAssigned: {
    defaultMessage: "No projects assigned yet.",
    id: "qhM5Koe951",
    description: "Empty state when no projects are assigned to a glossary",
  },
  loadConceptsFailed: {
    defaultMessage: "Unable to load concepts",
    id: "ZIg96oUMGy",
    description: "Fallback error when glossary concepts fail to load",
  },
  saveConceptFailed: {
    defaultMessage: "Unable to save concept",
    id: "Fn04QYq5Dy",
    description: "Fallback error when a glossary concept save fails",
  },
  partOfSpeechRequired: {
    defaultMessage: "Select a valid part of speech for every term before saving.",
    id: "+/N0T0rYIa",
    description: "Validation error when a glossary term is missing a valid part of speech",
  },
  deleteConceptFailed: {
    defaultMessage: "Unable to delete concept",
    id: "4jUxO+lMSa",
    description: "Fallback error when a glossary concept deletion fails",
  },
  created: {
    defaultMessage: "Created",
    id: "ipOUZTrMNl",
    description: "Created timestamp column in the concept table",
  },
  lastModified: {
    defaultMessage: "Last modified",
    id: "cE93z6iT3O",
    description: "Last modified timestamp column in the concept table",
  },
  providerReadOnly: {
    defaultMessage: "This glossary is managed by its provider and is read-only here.",
    id: "+cqoUEt5BX",
    description: "Read-only explanation for provider-backed glossary detail",
  },
  conceptsTitle: {
    defaultMessage: "Concepts",
    id: "jI9SFqJ4/5",
    description: "Section title for the native glossary concept table",
  },
  conceptsDescription: {
    defaultMessage: "Group terms by meaning, then add locale-specific terms inside each concept.",
    id: "6PTSot2cji",
    description: "Description for the native glossary concept table",
  },
  addConcept: {
    defaultMessage: "Add concept",
    id: "C3/uLnFZyi",
    description: "Button to add a glossary concept",
  },
  filterLanguages: {
    defaultMessage: "Filter languages...",
    id: "52PUHNXgoK",
    description: "Filter input for concept editor language groups",
  },
  primaryTermLabel: {
    defaultMessage: "Primary term",
    id: "YDRK9UoH9i",
    description: "Label for the concept primary term",
  },
  subjectLabel: {
    defaultMessage: "Subject",
    id: "5Bc+gFzN2N",
    description: "Label for concept subject metadata",
  },
  definitionLabel: {
    defaultMessage: "Definition",
    id: "hz4nxyNP9X",
    description: "Label for the concept definition",
  },
  translatableLabel: {
    defaultMessage: "Translatable",
    id: "BERSauR8KR",
    description: "Label for the concept translatable toggle",
  },
  conceptDetails: {
    defaultMessage: "Concept details",
    id: "s7FQK+830n",
    description: "Expandable section for additional concept metadata",
  },
  noteLabel: {
    defaultMessage: "Note",
    id: "PO+O1tp1vE",
    description: "Label for concept notes",
  },
  urlLabel: {
    defaultMessage: "URL",
    id: "26SC3nQ3ca",
    description: "Label for concept reference URL",
  },
  termLabel: {
    defaultMessage: "Term",
    id: "4rrJOrJKWB",
    description: "Label for a locale-specific term",
  },
  genderLabel: {
    defaultMessage: "Gender",
    id: "YXXKbKuK0y",
    description: "Label for term gender metadata",
  },
  typeLabel: {
    defaultMessage: "Type",
    id: "ZeIi5DDF02",
    description: "Label for term type metadata",
  },
  statusLabel: {
    defaultMessage: "Status",
    id: "wMxGDB1lvE",
    description: "Label for term status metadata",
  },
  preferred: {
    defaultMessage: "Preferred",
    id: "nAOm8YPSCd",
    description: "Preferred native glossary term status",
  },
  draft: {
    defaultMessage: "Draft",
    id: "W8CHLNCqjs",
    description: "Draft native glossary term status",
  },
  notRecommended: {
    defaultMessage: "Not recommended",
    id: "tWfjSsUysY",
    description: "Not recommended native glossary term status",
  },
  save: {
    defaultMessage: "Save",
    id: "k/ObF2e19m",
    description: "Save action in the concept editor",
  },
  close: {
    defaultMessage: "Close",
    id: "9lmMAv+1UD",
    description: "Close action in the concept editor",
  },
  deleteConcept: {
    defaultMessage: "Delete concept",
    id: "YhT90BZluB",
    description: "Destructive action to delete a glossary concept",
  },
  confirmDeleteConcept: {
    defaultMessage: "Delete this concept and all of its terms?",
    id: "c+Mjo4w0Tb",
    description: "Confirmation prompt before deleting a concept",
  },
  confirmDeleteTerm: {
    defaultMessage: "Delete this term?",
    id: "IdceAsRVCE",
    description: "Confirmation prompt before deleting a term",
  },
  expandTerm: {
    defaultMessage: "Expand term details",
    id: "k15HfZEC8T",
    description: "Accessible label for expanding a glossary term row",
  },
  collapseTerm: {
    defaultMessage: "Collapse term details",
    id: "Hw68LI4OZD",
    description: "Accessible label for collapsing a glossary term row",
  },
  termDescriptionPlaceholder: {
    defaultMessage: "Definition, context, or example sentence",
    id: "ykDxLMM1xO",
    description: "Placeholder for term-level glossary description",
  },
  termUrlPlaceholder: {
    defaultMessage: "https://example.com",
    id: "QmSbWirtRR",
    description: "Placeholder for a term reference URL",
  },
  termNotePlaceholder: {
    defaultMessage: "Internal note visible only to editors",
    id: "HKQdop1A9u",
    description: "Placeholder for a term-level editor note",
  },
  openTermUrl: {
    defaultMessage: "Open term URL",
    id: "/2Rg3XAZX2",
    description: "Accessible label for opening a term reference URL",
  },
  confirmDeleteTermTitle: {
    defaultMessage: "Delete this term?",
    id: "hnEkxD1cWI",
    description: "Title of the term deletion confirmation dialog",
  },
  confirmDeleteTermDescription: {
    defaultMessage: "This term will be removed from the concept when you save.",
    id: "WhmV5YamvS",
    description: "Description of the term deletion confirmation dialog",
  },
  noConcepts: {
    defaultMessage: "No concepts yet.",
    id: "x34JY9BvGw",
    description: "Empty state for a glossary with no native concepts",
  },
  conceptId: {
    defaultMessage: "Concept {id}",
    id: "VIdL/n+uK8",
    description: "Concept identifier in the editor header",
  },
  sourceBadge: {
    defaultMessage: "SOURCE",
    id: "GwJAxTSF4k",
    description: "Badge identifying the glossary source locale",
  },
  conceptSaved: {
    defaultMessage: "Concept saved",
    id: "6V7dDBU2jk",
    description: "Toast after a concept is saved",
  },
  conceptAdded: {
    defaultMessage: "Concept added",
    id: "C8o8YEkGLA",
    description: "Toast after a concept is created",
  },
  conceptDeleted: {
    defaultMessage: "Concept deleted",
    id: "Iv8yvtAAwu",
    description: "Toast after a concept is deleted",
  },
  termSaved: {
    defaultMessage: "Term saved",
    id: "TmON06MWzq",
    description: "Toast after a concept term is saved",
  },
});
