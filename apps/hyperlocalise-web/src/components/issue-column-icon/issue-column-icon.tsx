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
import {
  PaperclipIcon,
  MedalIcon,
  BellIcon,
  BookmarkIcon,
  BriefcaseIcon,
  BugIcon,
  BuildingsIcon,
  CalendarIcon,
  PhoneIcon,
  ChartBarIcon,
  ListChecksIcon,
  ClockIcon,
  ChatTextIcon,
  DatabaseIcon,
  CurrencyDollarIcon,
  HeartIcon,
  FileIcon,
  FunnelIcon,
  FireIcon,
  FlagIcon,
  LightningIcon,
  FolderIcon,
  GlobeIcon,
  HashIcon,
  HouseIcon,
  ImageIcon,
  TrayIcon,
  KeyIcon,
  StackIcon,
  ListBulletsIcon,
  LinkIcon,
  MapPinIcon,
  LockIcon,
  EnvelopeIcon,
  PuzzlePieceIcon,
  RobotIcon,
  RocketLaunchIcon,
  MagnifyingGlassIcon,
  GearIcon,
  ShieldIcon,
  CodeIcon,
  SparkleIcon,
  StarIcon,
  TagIcon,
  TargetIcon,
  TranslateIcon,
  UserIcon,
  UsersIcon,
  type Icon,
} from "@phosphor-icons/react";

import {
  DEFAULT_ISSUE_SHEET_COLUMN_ICON_ID,
  isIssueSheetColumnIconId,
  type IssueSheetColumnIconId,
} from "@/lib/projects/issue-sheet/issue-sheet-column-icons";
import { cn } from "@/lib/primitives/cn";

type IssueColumnIconSvg = Icon;

const ISSUE_SHEET_COLUMN_ICON_BY_ID: Record<IssueSheetColumnIconId, IssueColumnIconSvg> = {
  tag: TagIcon,
  calendar: CalendarIcon,
  clock: ClockIcon,
  user: UserIcon,
  users: UsersIcon,
  flag: FlagIcon,
  bookmark: BookmarkIcon,
  link: LinkIcon,
  file: FileIcon,
  folder: FolderIcon,
  list: ListBulletsIcon,
  checklist: ListChecksIcon,
  star: StarIcon,
  bug: BugIcon,
  globe: GlobeIcon,
  hashtag: HashIcon,
  mail: EnvelopeIcon,
  phone: PhoneIcon,
  location: MapPinIcon,
  pin: MapPinIcon,
  lock: LockIcon,
  key: KeyIcon,
  shield: ShieldIcon,
  briefcase: BriefcaseIcon,
  building: BuildingsIcon,
  code: CodeIcon,
  image: ImageIcon,
  search: MagnifyingGlassIcon,
  filter: FunnelIcon,
  chart: ChartBarIcon,
  dollar: CurrencyDollarIcon,
  message: ChatTextIcon,
  comment: ChatTextIcon,
  sparkle: SparkleIcon,
  robot: RobotIcon,
  rocket: RocketLaunchIcon,
  puzzle: PuzzlePieceIcon,
  layers: StackIcon,
  inbox: TrayIcon,
  home: HouseIcon,
  heart: HeartIcon,
  fire: FireIcon,
  flash: LightningIcon,
  target: TargetIcon,
  award: MedalIcon,
  bell: BellIcon,
  attachment: PaperclipIcon,
  database: DatabaseIcon,
  translate: TranslateIcon,
  settings: GearIcon,
};

export function resolveIssueSheetColumnIcon(iconId: string | null | undefined): IssueColumnIconSvg {
  if (iconId && isIssueSheetColumnIconId(iconId)) {
    return ISSUE_SHEET_COLUMN_ICON_BY_ID[iconId];
  }
  return ISSUE_SHEET_COLUMN_ICON_BY_ID[DEFAULT_ISSUE_SHEET_COLUMN_ICON_ID];
}

export function IssueColumnIcon({
  iconId,
  className,
}: {
  iconId: string | null | undefined;
  className?: string;
}) {
  const Icon = resolveIssueSheetColumnIcon(iconId);
  return <Icon className={cn("size-3.5 shrink-0", className)} />;
}
