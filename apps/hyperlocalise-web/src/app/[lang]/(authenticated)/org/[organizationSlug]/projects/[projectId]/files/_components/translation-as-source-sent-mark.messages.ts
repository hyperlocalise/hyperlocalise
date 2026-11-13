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

export const translationAsSourceSentMarkMessages = defineMessages({
  sent: {
    defaultMessage: "Sent",
    id: "T9mYohjPzf",
    description:
      "Files list marker for a file whose translation was sent to another project as that project's source file, unchanged since",
  },
  changedSinceSent: {
    defaultMessage: "Changed since sent",
    id: "+/e1CLKNZd",
    description:
      "Files list marker for a file sent to another project as its source whose translation or file has changed since, so it should be sent again",
  },
  sentTo: {
    defaultMessage: "Sent to {project} on {date}.",
    id: "Asg4d5KLX5",
    description:
      "Tooltip line on a file in the files list: the file's translation was sent to the named project as its source file at this date and time",
  },
  sentToChanged: {
    defaultMessage:
      "Sent to {project} on {date}. The {language} translation has changed since, or the file was uploaded again. Sending it again updates {project}.",
    id: "ciNL3xNX71",
    description:
      "Tooltip line on a file in the files list: the file's translation was sent to the named project, and the translation in that language or the file itself changed afterwards",
  },
  fromProject: {
    defaultMessage: "From {project}",
    id: "j57qprvd5u",
    description:
      "Files list marker for a file whose newest version was sent here from the named project, built from that project's translation",
  },
  fromAnotherProject: {
    defaultMessage: "From another project",
    id: "5/WLgOghNt",
    description:
      "Files list marker for a file sent here from a project the person cannot open, built from that project's translation",
  },
  sentHereFrom: {
    defaultMessage: "Sent here from {project} on {date}.",
    id: "8kLA0Cq7bu",
    description:
      "Tooltip line on a file in the files list: the file's newest version was sent to this project from the named project at this date and time",
  },
  sentHereFromAnotherProject: {
    defaultMessage: "Sent here from another project on {date}.",
    id: "LHI3UvsxkF",
    description:
      "Tooltip line on a file in the files list: the file's newest version was sent to this project from a project the person cannot open",
  },
  replacedIn: {
    defaultMessage: "Replaced in {project}",
    id: "ftzfpk5X6A",
    description:
      "Files list marker for a sent file whose copy in the named project was replaced since by a file added there",
  },
  sentToReplaced: {
    defaultMessage:
      "Sent to {project} on {date}. A file added there since replaced it; Use translation as source… shows what it is.",
    id: "0zUWfvIi5F",
    description:
      "Tooltip line on a file in the files list: the file was sent to the named project, and a file added there later replaced it",
  },
  replacedUploadedBy: {
    defaultMessage: "It replaced the version {person} uploaded on {date}.",
    id: "SsNN583gG5",
    description:
      "Tooltip line after where a file was sent from: the send replaced a version the named person had uploaded here",
  },
  replacedAdded: {
    defaultMessage: "It replaced the version added on {date}.",
    id: "rw7PjV9vTg",
    description:
      "Tooltip line after where a file was sent from: the send replaced a version an integration or the app had added here",
  },
});
