"use client";

import type { MessageDescriptor } from "react-intl";
import { defineMessages } from "react-intl";

import type { KanbanStatus } from "./jobs-view-helpers";

export const jobsKanbanBoardMessages = defineMessages({
  queued: {
    defaultMessage: "Queued",
    id: "8rr2LhuMpW",
    description: "Kanban column label for queued jobs",
  },
  running: {
    defaultMessage: "Running",
    id: "nEBGfsZw1I",
    description: "Kanban column label for running jobs",
  },
  waitingForReview: {
    defaultMessage: "Waiting for review",
    id: "xsAaVb0T8m",
    description: "Kanban column label for jobs waiting for review",
  },
  succeeded: {
    defaultMessage: "Succeeded",
    id: "hKQGjL6KUM",
    description: "Kanban column label for succeeded jobs",
  },
  failed: {
    defaultMessage: "Failed",
    id: "vUMdCurROo",
    description: "Kanban column label for failed jobs",
  },
  cancelled: {
    defaultMessage: "Cancelled",
    id: "/UI9Zob6RC",
    description: "Kanban column label for cancelled jobs",
  },
});

export function getKanbanStatusMessage(status: KanbanStatus): MessageDescriptor {
  switch (status) {
    case "queued":
      return jobsKanbanBoardMessages.queued;
    case "running":
      return jobsKanbanBoardMessages.running;
    case "waiting_for_review":
      return jobsKanbanBoardMessages.waitingForReview;
    case "succeeded":
      return jobsKanbanBoardMessages.succeeded;
    case "failed":
      return jobsKanbanBoardMessages.failed;
    case "cancelled":
      return jobsKanbanBoardMessages.cancelled;
  }
}
