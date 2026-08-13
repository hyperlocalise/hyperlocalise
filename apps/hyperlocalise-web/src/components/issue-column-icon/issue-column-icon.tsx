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
  AttachmentIcon,
  Award01Icon,
  BellIcon,
  Bookmark01Icon,
  Briefcase01Icon,
  Bug01Icon,
  Building03Icon,
  Calendar03Icon,
  CallIcon,
  ChartHistogramIcon,
  CheckListIcon,
  Clock01Icon,
  Comment01Icon,
  Database01Icon,
  DollarCircleIcon,
  FavouriteIcon,
  File01Icon,
  FilterIcon,
  FireIcon,
  Flag01Icon,
  FlashIcon,
  Folder01Icon,
  Globe02Icon,
  HashtagIcon,
  Home01Icon,
  Image01Icon,
  InboxIcon,
  Key01Icon,
  LayerIcon,
  LeftToRightListBulletIcon,
  Link01Icon,
  Location01Icon,
  LockIcon,
  Mail01Icon,
  MapPinIcon,
  Message01Icon,
  PuzzleIcon,
  Robot01Icon,
  Rocket01Icon,
  SearchIcon,
  Settings01Icon,
  Shield01Icon,
  SourceCodeIcon,
  SparklesIcon,
  StarIcon,
  Tag01Icon,
  Target01Icon,
  TranslateIcon,
  UserIcon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  DEFAULT_ISSUE_SHEET_COLUMN_ICON_ID,
  isIssueSheetColumnIconId,
  type IssueSheetColumnIconId,
} from "@/lib/projects/issue-sheet/issue-sheet-column-icons";
import { cn } from "@/lib/primitives/cn";

type IssueColumnIconSvg = Parameters<typeof HugeiconsIcon>[0]["icon"];

const ISSUE_SHEET_COLUMN_ICON_BY_ID: Record<IssueSheetColumnIconId, IssueColumnIconSvg> = {
  tag: Tag01Icon,
  calendar: Calendar03Icon,
  clock: Clock01Icon,
  user: UserIcon,
  users: UserMultiple02Icon,
  flag: Flag01Icon,
  bookmark: Bookmark01Icon,
  link: Link01Icon,
  file: File01Icon,
  folder: Folder01Icon,
  list: LeftToRightListBulletIcon,
  checklist: CheckListIcon,
  star: StarIcon,
  bug: Bug01Icon,
  globe: Globe02Icon,
  hashtag: HashtagIcon,
  mail: Mail01Icon,
  phone: CallIcon,
  location: Location01Icon,
  pin: MapPinIcon,
  lock: LockIcon,
  key: Key01Icon,
  shield: Shield01Icon,
  briefcase: Briefcase01Icon,
  building: Building03Icon,
  code: SourceCodeIcon,
  image: Image01Icon,
  search: SearchIcon,
  filter: FilterIcon,
  chart: ChartHistogramIcon,
  dollar: DollarCircleIcon,
  message: Message01Icon,
  comment: Comment01Icon,
  sparkle: SparklesIcon,
  robot: Robot01Icon,
  rocket: Rocket01Icon,
  puzzle: PuzzleIcon,
  layers: LayerIcon,
  inbox: InboxIcon,
  home: Home01Icon,
  heart: FavouriteIcon,
  fire: FireIcon,
  flash: FlashIcon,
  target: Target01Icon,
  award: Award01Icon,
  bell: BellIcon,
  attachment: AttachmentIcon,
  database: Database01Icon,
  translate: TranslateIcon,
  settings: Settings01Icon,
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
  strokeWidth = 1.8,
}: {
  iconId: string | null | undefined;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <HugeiconsIcon
      icon={resolveIssueSheetColumnIcon(iconId)}
      strokeWidth={strokeWidth}
      className={cn("size-3.5 shrink-0", className)}
    />
  );
}
