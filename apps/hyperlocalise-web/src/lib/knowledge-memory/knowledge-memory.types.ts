export type KnowledgeMemoryRecord = {
  revisionId: string | null;
  version: number;
  content: string;
  summary: string | null;
  updatedAt: string | null;
  updatedByUserId: string | null;
};

export type KnowledgeMemoryRevision = {
  revisionId: string;
  version: number;
  content: string;
  summary: string;
  createdAt: string;
  createdByUserId: string | null;
  createdByName: string | null;
  isCurrent: boolean;
};

export type KnowledgeMemoryRevisionMetadata = Omit<KnowledgeMemoryRevision, "content">;

export type KnowledgeMemoryCommitResult = {
  knowledgeMemory: KnowledgeMemoryRecord;
  changed: boolean;
};

export type KnowledgeMemoryCommitError = {
  code: "precondition_failed";
  current: KnowledgeMemoryRecord;
};

export type KnowledgeMemoryRestoreError =
  | KnowledgeMemoryCommitError
  | { code: "revision_not_found" };

export type CurrentKnowledgeMemoryRow = {
  revisionId: string;
  version: number;
  content: string;
  summary: string;
  updatedAt: Date;
  updatedByUserId: string | null;
};

export type RevisionAuthorRow = {
  createdByUserId: string | null;
  createdByFirstName: string | null;
  createdByLastName: string | null;
};
