import type {
  CatFileContext,
  CatFormatCheck,
  CatGlossaryTerm,
  CatSegment,
  CatSegmentIntelligence,
  CatWorkspaceState,
} from "./types";
import { getIntlShape } from "@/lib/app-i18n/intl";

import {
  analyzeCatMessageFormat,
  compareCatMessageFormats,
} from "@/components/cat/message-format/cat-message-format";
import type { CatMessageParityIssue } from "@/components/cat/message-format/cat-message-format";
import { localizeCatMessageParityIssue } from "@/components/cat/message-format/cat-message-format-i18n";
import { glossaryFormatChecksForSegment } from "@/components/cat/intelligence/cat-glossary-checks";
import { toQueueSegment } from "@/components/cat/workspace/store/cat-segment-view";

const fixtureIntl = getIntlShape("en");

function formatCheckFromParityIssue(issue: CatMessageParityIssue, id: string): CatFormatCheck {
  const localized = localizeCatMessageParityIssue(issue, fixtureIntl);

  return {
    id,
    label: localized.label,
    status: issue.kind === "extra-token" ? "warn" : "fail",
    message: localized.message,
    category:
      issue.kind === "parse-error"
        ? "syntax"
        : issue.kind === "icu-mismatch"
          ? "icu"
          : "placeholder",
    relatedTokens: issue.tokens,
  };
}

type CatSegmentFixtureInput = Omit<CatSegment, "id" | "index" | "sourceLocale" | "targetLocale">;

const SOURCE_LOCALE = "en-US";
const TARGET_LOCALE = "vi";

const catSegmentInputs: CatSegmentFixtureInput[] = [
  {
    key: "dashboard.reviews.pending.title",
    sourceText: "Reviews awaiting approval",
    targetText: "Các đánh giá đang chờ phê duyệt",
    contextLabel: "Heading",
    status: "reviewed",
    tags: ["dashboard", "review"],
  },
  {
    key: "dashboard.reviews.pending.card",
    sourceText: "Dashboard card showing how many reviews still need approval.",
    targetText: "Thẻ bảng điều khiển hiển thị số đánh giá còn cần phê duyệt.",
    contextLabel: "Card description",
    status: "needs_review",
    tags: ["dashboard", "card", "high impact"],
    maxLength: 80,
  },
  {
    key: "email.review.subject",
    sourceText: "Your review is ready for approval",
    targetText: "",
    contextLabel: "Email subject",
    status: "pending",
    tags: ["email", "review"],
  },
  {
    key: "settings.notifications.review",
    sourceText: "Notify me when a review needs approval",
    targetText: "Thông báo khi có đánh giá cần phê duyệt",
    contextLabel: "Settings toggle",
    status: "reviewed",
    tags: ["settings", "notification"],
  },
  {
    key: "onboarding.review.cta",
    sourceText: "Start reviewing translations",
    targetText: "Bắt đầu duyệt bản dịch",
    contextLabel: "CTA button",
    status: "pending",
    tags: ["onboarding", "cta"],
    maxLength: 34,
  },
  {
    key: "project.sidebar.files.count",
    sourceText: "{count, plural, one {# file} other {# files}} ready for localization",
    targetText: "{count, plural, one {# tệp} other {# tệp}} sẵn sàng để bản địa hóa",
    contextLabel: "Plural label",
    status: "needs_review",
    tags: ["project", "icu", "files"],
  },
  {
    key: "job.status.importing",
    sourceText: "Importing source strings",
    targetText: "Đang nhập chuỗi nguồn",
    contextLabel: "Job status",
    status: "reviewed",
    tags: ["job", "status"],
  },
  {
    key: "job.status.waitingForTm",
    sourceText: "Checking translation memory matches",
    targetText: "",
    contextLabel: "Job status",
    status: "pending",
    tags: ["job", "translation-memory"],
  },
  {
    key: "editor.toolbar.copySource",
    sourceText: "Copy source",
    targetText: "Sao chép nguồn",
    contextLabel: "Toolbar action",
    status: "reviewed",
    tags: ["editor", "action"],
    maxLength: 22,
  },
  {
    key: "editor.toolbar.applySuggestion",
    sourceText: "Apply AI suggestion",
    targetText: "Áp dụng gợi ý AI",
    contextLabel: "Toolbar action",
    status: "reviewed",
    tags: ["editor", "ai"],
    maxLength: 28,
  },
  {
    key: "editor.status.unsaved",
    sourceText: "Unsaved changes",
    targetText: "Thay đổi chưa lưu",
    contextLabel: "Inline status",
    status: "reviewed",
    tags: ["editor", "status"],
  },
  {
    key: "editor.status.autoSaved",
    sourceText: "Saved just now",
    targetText: "Vừa lưu xong",
    contextLabel: "Inline status",
    status: "reviewed",
    tags: ["editor", "status"],
  },
  {
    key: "qa.placeholder.missing",
    sourceText: "The placeholder {name} is missing from the translation.",
    targetText: "Bản dịch thiếu biến giữ chỗ {name}.",
    contextLabel: "QA warning",
    status: "needs_review",
    tags: ["qa", "placeholder", "high impact"],
  },
  {
    key: "qa.htmlTag.extra",
    sourceText: "Remove the extra HTML tag before approving.",
    targetText: "",
    contextLabel: "QA warning",
    status: "pending",
    tags: ["qa", "markup"],
  },
  {
    key: "qa.length.mobile",
    sourceText: "Translation may wrap on small screens",
    targetText: "Bản dịch có thể xuống dòng trên màn hình nhỏ",
    contextLabel: "QA warning",
    status: "needs_review",
    tags: ["qa", "mobile"],
    maxLength: 52,
  },
  {
    key: "glossary.term.dashboard",
    sourceText: "Use “Dashboard” for the main analytics overview.",
    targetText: 'Dùng "Bảng điều khiển" cho phần tổng quan phân tích chính.',
    contextLabel: "Glossary note",
    status: "reviewed",
    tags: ["glossary", "dashboard"],
  },
  {
    key: "glossary.term.review",
    sourceText: "Review means human approval, not a customer rating.",
    targetText: "Review nghĩa là phê duyệt thủ công, không phải đánh giá của khách hàng.",
    contextLabel: "Glossary note",
    status: "needs_review",
    tags: ["glossary", "ambiguous"],
  },
  {
    key: "billing.usage.included",
    sourceText: "{count} strings included in your plan",
    targetText: "{count} chuỗi đã bao gồm trong gói của bạn",
    contextLabel: "Billing copy",
    status: "reviewed",
    tags: ["billing", "icu"],
    maxLength: 48,
  },
  {
    key: "billing.usage.overage",
    sourceText: "Additional strings are billed at the end of the month.",
    targetText: "",
    contextLabel: "Billing copy",
    status: "pending",
    tags: ["billing"],
  },
  {
    key: "billing.invoice.download",
    sourceText: "Download invoice",
    targetText: "Tải hóa đơn xuống",
    contextLabel: "Button",
    status: "reviewed",
    tags: ["billing", "button"],
    maxLength: 26,
  },
  {
    key: "integrations.github.connected",
    sourceText: "GitHub is connected",
    targetText: "Đã kết nối GitHub",
    contextLabel: "Integration status",
    status: "reviewed",
    tags: ["integrations", "github"],
  },
  {
    key: "integrations.github.disconnect.confirm",
    sourceText: "Disconnecting GitHub will pause automated pull requests.",
    targetText: "Ngắt kết nối GitHub sẽ tạm dừng các pull request tự động.",
    contextLabel: "Confirmation dialog",
    status: "needs_review",
    tags: ["integrations", "github", "dialog"],
  },
  {
    key: "integrations.cms.syncNow",
    sourceText: "Sync content now",
    targetText: "Đồng bộ nội dung ngay",
    contextLabel: "Button",
    status: "reviewed",
    tags: ["integrations", "cms", "button"],
    maxLength: 28,
  },
  {
    key: "integrations.cms.lastSynced",
    sourceText: "Last synced {relativeTime}",
    targetText: "Đồng bộ lần cuối {relativeTime}",
    contextLabel: "Timestamp label",
    status: "reviewed",
    tags: ["integrations", "cms"],
  },
  {
    key: "automation.run.manual",
    sourceText: "Run automation manually",
    targetText: "Chạy tự động hóa thủ công",
    contextLabel: "Button",
    status: "reviewed",
    tags: ["automation", "button"],
    maxLength: 32,
  },
  {
    key: "automation.run.queued",
    sourceText: "Automation run queued",
    targetText: "Đã đưa lượt chạy tự động hóa vào hàng đợi",
    contextLabel: "Toast",
    status: "needs_review",
    tags: ["automation", "toast"],
  },
  {
    key: "automation.trigger.pullRequest",
    sourceText: "When a pull request updates source strings",
    targetText: "",
    contextLabel: "Trigger description",
    status: "pending",
    tags: ["automation", "github"],
  },
  {
    key: "automation.delivery.branch",
    sourceText: "Create a delivery branch for reviewed translations",
    targetText: "Tạo nhánh bàn giao cho các bản dịch đã duyệt",
    contextLabel: "Delivery option",
    status: "reviewed",
    tags: ["automation", "github"],
  },
  {
    key: "locale.selector.search",
    sourceText: "Search languages and locales",
    targetText: "Tìm ngôn ngữ và vùng",
    contextLabel: "Input placeholder",
    status: "reviewed",
    tags: ["locale", "search"],
  },
  {
    key: "locale.selector.empty",
    sourceText: "No locales match your search.",
    targetText: "Không có vùng nào khớp với tìm kiếm của bạn.",
    contextLabel: "Empty state",
    status: "reviewed",
    tags: ["locale", "empty-state"],
  },
  {
    key: "locale.badge.source",
    sourceText: "Source locale",
    targetText: "Ngôn ngữ nguồn",
    contextLabel: "Badge",
    status: "reviewed",
    tags: ["locale", "badge"],
    maxLength: 20,
  },
  {
    key: "locale.badge.target",
    sourceText: "Target locale",
    targetText: "Ngôn ngữ đích",
    contextLabel: "Badge",
    status: "reviewed",
    tags: ["locale", "badge"],
    maxLength: 20,
  },
  {
    key: "upload.dropzone.title",
    sourceText: "Drop files here to translate",
    targetText: "Thả tệp vào đây để dịch",
    contextLabel: "Dropzone title",
    status: "reviewed",
    tags: ["upload", "files"],
  },
  {
    key: "upload.dropzone.help",
    sourceText: "Supports JSON, XLIFF, CSV, and Android XML files.",
    targetText: "Hỗ trợ tệp JSON, XLIFF, CSV và Android XML.",
    contextLabel: "Dropzone help",
    status: "needs_review",
    tags: ["upload", "files"],
  },
  {
    key: "upload.error.unsupported",
    sourceText: "We couldn't recognize this file format.",
    targetText: "",
    contextLabel: "Error message",
    status: "pending",
    tags: ["upload", "error"],
  },
  {
    key: "upload.progress.extracting",
    sourceText: "Extracting translatable strings",
    targetText: "Đang trích xuất chuỗi có thể dịch",
    contextLabel: "Progress label",
    status: "reviewed",
    tags: ["upload", "progress"],
  },
  {
    key: "tm.match.exact",
    sourceText: "Exact match from translation memory",
    targetText: "Kết quả khớp chính xác từ bộ nhớ dịch",
    contextLabel: "TM badge",
    status: "reviewed",
    tags: ["translation-memory", "badge"],
  },
  {
    key: "tm.match.fuzzy",
    sourceText: "{percent}% match from a related string",
    targetText: "Khớp {percent}% từ một chuỗi liên quan",
    contextLabel: "TM badge",
    status: "reviewed",
    tags: ["translation-memory", "icu"],
  },
  {
    key: "tm.empty.project",
    sourceText: "No translation memory matches yet.",
    targetText: "Chưa có kết quả khớp trong bộ nhớ dịch.",
    contextLabel: "Empty state",
    status: "reviewed",
    tags: ["translation-memory", "empty-state"],
  },
  {
    key: "comments.thread.resolve",
    sourceText: "Resolve thread",
    targetText: "Đánh dấu chuỗi trao đổi đã xử lý",
    contextLabel: "Comment action",
    status: "needs_review",
    tags: ["comments", "action"],
    maxLength: 32,
  },
  {
    key: "comments.thread.reopen",
    sourceText: "Reopen thread",
    targetText: "",
    contextLabel: "Comment action",
    status: "pending",
    tags: ["comments", "action"],
    maxLength: 28,
  },
  {
    key: "comments.composer.placeholder",
    sourceText: "Ask a teammate about this string",
    targetText: "Hỏi đồng đội về chuỗi này",
    contextLabel: "Textarea placeholder",
    status: "reviewed",
    tags: ["comments", "placeholder"],
  },
  {
    key: "review.bulk.approve",
    sourceText: "Approve selected strings",
    targetText: "Phê duyệt các chuỗi đã chọn",
    contextLabel: "Bulk action",
    status: "reviewed",
    tags: ["review", "bulk-action"],
    maxLength: 34,
  },
  {
    key: "review.bulk.skip",
    sourceText: "Skip selected strings",
    targetText: "Bỏ qua các chuỗi đã chọn",
    contextLabel: "Bulk action",
    status: "reviewed",
    tags: ["review", "bulk-action"],
    maxLength: 34,
  },
  {
    key: "review.filter.needsWork",
    sourceText: "Needs work",
    targetText: "Cần chỉnh sửa",
    contextLabel: "Filter option",
    status: "reviewed",
    tags: ["review", "filter"],
  },
  {
    key: "review.filter.untranslated",
    sourceText: "Untranslated",
    targetText: "Chưa dịch",
    contextLabel: "Filter option",
    status: "reviewed",
    tags: ["review", "filter"],
  },
  {
    key: "delivery.pr.title",
    sourceText: "Deliver Vietnamese translations",
    targetText: "Bàn giao bản dịch tiếng Việt",
    contextLabel: "Pull request title",
    status: "reviewed",
    tags: ["delivery", "github"],
  },
  {
    key: "delivery.pr.body",
    sourceText: "Includes reviewed strings and updated locale metadata.",
    targetText: "Bao gồm các chuỗi đã duyệt và siêu dữ liệu vùng đã cập nhật.",
    contextLabel: "Pull request body",
    status: "needs_review",
    tags: ["delivery", "github"],
  },
  {
    key: "delivery.error.permissions",
    sourceText: "We need write access before creating a delivery branch.",
    targetText: "",
    contextLabel: "Error message",
    status: "pending",
    tags: ["delivery", "error", "github"],
  },
  {
    key: "common.retry",
    sourceText: "Try again",
    targetText: "Thử lại",
    contextLabel: "Button",
    status: "reviewed",
    tags: ["common", "button"],
    maxLength: 18,
  },
];

export const catSegmentsFixture: CatSegment[] = catSegmentInputs.map((segment, index) => ({
  ...segment,
  id: `seg-${String(index + 1).padStart(2, "0")}`,
  index: index + 1,
  sourceLocale: SOURCE_LOCALE,
  targetLocale: TARGET_LOCALE,
}));

export const catFormatChecksFixture: CatFormatCheck[] = [
  {
    id: "check-placeholders",
    label: "Placeholders & markup",
    status: "pass",
    message: "No placeholders or HTML tags required for this string.",
    category: "placeholder",
  },
  {
    id: "check-terminology",
    label: "Terminology consistency",
    status: "warn",
    message: "Ambiguous noun: “review” could mean product review or approval step.",
    category: "terminology",
  },
];

export const catIntelligenceFixture: CatSegmentIntelligence = {
  reviewReason:
    "The noun “review” is ambiguous in Vietnamese and the card copy is close to the length limit on mobile.",
  reviewRisk: "medium",
  intent: "Dashboard summary card that highlights pending approval work.",
  locationBreadcrumb: "Dashboard > Overview",
  filePath: "app/dashboard/index.tsx:45",
  componentName: "DashboardCard.tsx",
  productMeaning:
    "“Review” refers to a human approval step for translated content, not a product rating.",
  reviewerPreference: "Keep dashboard cards short, direct, and free of marketing tone.",
  constraints: "Short text · Max 2 lines on mobile",
  glossaryTerms: [
    {
      id: "term-1",
      source: "Dashboard",
      target: "Bảng điều khiển",
      approved: true,
      forbidden: false,
    },
    { id: "term-2", source: "Review", target: "Đánh giá", approved: false, forbidden: true },
    { id: "term-3", source: "Approval", target: "Phê duyệt", approved: true, forbidden: false },
  ],
  translationMemoryMatches: [
    {
      id: "tm-1",
      sourceText: "Dashboard card showing how many translations need review.",
      targetText: "Thẻ bảng điều khiển hiển thị số bản dịch cần duyệt.",
      matchPercent: 92,
      contextLabel: "Dashboard card",
    },
    {
      id: "tm-2",
      sourceText: "Notify me when a translation needs approval",
      targetText: "Thông báo khi bản dịch cần phê duyệt",
      matchPercent: 86,
      contextLabel: "Settings toggle",
    },
    {
      id: "tm-3",
      sourceText: "Reviews waiting for approval",
      targetText: "Các đánh giá đang chờ phê duyệt",
      matchPercent: 78,
      contextLabel: "Review queue",
    },
  ],
  aiSuggestion: "Thẻ trên bảng điều khiển hiển thị số lượng đánh giá cần phê duyệt.",
  aiReasoning: "Direct, natural, and commonly used phrasing in Vietnamese product UI.",
};

export function createCatWorkspaceState(
  overrides: Partial<CatWorkspaceState> = {},
): CatWorkspaceState {
  const segments = overrides.segments ?? catSegmentsFixture;
  const queueSegments = overrides.queueSegments ?? segments.map(toQueueSegment);
  const defaultFileContext: CatFileContext = {
    sourcePath: "app/dashboard/index.tsx",
    filename: "dashboard.tsx",
    sourceLocale: SOURCE_LOCALE,
    targetLocale: TARGET_LOCALE,
    providerKind: null,
    canEditTranslations: true,
    canAddComments: true,
  };
  const { fileContext: fileContextOverride, ...restOverrides } = overrides;

  return {
    queueSegments,
    segments,
    selectedSegmentId: overrides.selectedSegmentId ?? "seg-02",
    formatChecks: catFormatChecksFixture,
    intelligence: catIntelligenceFixture,
    breadcrumbs: ["Project", "HL-Test", "Jobs", "Translate to Vietnamese"],
    ...restOverrides,
    fileContext: { ...defaultFileContext, ...fileContextOverride },
  };
}

export const catWorkspaceFixture = createCatWorkspaceState();

export async function mockValidateFormat(
  segment: CatSegment,
  value: string,
  glossaryTerms: CatGlossaryTerm[] = catIntelligenceFixture.glossaryTerms,
): Promise<CatFormatCheck[]> {
  const checks = [...catFormatChecksFixture];

  const glossaryChecks = glossaryFormatChecksForSegment(
    segment.sourceText,
    value,
    glossaryTerms,
    fixtureIntl,
  );
  if (glossaryChecks.length > 0) {
    checks.unshift(...glossaryChecks);
  }

  if (segment.maxLength && value.length > segment.maxLength) {
    checks.unshift({
      id: "check-length",
      label: "Length on mobile",
      status: "fail",
      message: `Translation exceeds ${segment.maxLength} characters.`,
      category: "length",
    });
  }

  const sourceAnalysis = analyzeCatMessageFormat(segment.sourceText);
  const targetAnalysis = analyzeCatMessageFormat(value);
  const parityIssues = compareCatMessageFormats(sourceAnalysis, targetAnalysis);
  const placeholderCheckIndex = checks.findIndex((check) => check.id === "check-placeholders");

  if (parityIssues.length > 0) {
    checks[placeholderCheckIndex] = formatCheckFromParityIssue(
      parityIssues[0],
      `check-format-${parityIssues[0].kind}`,
    );

    parityIssues.slice(1).forEach((issue, index) => {
      checks.push(formatCheckFromParityIssue(issue, `check-format-${issue.kind}-${index + 1}`));
    });
  } else if (sourceAnalysis.tokens.length > 0) {
    checks[placeholderCheckIndex] = {
      id: "check-placeholders",
      label: "Placeholders & ICU",
      status: "pass",
      message: "Target keeps the required placeholders and ICU structure.",
      category: "placeholder",
    };
  } else {
    checks[placeholderCheckIndex] = {
      id: "check-placeholders",
      label: "Placeholders & markup",
      status: "pass",
      message: "No placeholders or HTML tags required for this string.",
      category: "placeholder",
    };
  }

  return checks;
}
