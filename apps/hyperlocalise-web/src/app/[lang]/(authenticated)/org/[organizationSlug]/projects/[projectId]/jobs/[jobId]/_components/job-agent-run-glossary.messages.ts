"use client";

import { defineMessages } from "react-intl";

export const jobAgentRunGlossaryMessages = defineMessages({
  glossaryMatchTitle: {
    defaultMessage: "{glossaryName} · {sourceTerm} → {targetTerm} · {status}",
    id: "scWT+AzJ7J",
    description: "Tooltip title for a glossary match badge on an agent proposal",
  },
  glossaryBadgeLabel: {
    defaultMessage: "{source} · {glossaryName} · {status}",
    id: "3ltZugBCYh",
    description: "Badge label summarizing a glossary match source, glossary, and term status",
  },
  glossaryTermsUsed: {
    defaultMessage: "Glossary terms used",
    id: "WBydLHnyW0",
    description: "Heading above detailed glossary matches on an agent proposal",
  },
  glossaryTermPair: {
    defaultMessage: "{sourceTerm} → {targetTerm} ({targetLocale})",
    id: "lIM6KQzx0j",
    description: "Source and target term pair for a glossary match detail row",
  },
});
