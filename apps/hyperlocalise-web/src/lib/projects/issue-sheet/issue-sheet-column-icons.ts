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

export const DEFAULT_ISSUE_SHEET_COLUMN_ICON_ID = "tag" as const;

export const ISSUE_SHEET_COLUMN_ICON_IDS = [
  "tag",
  "calendar",
  "clock",
  "user",
  "users",
  "flag",
  "bookmark",
  "link",
  "file",
  "folder",
  "list",
  "checklist",
  "star",
  "bug",
  "globe",
  "hashtag",
  "mail",
  "phone",
  "location",
  "pin",
  "lock",
  "key",
  "shield",
  "briefcase",
  "building",
  "code",
  "image",
  "search",
  "filter",
  "chart",
  "dollar",
  "message",
  "comment",
  "sparkle",
  "robot",
  "rocket",
  "puzzle",
  "layers",
  "inbox",
  "home",
  "heart",
  "fire",
  "flash",
  "target",
  "award",
  "bell",
  "attachment",
  "database",
  "translate",
  "settings",
] as const;

export type IssueSheetColumnIconId = (typeof ISSUE_SHEET_COLUMN_ICON_IDS)[number];

const ICON_ID_SET = new Set<string>(ISSUE_SHEET_COLUMN_ICON_IDS);

export const ISSUE_SHEET_COLUMN_ICON_KEYWORDS: Record<IssueSheetColumnIconId, string> = {
  tag: "label property",
  calendar: "date schedule",
  clock: "time duration",
  user: "person assignee",
  users: "people team",
  flag: "priority marker",
  bookmark: "save favorite",
  link: "url reference",
  file: "document",
  folder: "directory group",
  list: "bullets items",
  checklist: "todo tasks",
  star: "rating favorite",
  bug: "issue defect",
  globe: "locale language world",
  hashtag: "number id",
  mail: "email",
  phone: "call contact",
  location: "place map",
  pin: "map marker",
  lock: "private secure",
  key: "access secret",
  shield: "security",
  briefcase: "work job",
  building: "company org",
  code: "developer source",
  image: "photo media",
  search: "find query",
  filter: "refine",
  chart: "analytics graph",
  dollar: "money cost",
  message: "chat",
  comment: "note discussion",
  sparkle: "ai magic",
  robot: "automation agent",
  rocket: "launch ship",
  puzzle: "piece integration",
  layers: "stack",
  inbox: "mail queue",
  home: "project",
  heart: "love favorite",
  fire: "urgent hot",
  flash: "lightning fast",
  target: "goal",
  award: "trophy achievement",
  bell: "notification alert",
  attachment: "file clip",
  database: "storage",
  translate: "locale i18n",
  settings: "gear config",
};

export function isIssueSheetColumnIconId(value: string): value is IssueSheetColumnIconId {
  return ICON_ID_SET.has(value);
}

export function filterIssueSheetColumnIcons(query: string): IssueSheetColumnIconId[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [...ISSUE_SHEET_COLUMN_ICON_IDS];
  }

  return ISSUE_SHEET_COLUMN_ICON_IDS.filter((id) => {
    if (id.includes(needle)) {
      return true;
    }
    return ISSUE_SHEET_COLUMN_ICON_KEYWORDS[id].includes(needle);
  });
}
