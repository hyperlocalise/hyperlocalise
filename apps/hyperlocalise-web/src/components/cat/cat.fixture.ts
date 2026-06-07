import type {
  CatFormatCheck,
  CatSegment,
  CatSegmentIntelligence,
  CatSuggestion,
  CatWorkspaceState,
} from "./types";

export const catSegmentsFixture: CatSegment[] = [
  {
    id: "seg-01",
    index: 1,
    key: "dashboard.reviews.pending.title",
    sourceText: "Reviews awaiting approval",
    targetText: "Các đánh giá đang chờ phê duyệt",
    sourceLocale: "en-US",
    targetLocale: "vi",
    contextLabel: "Heading",
    status: "reviewed",
    tags: ["dashboard"],
  },
  {
    id: "seg-02",
    index: 2,
    key: "dashboard.reviews.pending.card",
    sourceText: "Dashboard card showing how many reviews still need approval.",
    targetText: "Thẻ bảng điều khiển hiển thị số đánh giá còn cần phê duyệt.",
    sourceLocale: "en-US",
    targetLocale: "vi",
    contextLabel: "Card description",
    status: "needs_review",
    tags: ["dashboard", "card", "high impact"],
    maxLength: 80,
  },
  {
    id: "seg-03",
    index: 3,
    key: "email.review.subject",
    sourceText: "Your review is ready for approval",
    targetText: "",
    sourceLocale: "en-US",
    targetLocale: "vi",
    contextLabel: "Email subject",
    status: "pending",
    tags: ["email"],
  },
  {
    id: "seg-04",
    index: 4,
    key: "settings.notifications.review",
    sourceText: "Notify me when a review needs approval",
    targetText: "Thông báo khi có đánh giá cần phê duyệt",
    sourceLocale: "en-US",
    targetLocale: "vi",
    contextLabel: "Settings toggle",
    status: "reviewed",
  },
  {
    id: "seg-05",
    index: 5,
    key: "onboarding.review.cta",
    sourceText: "Start reviewing translations",
    targetText: "Bắt đầu duyệt bản dịch",
    sourceLocale: "en-US",
    targetLocale: "vi",
    contextLabel: "CTA button",
    status: "pending",
  },
];

export const catSuggestionsFixture: CatSuggestion[] = [
  {
    id: "sug-ai",
    source: "ai",
    text: "Thẻ trên bảng điều khiển hiển thị số lượng đánh giá cần phê duyệt.",
    metadata: "Natural Vietnamese UI phrasing",
  },
  {
    id: "sug-glossary",
    source: "glossary",
    text: "Thẻ bảng điều khiển hiển thị số đánh giá cần phê duyệt.",
    metadata: "Uses approved term: Dashboard → Bảng điều khiển",
  },
  {
    id: "sug-tm",
    source: "tm",
    text: "Thẻ bảng điều khiển cho biết còn bao nhiêu đánh giá cần phê duyệt.",
    matchPercent: 85,
    metadata: "From project TM",
  },
];

export const catFormatChecksFixture: CatFormatCheck[] = [
  {
    id: "check-length",
    label: "Length on mobile",
    status: "warn",
    message: "Translation may wrap beyond 2 lines on small screens.",
  },
  {
    id: "check-glossary",
    label: "Glossary compliance",
    status: "pass",
    message: "Approved terms for Dashboard and Review are used correctly.",
  },
  {
    id: "check-placeholders",
    label: "Placeholders & markup",
    status: "pass",
    message: "No placeholders or HTML tags required for this string.",
  },
  {
    id: "check-terminology",
    label: "Terminology consistency",
    status: "warn",
    message: "Ambiguous noun: “review” could mean product review or approval step.",
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
    { id: "term-1", source: "Dashboard", target: "Bảng điều khiển", approved: true },
    { id: "term-2", source: "Review", target: "Đánh giá", approved: true },
    { id: "term-3", source: "Approval", target: "Phê duyệt", approved: true },
  ],
  qaRisks: [
    { id: "risk-1", label: "Ambiguous noun (review)", level: "medium" },
    { id: "risk-2", label: "Length on mobile", level: "good" },
  ],
  githubEvidence: [
    {
      label: "PR #482 — Dashboard card copy refresh",
      href: "https://github.com/example/repo/pull/482",
    },
    {
      label: "Commit a91f2c — Add review queue metric",
      href: "https://github.com/example/repo/commit/a91f2c",
    },
  ],
  relatedStringCount: 3,
  aiSuggestion: "Thẻ trên bảng điều khiển hiển thị số lượng đánh giá cần phê duyệt.",
  aiReasoning: "Direct, natural, and commonly used phrasing in Vietnamese product UI.",
};

export function createCatWorkspaceState(
  overrides: Partial<CatWorkspaceState> = {},
): CatWorkspaceState {
  return {
    segments: catSegmentsFixture,
    selectedSegmentId: "seg-02",
    queueSummary: { total: 12, reviewed: 5 },
    formatChecks: catFormatChecksFixture,
    intelligence: catIntelligenceFixture,
    breadcrumbs: ["Project", "HL-Test", "Jobs", "Translate to Vietnamese"],
    ...overrides,
  };
}

export const catWorkspaceFixture = createCatWorkspaceState();

export async function mockValidateFormat(
  segment: CatSegment,
  value: string,
): Promise<CatFormatCheck[]> {
  const checks = [...catFormatChecksFixture];

  if (segment.maxLength && value.length > segment.maxLength) {
    checks[0] = {
      id: "check-length",
      label: "Length on mobile",
      status: "fail",
      message: `Translation exceeds ${segment.maxLength} characters.`,
    };
  } else if (value.length > 60) {
    checks[0] = {
      id: "check-length",
      label: "Length on mobile",
      status: "warn",
      message: "Translation may wrap beyond 2 lines on small screens.",
    };
  } else {
    checks[0] = {
      id: "check-length",
      label: "Length on mobile",
      status: "pass",
      message: "Fits within mobile layout constraints.",
    };
  }

  return checks;
}
