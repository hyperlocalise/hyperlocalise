export const issueTypeValues = [
  "general_question",
  "translation_mistake",
  "context_request",
  "source_mistake",
  "glossary_violation",
  "qa_failure",
] as const;

export type IssueTypeValue = (typeof issueTypeValues)[number];
