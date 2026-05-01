"use client";

import { useMemo, useState, type ComponentProps } from "react";
import {
  AlertCircleIcon,
  ArrowUpRight03Icon,
  Attachment02Icon,
  BubbleChatNotificationIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  FilterMailIcon,
  FolderLibraryIcon,
  GlobeIcon,
  InboxUnreadIcon,
  LanguageSkillIcon,
  Link01Icon,
  MessageIncoming01Icon,
  MoreHorizontalIcon,
  PreferenceHorizontalIcon,
  RocketIcon,
  StarIcon,
  TranslationIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type InboxItem = {
  id: string;
  title: string;
  summary: string;
  sender: string;
  initials: string;
  source: string;
  project: string;
  locale: string;
  age: string;
  unread?: boolean;
  status: "new" | "triaged" | "blocked" | "done";
  priority: "high" | "medium" | "low";
  icon: ComponentProps<typeof HugeiconsIcon>["icon"];
  activity: string[];
};

const inboxItems: InboxItem[] = [
  {
    id: "HL-214",
    title: "Launch page needs Japanese review before freeze",
    summary: "Marketing flagged hero copy and image alt text as release-blocking for ja-JP.",
    sender: "Maya Chen",
    initials: "MC",
    source: "Email",
    project: "Website",
    locale: "ja-JP",
    age: "12m",
    unread: true,
    status: "new",
    priority: "high",
    icon: MessageIncoming01Icon,
    activity: [
      "Maya forwarded the launch checklist with two unresolved comments.",
      "Hyperlocalise matched 18 source strings to existing website memory.",
      "Reviewer SLA is due today at 16:00.",
    ],
  },
  {
    id: "HL-209",
    title: "German billing strings changed after legal pass",
    summary: "New invoice disclaimer needs parity across product and help center surfaces.",
    sender: "Owen Park",
    initials: "OP",
    source: "GitHub",
    project: "Billing",
    locale: "de-DE",
    age: "48m",
    status: "triaged",
    priority: "medium",
    icon: TranslationIcon,
    activity: [
      "Owen linked pull request #482 with updated source strings.",
      "Glossary term 'subscription credit' was applied automatically.",
      "Waiting on Legal to approve the final clause.",
    ],
  },
  {
    id: "HL-205",
    title: "Crowdin sync stalled for support macros",
    summary: "APAC macro import has 34 missing placeholders and one malformed ICU string.",
    sender: "Priya Raman",
    initials: "PR",
    source: "Crowdin",
    project: "Support",
    locale: "ko-KR",
    age: "2h",
    unread: true,
    status: "blocked",
    priority: "high",
    icon: AlertCircleIcon,
    activity: [
      "Connector reported placeholder drift in the support workspace.",
      "34 strings were held from delivery to protect template variables.",
      "Suggested fix prepared for ICU plural rule syntax.",
    ],
  },
  {
    id: "HL-198",
    title: "French onboarding emails ready for approval",
    summary: "Translator completed review with one tone note on the activation sequence.",
    sender: "Elena Dubois",
    initials: "ED",
    source: "Resend",
    project: "Lifecycle",
    locale: "fr-FR",
    age: "6h",
    status: "done",
    priority: "low",
    icon: CheckmarkCircle02Icon,
    activity: [
      "Three onboarding emails were translated and reviewed.",
      "Tone adjustment applied to the activation CTA.",
      "Ready to publish in the next campaign window.",
    ],
  },
  {
    id: "HL-192",
    title: "Spanish help center article has terminology drift",
    summary: "New article uses legacy terms for workspace roles and release approvals.",
    sender: "Marco Silva",
    initials: "MS",
    source: "Zendesk",
    project: "Help Center",
    locale: "es-ES",
    age: "1d",
    status: "triaged",
    priority: "medium",
    icon: LanguageSkillIcon,
    activity: [
      "Marco tagged the article as inconsistent with the current glossary.",
      "Hyperlocalise found 9 terms that should be updated.",
      "Suggested replacements are ready for reviewer confirmation.",
    ],
  },
  {
    id: "HL-188",
    title: "Portuguese product screenshots need localized variants",
    summary: "Release notes include three screenshots with embedded English UI labels.",
    sender: "Nina Costa",
    initials: "NC",
    source: "Linear",
    project: "Release Notes",
    locale: "pt-BR",
    age: "2d",
    status: "new",
    priority: "medium",
    icon: Attachment02Icon,
    activity: [
      "Nina attached source screenshots for the release note draft.",
      "Image text extraction found 11 labels that need localization.",
      "Design review is requested before publish.",
    ],
  },
];

const statusStyles = {
  new: "bg-dew-500/14 text-dew-100 ring-dew-500/24",
  triaged: "bg-beam-500/14 text-beam-100 ring-beam-500/24",
  blocked: "bg-flame-500/14 text-flame-100 ring-flame-500/24",
  done: "bg-grove-300/14 text-grove-100 ring-grove-300/24",
} satisfies Record<InboxItem["status"], string>;

const priorityStyles = {
  high: "text-flame-100",
  medium: "text-beam-100",
  low: "text-white/52",
} satisfies Record<InboxItem["priority"], string>;

export function InboxPageContent({ organizationSlug }: { organizationSlug: string }) {
  const [selectedItemId, setSelectedItemId] = useState(inboxItems[0]?.id ?? "");
  const selectedItem = useMemo(
    () => inboxItems.find((item) => item.id === selectedItemId) ?? inboxItems[0]!,
    [selectedItemId],
  );
  const unreadCount = inboxItems.filter((item) => item.unread).length;

  return (
    <main
      data-organization={organizationSlug}
      className="-mx-4 -my-5 min-h-[calc(100svh-3.5rem)] overflow-hidden bg-[#0b0b0d] text-white sm:-mx-6 lg:-mx-8"
    >
      <div className="grid min-h-[calc(100svh-3.5rem)] grid-cols-1 lg:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)]">
        <section className="flex min-h-[34rem] flex-col border-white/8 lg:border-r">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/8 px-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-white/6 text-white/82">
                <HugeiconsIcon icon={InboxUnreadIcon} strokeWidth={1.8} className="size-5" />
              </div>
              <div>
                <h1 className="font-heading text-lg font-semibold tracking-normal">Inbox</h1>
                <p className="text-xs text-white/42">{unreadCount} active notifications</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-white/52 hover:bg-white/8 hover:text-white"
                aria-label="Filter inbox"
              >
                <HugeiconsIcon icon={FilterMailIcon} strokeWidth={1.8} className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-white/52 hover:bg-white/8 hover:text-white"
                aria-label="Inbox display settings"
              >
                <HugeiconsIcon
                  icon={PreferenceHorizontalIcon}
                  strokeWidth={1.8}
                  className="size-4"
                />
              </Button>
            </div>
          </header>

          <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
            <Badge variant="outline" className="border-white/10 bg-white/6 text-white/76">
              All
            </Badge>
            <Badge variant="ghost" className="text-white/46">
              Mentioned
            </Badge>
            <Badge variant="ghost" className="text-white/46">
              Blocked
            </Badge>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="flex flex-col gap-1">
              {inboxItems.map((item) => {
                const isSelected = item.id === selectedItem.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedItemId(item.id)}
                    className={cn(
                      "grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] gap-3 rounded-lg px-3 py-3 text-left transition-colors",
                      isSelected
                        ? "bg-white/10 text-white"
                        : "text-white/76 hover:bg-white/6 hover:text-white",
                    )}
                  >
                    <Avatar className="bg-white/7">
                      <AvatarFallback className="bg-white/8 text-xs font-medium text-white/78">
                        {item.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        {item.unread ? (
                          <span className="size-1.5 shrink-0 rounded-full bg-dew-500" />
                        ) : null}
                        <p className="truncate text-sm font-medium">{item.title}</p>
                      </div>
                      <p className="mt-1 truncate text-sm text-white/45">{item.summary}</p>
                      <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-white/34">
                        <span className="truncate">{item.project}</span>
                        <span className="size-1 rounded-full bg-white/18" />
                        <span>{item.locale}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-xs text-white/38">{item.age}</span>
                      <HugeiconsIcon
                        icon={item.icon}
                        strokeWidth={1.8}
                        className={cn("size-4", priorityStyles[item.priority])}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="min-h-0 bg-[#101012]">
          <header className="flex h-16 items-center justify-between border-b border-white/8 px-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={1.8} className="size-5" />
              <div className="min-w-0">
                <p className="truncate text-sm text-white/42">
                  {selectedItem.project} / {selectedItem.source}
                </p>
                <h2 className="truncate font-heading text-base font-semibold">
                  {selectedItem.id} {selectedItem.title}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-white/52 hover:bg-white/8 hover:text-white"
                aria-label="Open source"
              >
                <HugeiconsIcon icon={ArrowUpRight03Icon} strokeWidth={1.8} className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-white/52 hover:bg-white/8 hover:text-white"
                aria-label="More inbox item actions"
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.8} className="size-4" />
              </Button>
            </div>
          </header>

          <div className="grid min-h-[calc(100svh-7.5rem)] gap-0 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0">
              <section className="px-4 py-5 sm:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={cn("ring-1", statusStyles[selectedItem.status])}>
                    {selectedItem.status}
                  </Badge>
                  <Badge variant="outline" className="border-white/10 bg-white/5 text-white/66">
                    {selectedItem.locale}
                  </Badge>
                  <Badge variant="outline" className="border-white/10 bg-white/5 text-white/66">
                    {selectedItem.source}
                  </Badge>
                </div>
                <p className="mt-4 max-w-3xl text-pretty text-xl leading-8 text-white/88">
                  {selectedItem.summary}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button size="sm" className="bg-white text-[#101012] hover:bg-white/86">
                    <HugeiconsIcon
                      icon={CheckmarkCircle02Icon}
                      strokeWidth={1.8}
                      className="size-4"
                    />
                    Mark done
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/10 bg-white/5 text-white hover:bg-white/9"
                  >
                    <HugeiconsIcon
                      icon={BubbleChatNotificationIcon}
                      strokeWidth={1.8}
                      className="size-4"
                    />
                    Reply
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/10 bg-white/5 text-white hover:bg-white/9"
                  >
                    <HugeiconsIcon icon={RocketIcon} strokeWidth={1.8} className="size-4" />
                    Create job
                  </Button>
                </div>
              </section>

              <section className="border-t border-white/8">
                <div className="flex items-center justify-between px-4 py-3 sm:px-6">
                  <h3 className="text-sm font-medium text-white/84">Activity</h3>
                  <p className="text-xs text-white/38">Updated {selectedItem.age} ago</p>
                </div>
                <Separator className="bg-white/8" />
                <div className="space-y-4 px-4 py-4 sm:px-6">
                  {selectedItem.activity.map((activity, index) => (
                    <div key={activity} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
                      <div className="flex size-7 items-center justify-center rounded-full bg-white/7 text-white/58">
                        <HugeiconsIcon
                          icon={index === 0 ? Clock01Icon : StarIcon}
                          strokeWidth={1.8}
                          className="size-3.5"
                        />
                      </div>
                      <p className="pt-0.5 text-sm leading-6 text-white/62">{activity}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="border-t border-white/8 px-4 py-5 sm:px-6">
                <label htmlFor="inbox-reply" className="sr-only">
                  Leave a reply
                </label>
                <textarea
                  id="inbox-reply"
                  className="min-h-24 w-full resize-none bg-transparent py-2 text-sm text-white outline-none placeholder:text-white/28"
                  placeholder="Leave a reply or add handoff notes..."
                />
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2 text-white/38">
                    <HugeiconsIcon icon={Attachment02Icon} strokeWidth={1.8} className="size-4" />
                    <HugeiconsIcon icon={Link01Icon} strokeWidth={1.8} className="size-4" />
                  </div>
                  <Button size="icon-sm" className="bg-white text-[#101012] hover:bg-white/86">
                    <HugeiconsIcon icon={ArrowUpRight03Icon} strokeWidth={1.8} className="size-4" />
                    <span className="sr-only">Send reply</span>
                  </Button>
                </div>
              </section>
            </div>

            <aside className="border-t border-white/8 px-4 py-5 xl:border-t-0 xl:border-l xl:px-5">
              <section className="pb-5">
                <h3 className="text-sm font-medium text-white/84">Request details</h3>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-white/40">Owner</dt>
                    <dd className="text-white/76">{selectedItem.sender}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-white/40">Priority</dt>
                    <dd className={cn("capitalize", priorityStyles[selectedItem.priority])}>
                      {selectedItem.priority}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-white/40">Project</dt>
                    <dd className="text-white/76">{selectedItem.project}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-white/40">Locale</dt>
                    <dd className="text-white/76">{selectedItem.locale}</dd>
                  </div>
                </dl>
              </section>

              <section className="border-t border-white/8 pt-5">
                <h3 className="text-sm font-medium text-white/84">Suggested next step</h3>
                <div className="mt-4 grid gap-3 text-sm text-white/58">
                  <div className="flex gap-3">
                    <HugeiconsIcon icon={GlobeIcon} strokeWidth={1.8} className="mt-0.5 size-4" />
                    <p>Check locale-specific terminology before assigning reviewers.</p>
                  </div>
                  <div className="flex gap-3">
                    <HugeiconsIcon
                      icon={TranslationIcon}
                      strokeWidth={1.8}
                      className="mt-0.5 size-4"
                    />
                    <p>Create a translation job when source text is stable.</p>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
