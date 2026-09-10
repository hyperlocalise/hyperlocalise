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

export const glossaryHistoryPageMessages = defineMessages({
  backToGlossary: {
    defaultMessage: "Back to glossary",
    id: "807Zi+p+pS",
    description: "Link back to the glossary detail page",
  },
  title: {
    defaultMessage: "Glossary history",
    id: "UvANsyZrbI",
    description: "Glossary history page heading",
  },
  description: {
    defaultMessage: "Review imports and changes across this glossary.",
    id: "owWio6fQLv",
    description: "Glossary history page description",
  },
  searchLabel: {
    defaultMessage: "Search history",
    id: "XX0l5kWHfE",
    description: "Glossary history search input label",
  },
  searchPlaceholder: {
    defaultMessage: "Search event details",
    id: "x9HI7zKaWm",
    description: "Glossary history search input placeholder",
  },
  eventTypeLabel: {
    defaultMessage: "Event type",
    id: "9JeJOKsemV",
    description: "Glossary history event type filter label",
  },
  allEvents: {
    defaultMessage: "All events",
    id: "7SltjgHpss",
    description: "Option to show all glossary history event types",
  },
  imported: {
    defaultMessage: "Imported",
    id: "KREOm0BNYe",
    description: "Glossary history imported event filter",
  },
  created: {
    defaultMessage: "Created",
    id: "dAoVLkrJwN",
    description: "Glossary history created event filter",
  },
  updated: {
    defaultMessage: "Updated",
    id: "sEJSf7iVqH",
    description: "Glossary history updated event filter",
  },
  deleted: {
    defaultMessage: "Deleted",
    id: "ZV4jhuXvh3",
    description: "Glossary history deleted event filter",
  },
  loading: {
    defaultMessage: "Loading glossary history",
    id: "ed/4UsnyQZ",
    description: "Accessible label for the glossary history loading state",
  },
  emptyTitle: {
    defaultMessage: "No history yet",
    id: "Smebv4yC+R",
    description: "Glossary history empty state title",
  },
  emptyDescription: {
    defaultMessage: "Glossary imports and changes will appear here.",
    id: "DJ76ekFqdE",
    description: "Glossary history empty state description",
  },
  errorTitle: {
    defaultMessage: "Glossary history could not be loaded",
    id: "CcfrzXT5ah",
    description: "Glossary history error state title",
  },
  errorDescription: {
    defaultMessage: "Try again to load the latest glossary history.",
    id: "5ZQ992jk22",
    description: "Glossary history error state description",
  },
  unavailableTitle: {
    defaultMessage: "Glossary history is unavailable",
    id: "4rC9Np88HF",
    description: "Glossary history unavailable state title",
  },
  unavailableDescription: {
    defaultMessage: "This glossary does not expose local history.",
    id: "+kFbrUG7wz",
    description: "Glossary history unavailable state description",
  },
  retry: {
    defaultMessage: "Retry",
    id: "pGj/L35EP+",
    description: "Retry loading glossary history",
  },
  invalidCursor: {
    defaultMessage: "That page is no longer valid. Showing the first page.",
    id: "BxVa0XAhsz",
    description: "Status announced when a glossary history cursor can no longer be used",
  },
  loadMore: {
    defaultMessage: "Load more",
    id: "w0sul/7gcV",
    description: "Load another page of glossary history",
  },
  changedFields: {
    defaultMessage: "Changed fields: {fields}",
    id: "MMqdjTKoog",
    description: "Glossary history changed fields summary",
  },
  eventMeta: {
    defaultMessage: "{actor} · {date}",
    id: "s3w5x5ZggY",
    description: "Glossary history event actor and timestamp",
  },
  importMeta: {
    defaultMessage: "{format} · {mode}",
    id: "94NuGR6Dav",
    description: "Glossary import history format and mode",
  },
  importCounts: {
    defaultMessage:
      "{created} created · {updated} updated · {merged} merged · {skipped} skipped · {failed} failed",
    id: "RWAFusSGVX",
    description: "Glossary import history result counts",
  },
  concept: {
    defaultMessage: "Concept {id}",
    id: "KQeC+CsXLT",
    description: "Glossary history concept link label",
  },
  fieldChange: {
    defaultMessage: "{before} → {after}",
    id: "mE7391J8Q3",
    description: "Glossary history before and after field values",
  },
});
