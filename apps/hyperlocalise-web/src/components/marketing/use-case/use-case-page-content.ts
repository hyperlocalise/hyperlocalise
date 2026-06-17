import type { UseCaseMessageKey } from "./use-case-page-content.messages";

export type { UseCaseMessageKey } from "./use-case-page-content.messages";

export type UseCaseWorkflowStep = {
  labelKey: UseCaseMessageKey;
  descriptionKey?: UseCaseMessageKey;
};

export type UseCaseCapability = {
  titleKey: UseCaseMessageKey;
  descriptionKey: UseCaseMessageKey;
};

export type UseCasePageContent = {
  slug: string;
  metadata: {
    titleKey: UseCaseMessageKey;
    descriptionKey: UseCaseMessageKey;
    keywords: string[];
  };
  hero: {
    eyebrowKey: UseCaseMessageKey;
    headlineKey: UseCaseMessageKey;
    subheadlineKey: UseCaseMessageKey;
    ctaLabelKey: "ctaJoinWaitlist" | "ctaRequestDemo";
  };
  problem: {
    titleKey: UseCaseMessageKey;
    descriptionKey: UseCaseMessageKey;
    painKeys: UseCaseMessageKey[];
  };
  workflow: {
    labelKey: "workflowSectionLabel";
    titleKey: UseCaseMessageKey;
    descriptionKey: UseCaseMessageKey;
    steps: UseCaseWorkflowStep[];
  };
  capabilities: {
    labelKey: "capabilitiesSectionLabel";
    titleKey: UseCaseMessageKey;
    items: UseCaseCapability[];
  };
  differentiator: {
    labelKey: "differentiatorSectionLabel";
    titleKey: UseCaseMessageKey;
    descriptionKey: UseCaseMessageKey;
    pointKeys: UseCaseMessageKey[];
  };
  scenario: {
    labelKey: "scenarioSectionLabel";
    titleKey: UseCaseMessageKey;
    narrativeKey: UseCaseMessageKey;
  };
  cta: {
    headlineKey: UseCaseMessageKey;
    descriptionKey: UseCaseMessageKey;
    primaryLabelKey: "ctaJoinWaitlist" | "ctaRequestDemo";
  };
};

export const useCasePages: UseCasePageContent[] = [
  {
    slug: "product-localisation",
    metadata: {
      titleKey: "productLocalisationMetadataTitle",
      descriptionKey: "productLocalisationMetadataDescription",
      keywords: [
        "product localisation platform",
        "AI product localisation",
        "GitHub localisation workflow",
        "software localisation automation",
      ],
    },
    hero: {
      eyebrowKey: "productLocalisationHeroEyebrow",
      headlineKey: "productLocalisationHeroHeadline",
      subheadlineKey: "productLocalisationHeroSubheadline",
      ctaLabelKey: "ctaJoinWaitlist",
    },
    problem: {
      titleKey: "productLocalisationProblemTitle",
      descriptionKey: "productLocalisationProblemDescription",
      painKeys: [
        "productLocalisationPain0",
        "productLocalisationPain1",
        "productLocalisationPain2",
        "productLocalisationPain3",
        "productLocalisationPain4",
      ],
    },
    workflow: {
      labelKey: "workflowSectionLabel",
      titleKey: "productLocalisationWorkflowTitle",
      descriptionKey: "productLocalisationWorkflowDescription",
      steps: [
        {
          labelKey: "productLocalisationWorkflowStep0Label",
          descriptionKey: "productLocalisationWorkflowStep0Description",
        },
        {
          labelKey: "productLocalisationWorkflowStep1Label",
          descriptionKey: "productLocalisationWorkflowStep1Description",
        },
        {
          labelKey: "productLocalisationWorkflowStep2Label",
          descriptionKey: "productLocalisationWorkflowStep2Description",
        },
        {
          labelKey: "productLocalisationWorkflowStep3Label",
          descriptionKey: "productLocalisationWorkflowStep3Description",
        },
        {
          labelKey: "productLocalisationWorkflowStep4Label",
          descriptionKey: "productLocalisationWorkflowStep4Description",
        },
        {
          labelKey: "productLocalisationWorkflowStep5Label",
          descriptionKey: "productLocalisationWorkflowStep5Description",
        },
      ],
    },
    capabilities: {
      labelKey: "capabilitiesSectionLabel",
      titleKey: "productLocalisationCapabilitiesTitle",
      items: [
        {
          titleKey: "productLocalisationCapability0Title",
          descriptionKey: "productLocalisationCapability0Description",
        },
        {
          titleKey: "productLocalisationCapability1Title",
          descriptionKey: "productLocalisationCapability1Description",
        },
        {
          titleKey: "productLocalisationCapability2Title",
          descriptionKey: "productLocalisationCapability2Description",
        },
        {
          titleKey: "productLocalisationCapability3Title",
          descriptionKey: "productLocalisationCapability3Description",
        },
        {
          titleKey: "productLocalisationCapability4Title",
          descriptionKey: "productLocalisationCapability4Description",
        },
        {
          titleKey: "productLocalisationCapability5Title",
          descriptionKey: "productLocalisationCapability5Description",
        },
      ],
    },
    differentiator: {
      labelKey: "differentiatorSectionLabel",
      titleKey: "productLocalisationDifferentiatorTitle",
      descriptionKey: "productLocalisationDifferentiatorDescription",
      pointKeys: [
        "productLocalisationDifferentiatorPoint0",
        "productLocalisationDifferentiatorPoint1",
        "productLocalisationDifferentiatorPoint2",
        "productLocalisationDifferentiatorPoint3",
        "productLocalisationDifferentiatorPoint4",
        "productLocalisationDifferentiatorPoint5",
      ],
    },
    scenario: {
      labelKey: "scenarioSectionLabel",
      titleKey: "productLocalisationScenarioTitle",
      narrativeKey: "productLocalisationScenarioNarrative",
    },
    cta: {
      headlineKey: "productLocalisationCtaHeadline",
      descriptionKey: "productLocalisationCtaDescription",
      primaryLabelKey: "ctaJoinWaitlist",
    },
  },
  {
    slug: "marketing-localisation",
    metadata: {
      titleKey: "marketingLocalisationMetadataTitle",
      descriptionKey: "marketingLocalisationMetadataDescription",
      keywords: [
        "marketing localisation platform",
        "AI marketing translation",
        "campaign localisation",
        "brand-safe translation",
      ],
    },
    hero: {
      eyebrowKey: "marketingLocalisationHeroEyebrow",
      headlineKey: "marketingLocalisationHeroHeadline",
      subheadlineKey: "marketingLocalisationHeroSubheadline",
      ctaLabelKey: "ctaRequestDemo",
    },
    problem: {
      titleKey: "marketingLocalisationProblemTitle",
      descriptionKey: "marketingLocalisationProblemDescription",
      painKeys: [
        "marketingLocalisationPain0",
        "marketingLocalisationPain1",
        "marketingLocalisationPain2",
        "marketingLocalisationPain3",
        "marketingLocalisationPain4",
      ],
    },
    workflow: {
      labelKey: "workflowSectionLabel",
      titleKey: "marketingLocalisationWorkflowTitle",
      descriptionKey: "marketingLocalisationWorkflowDescription",
      steps: [
        {
          labelKey: "marketingLocalisationWorkflowStep0Label",
          descriptionKey: "marketingLocalisationWorkflowStep0Description",
        },
        {
          labelKey: "marketingLocalisationWorkflowStep1Label",
          descriptionKey: "marketingLocalisationWorkflowStep1Description",
        },
        {
          labelKey: "marketingLocalisationWorkflowStep2Label",
          descriptionKey: "marketingLocalisationWorkflowStep2Description",
        },
        {
          labelKey: "marketingLocalisationWorkflowStep3Label",
          descriptionKey: "marketingLocalisationWorkflowStep3Description",
        },
        {
          labelKey: "marketingLocalisationWorkflowStep4Label",
          descriptionKey: "marketingLocalisationWorkflowStep4Description",
        },
        {
          labelKey: "marketingLocalisationWorkflowStep5Label",
          descriptionKey: "marketingLocalisationWorkflowStep5Description",
        },
      ],
    },
    capabilities: {
      labelKey: "capabilitiesSectionLabel",
      titleKey: "marketingLocalisationCapabilitiesTitle",
      items: [
        {
          titleKey: "marketingLocalisationCapability0Title",
          descriptionKey: "marketingLocalisationCapability0Description",
        },
        {
          titleKey: "marketingLocalisationCapability1Title",
          descriptionKey: "marketingLocalisationCapability1Description",
        },
        {
          titleKey: "marketingLocalisationCapability2Title",
          descriptionKey: "marketingLocalisationCapability2Description",
        },
        {
          titleKey: "marketingLocalisationCapability3Title",
          descriptionKey: "marketingLocalisationCapability3Description",
        },
        {
          titleKey: "marketingLocalisationCapability4Title",
          descriptionKey: "marketingLocalisationCapability4Description",
        },
        {
          titleKey: "marketingLocalisationCapability5Title",
          descriptionKey: "marketingLocalisationCapability5Description",
        },
      ],
    },
    differentiator: {
      labelKey: "differentiatorSectionLabel",
      titleKey: "marketingLocalisationDifferentiatorTitle",
      descriptionKey: "marketingLocalisationDifferentiatorDescription",
      pointKeys: [
        "marketingLocalisationDifferentiatorPoint0",
        "marketingLocalisationDifferentiatorPoint1",
        "marketingLocalisationDifferentiatorPoint2",
        "marketingLocalisationDifferentiatorPoint3",
        "marketingLocalisationDifferentiatorPoint4",
        "marketingLocalisationDifferentiatorPoint5",
      ],
    },
    scenario: {
      labelKey: "scenarioSectionLabel",
      titleKey: "marketingLocalisationScenarioTitle",
      narrativeKey: "marketingLocalisationScenarioNarrative",
    },
    cta: {
      headlineKey: "marketingLocalisationCtaHeadline",
      descriptionKey: "marketingLocalisationCtaDescription",
      primaryLabelKey: "ctaRequestDemo",
    },
  },
  {
    slug: "help-center-localisation",
    metadata: {
      titleKey: "helpCenterLocalisationMetadataTitle",
      descriptionKey: "helpCenterLocalisationMetadataDescription",
      keywords: [
        "help center localisation",
        "AI help center translation",
        "support content localisation",
        "knowledge base translation",
      ],
    },
    hero: {
      eyebrowKey: "helpCenterLocalisationHeroEyebrow",
      headlineKey: "helpCenterLocalisationHeroHeadline",
      subheadlineKey: "helpCenterLocalisationHeroSubheadline",
      ctaLabelKey: "ctaJoinWaitlist",
    },
    problem: {
      titleKey: "helpCenterLocalisationProblemTitle",
      descriptionKey: "helpCenterLocalisationProblemDescription",
      painKeys: [
        "helpCenterLocalisationPain0",
        "helpCenterLocalisationPain1",
        "helpCenterLocalisationPain2",
        "helpCenterLocalisationPain3",
        "helpCenterLocalisationPain4",
      ],
    },
    workflow: {
      labelKey: "workflowSectionLabel",
      titleKey: "helpCenterLocalisationWorkflowTitle",
      descriptionKey: "helpCenterLocalisationWorkflowDescription",
      steps: [
        {
          labelKey: "helpCenterLocalisationWorkflowStep0Label",
          descriptionKey: "helpCenterLocalisationWorkflowStep0Description",
        },
        {
          labelKey: "helpCenterLocalisationWorkflowStep1Label",
          descriptionKey: "helpCenterLocalisationWorkflowStep1Description",
        },
        {
          labelKey: "helpCenterLocalisationWorkflowStep2Label",
          descriptionKey: "helpCenterLocalisationWorkflowStep2Description",
        },
        {
          labelKey: "helpCenterLocalisationWorkflowStep3Label",
          descriptionKey: "helpCenterLocalisationWorkflowStep3Description",
        },
        {
          labelKey: "helpCenterLocalisationWorkflowStep4Label",
          descriptionKey: "helpCenterLocalisationWorkflowStep4Description",
        },
        {
          labelKey: "helpCenterLocalisationWorkflowStep5Label",
          descriptionKey: "helpCenterLocalisationWorkflowStep5Description",
        },
      ],
    },
    capabilities: {
      labelKey: "capabilitiesSectionLabel",
      titleKey: "helpCenterLocalisationCapabilitiesTitle",
      items: [
        {
          titleKey: "helpCenterLocalisationCapability0Title",
          descriptionKey: "helpCenterLocalisationCapability0Description",
        },
        {
          titleKey: "helpCenterLocalisationCapability1Title",
          descriptionKey: "helpCenterLocalisationCapability1Description",
        },
        {
          titleKey: "helpCenterLocalisationCapability2Title",
          descriptionKey: "helpCenterLocalisationCapability2Description",
        },
        {
          titleKey: "helpCenterLocalisationCapability3Title",
          descriptionKey: "helpCenterLocalisationCapability3Description",
        },
        {
          titleKey: "helpCenterLocalisationCapability4Title",
          descriptionKey: "helpCenterLocalisationCapability4Description",
        },
        {
          titleKey: "helpCenterLocalisationCapability5Title",
          descriptionKey: "helpCenterLocalisationCapability5Description",
        },
      ],
    },
    differentiator: {
      labelKey: "differentiatorSectionLabel",
      titleKey: "helpCenterLocalisationDifferentiatorTitle",
      descriptionKey: "helpCenterLocalisationDifferentiatorDescription",
      pointKeys: [
        "helpCenterLocalisationDifferentiatorPoint0",
        "helpCenterLocalisationDifferentiatorPoint1",
        "helpCenterLocalisationDifferentiatorPoint2",
        "helpCenterLocalisationDifferentiatorPoint3",
        "helpCenterLocalisationDifferentiatorPoint4",
        "helpCenterLocalisationDifferentiatorPoint5",
      ],
    },
    scenario: {
      labelKey: "scenarioSectionLabel",
      titleKey: "helpCenterLocalisationScenarioTitle",
      narrativeKey: "helpCenterLocalisationScenarioNarrative",
    },
    cta: {
      headlineKey: "helpCenterLocalisationCtaHeadline",
      descriptionKey: "helpCenterLocalisationCtaDescription",
      primaryLabelKey: "ctaJoinWaitlist",
    },
  },
  {
    slug: "github-release-localisation",
    metadata: {
      titleKey: "githubReleaseLocalisationMetadataTitle",
      descriptionKey: "githubReleaseLocalisationMetadataDescription",
      keywords: [
        "GitHub localisation workflow",
        "localisation CI",
        "software translation automation",
        "AI localisation for developers",
      ],
    },
    hero: {
      eyebrowKey: "githubReleaseLocalisationHeroEyebrow",
      headlineKey: "githubReleaseLocalisationHeroHeadline",
      subheadlineKey: "githubReleaseLocalisationHeroSubheadline",
      ctaLabelKey: "ctaJoinWaitlist",
    },
    problem: {
      titleKey: "githubReleaseLocalisationProblemTitle",
      descriptionKey: "githubReleaseLocalisationProblemDescription",
      painKeys: [
        "githubReleaseLocalisationPain0",
        "githubReleaseLocalisationPain1",
        "githubReleaseLocalisationPain2",
        "githubReleaseLocalisationPain3",
        "githubReleaseLocalisationPain4",
      ],
    },
    workflow: {
      labelKey: "workflowSectionLabel",
      titleKey: "githubReleaseLocalisationWorkflowTitle",
      descriptionKey: "githubReleaseLocalisationWorkflowDescription",
      steps: [
        {
          labelKey: "githubReleaseLocalisationWorkflowStep0Label",
          descriptionKey: "githubReleaseLocalisationWorkflowStep0Description",
        },
        {
          labelKey: "githubReleaseLocalisationWorkflowStep1Label",
          descriptionKey: "githubReleaseLocalisationWorkflowStep1Description",
        },
        {
          labelKey: "githubReleaseLocalisationWorkflowStep2Label",
          descriptionKey: "githubReleaseLocalisationWorkflowStep2Description",
        },
        {
          labelKey: "githubReleaseLocalisationWorkflowStep3Label",
          descriptionKey: "githubReleaseLocalisationWorkflowStep3Description",
        },
        {
          labelKey: "githubReleaseLocalisationWorkflowStep4Label",
          descriptionKey: "githubReleaseLocalisationWorkflowStep4Description",
        },
        {
          labelKey: "githubReleaseLocalisationWorkflowStep5Label",
          descriptionKey: "githubReleaseLocalisationWorkflowStep5Description",
        },
      ],
    },
    capabilities: {
      labelKey: "capabilitiesSectionLabel",
      titleKey: "githubReleaseLocalisationCapabilitiesTitle",
      items: [
        {
          titleKey: "githubReleaseLocalisationCapability0Title",
          descriptionKey: "githubReleaseLocalisationCapability0Description",
        },
        {
          titleKey: "githubReleaseLocalisationCapability1Title",
          descriptionKey: "githubReleaseLocalisationCapability1Description",
        },
        {
          titleKey: "githubReleaseLocalisationCapability2Title",
          descriptionKey: "githubReleaseLocalisationCapability2Description",
        },
        {
          titleKey: "githubReleaseLocalisationCapability3Title",
          descriptionKey: "githubReleaseLocalisationCapability3Description",
        },
        {
          titleKey: "githubReleaseLocalisationCapability4Title",
          descriptionKey: "githubReleaseLocalisationCapability4Description",
        },
        {
          titleKey: "githubReleaseLocalisationCapability5Title",
          descriptionKey: "githubReleaseLocalisationCapability5Description",
        },
      ],
    },
    differentiator: {
      labelKey: "differentiatorSectionLabel",
      titleKey: "githubReleaseLocalisationDifferentiatorTitle",
      descriptionKey: "githubReleaseLocalisationDifferentiatorDescription",
      pointKeys: [
        "githubReleaseLocalisationDifferentiatorPoint0",
        "githubReleaseLocalisationDifferentiatorPoint1",
        "githubReleaseLocalisationDifferentiatorPoint2",
        "githubReleaseLocalisationDifferentiatorPoint3",
        "githubReleaseLocalisationDifferentiatorPoint4",
        "githubReleaseLocalisationDifferentiatorPoint5",
      ],
    },
    scenario: {
      labelKey: "scenarioSectionLabel",
      titleKey: "githubReleaseLocalisationScenarioTitle",
      narrativeKey: "githubReleaseLocalisationScenarioNarrative",
    },
    cta: {
      headlineKey: "githubReleaseLocalisationCtaHeadline",
      descriptionKey: "githubReleaseLocalisationCtaDescription",
      primaryLabelKey: "ctaJoinWaitlist",
    },
  },
  {
    slug: "localisation-quality-monitoring",
    metadata: {
      titleKey: "localisationQualityMonitoringMetadataTitle",
      descriptionKey: "localisationQualityMonitoringMetadataDescription",
      keywords: [
        "localisation quality monitoring",
        "translation quality automation",
        "AI translation QA",
        "localisation QA checks",
      ],
    },
    hero: {
      eyebrowKey: "localisationQualityMonitoringHeroEyebrow",
      headlineKey: "localisationQualityMonitoringHeroHeadline",
      subheadlineKey: "localisationQualityMonitoringHeroSubheadline",
      ctaLabelKey: "ctaRequestDemo",
    },
    problem: {
      titleKey: "localisationQualityMonitoringProblemTitle",
      descriptionKey: "localisationQualityMonitoringProblemDescription",
      painKeys: [
        "localisationQualityMonitoringPain0",
        "localisationQualityMonitoringPain1",
        "localisationQualityMonitoringPain2",
        "localisationQualityMonitoringPain3",
        "localisationQualityMonitoringPain4",
      ],
    },
    workflow: {
      labelKey: "workflowSectionLabel",
      titleKey: "localisationQualityMonitoringWorkflowTitle",
      descriptionKey: "localisationQualityMonitoringWorkflowDescription",
      steps: [
        {
          labelKey: "localisationQualityMonitoringWorkflowStep0Label",
          descriptionKey: "localisationQualityMonitoringWorkflowStep0Description",
        },
        {
          labelKey: "localisationQualityMonitoringWorkflowStep1Label",
          descriptionKey: "localisationQualityMonitoringWorkflowStep1Description",
        },
        {
          labelKey: "localisationQualityMonitoringWorkflowStep2Label",
          descriptionKey: "localisationQualityMonitoringWorkflowStep2Description",
        },
        {
          labelKey: "localisationQualityMonitoringWorkflowStep3Label",
          descriptionKey: "localisationQualityMonitoringWorkflowStep3Description",
        },
        {
          labelKey: "localisationQualityMonitoringWorkflowStep4Label",
          descriptionKey: "localisationQualityMonitoringWorkflowStep4Description",
        },
        {
          labelKey: "localisationQualityMonitoringWorkflowStep5Label",
          descriptionKey: "localisationQualityMonitoringWorkflowStep5Description",
        },
      ],
    },
    capabilities: {
      labelKey: "capabilitiesSectionLabel",
      titleKey: "localisationQualityMonitoringCapabilitiesTitle",
      items: [
        {
          titleKey: "localisationQualityMonitoringCapability0Title",
          descriptionKey: "localisationQualityMonitoringCapability0Description",
        },
        {
          titleKey: "localisationQualityMonitoringCapability1Title",
          descriptionKey: "localisationQualityMonitoringCapability1Description",
        },
        {
          titleKey: "localisationQualityMonitoringCapability2Title",
          descriptionKey: "localisationQualityMonitoringCapability2Description",
        },
        {
          titleKey: "localisationQualityMonitoringCapability3Title",
          descriptionKey: "localisationQualityMonitoringCapability3Description",
        },
        {
          titleKey: "localisationQualityMonitoringCapability4Title",
          descriptionKey: "localisationQualityMonitoringCapability4Description",
        },
        {
          titleKey: "localisationQualityMonitoringCapability5Title",
          descriptionKey: "localisationQualityMonitoringCapability5Description",
        },
      ],
    },
    differentiator: {
      labelKey: "differentiatorSectionLabel",
      titleKey: "localisationQualityMonitoringDifferentiatorTitle",
      descriptionKey: "localisationQualityMonitoringDifferentiatorDescription",
      pointKeys: [
        "localisationQualityMonitoringDifferentiatorPoint0",
        "localisationQualityMonitoringDifferentiatorPoint1",
        "localisationQualityMonitoringDifferentiatorPoint2",
        "localisationQualityMonitoringDifferentiatorPoint3",
        "localisationQualityMonitoringDifferentiatorPoint4",
        "localisationQualityMonitoringDifferentiatorPoint5",
      ],
    },
    scenario: {
      labelKey: "scenarioSectionLabel",
      titleKey: "localisationQualityMonitoringScenarioTitle",
      narrativeKey: "localisationQualityMonitoringScenarioNarrative",
    },
    cta: {
      headlineKey: "localisationQualityMonitoringCtaHeadline",
      descriptionKey: "localisationQualityMonitoringCtaDescription",
      primaryLabelKey: "ctaRequestDemo",
    },
  },
  {
    slug: "localisation-operations",
    metadata: {
      titleKey: "localisationOperationsMetadataTitle",
      descriptionKey: "localisationOperationsMetadataDescription",
      keywords: [
        "localisation operations platform",
        "AI localisation operations",
        "TMS agnostic localisation",
        "translation workflow automation",
      ],
    },
    hero: {
      eyebrowKey: "localisationOperationsHeroEyebrow",
      headlineKey: "localisationOperationsHeroHeadline",
      subheadlineKey: "localisationOperationsHeroSubheadline",
      ctaLabelKey: "ctaRequestDemo",
    },
    problem: {
      titleKey: "localisationOperationsProblemTitle",
      descriptionKey: "localisationOperationsProblemDescription",
      painKeys: [
        "localisationOperationsPain0",
        "localisationOperationsPain1",
        "localisationOperationsPain2",
        "localisationOperationsPain3",
        "localisationOperationsPain4",
      ],
    },
    workflow: {
      labelKey: "workflowSectionLabel",
      titleKey: "localisationOperationsWorkflowTitle",
      descriptionKey: "localisationOperationsWorkflowDescription",
      steps: [
        {
          labelKey: "localisationOperationsWorkflowStep0Label",
          descriptionKey: "localisationOperationsWorkflowStep0Description",
        },
        {
          labelKey: "localisationOperationsWorkflowStep1Label",
          descriptionKey: "localisationOperationsWorkflowStep1Description",
        },
        {
          labelKey: "localisationOperationsWorkflowStep2Label",
          descriptionKey: "localisationOperationsWorkflowStep2Description",
        },
        {
          labelKey: "localisationOperationsWorkflowStep3Label",
          descriptionKey: "localisationOperationsWorkflowStep3Description",
        },
        {
          labelKey: "localisationOperationsWorkflowStep4Label",
          descriptionKey: "localisationOperationsWorkflowStep4Description",
        },
        {
          labelKey: "localisationOperationsWorkflowStep5Label",
          descriptionKey: "localisationOperationsWorkflowStep5Description",
        },
      ],
    },
    capabilities: {
      labelKey: "capabilitiesSectionLabel",
      titleKey: "localisationOperationsCapabilitiesTitle",
      items: [
        {
          titleKey: "localisationOperationsCapability0Title",
          descriptionKey: "localisationOperationsCapability0Description",
        },
        {
          titleKey: "localisationOperationsCapability1Title",
          descriptionKey: "localisationOperationsCapability1Description",
        },
        {
          titleKey: "localisationOperationsCapability2Title",
          descriptionKey: "localisationOperationsCapability2Description",
        },
        {
          titleKey: "localisationOperationsCapability3Title",
          descriptionKey: "localisationOperationsCapability3Description",
        },
        {
          titleKey: "localisationOperationsCapability4Title",
          descriptionKey: "localisationOperationsCapability4Description",
        },
        {
          titleKey: "localisationOperationsCapability5Title",
          descriptionKey: "localisationOperationsCapability5Description",
        },
      ],
    },
    differentiator: {
      labelKey: "differentiatorSectionLabel",
      titleKey: "localisationOperationsDifferentiatorTitle",
      descriptionKey: "localisationOperationsDifferentiatorDescription",
      pointKeys: [
        "localisationOperationsDifferentiatorPoint0",
        "localisationOperationsDifferentiatorPoint1",
        "localisationOperationsDifferentiatorPoint2",
        "localisationOperationsDifferentiatorPoint3",
        "localisationOperationsDifferentiatorPoint4",
        "localisationOperationsDifferentiatorPoint5",
      ],
    },
    scenario: {
      labelKey: "scenarioSectionLabel",
      titleKey: "localisationOperationsScenarioTitle",
      narrativeKey: "localisationOperationsScenarioNarrative",
    },
    cta: {
      headlineKey: "localisationOperationsCtaHeadline",
      descriptionKey: "localisationOperationsCtaDescription",
      primaryLabelKey: "ctaJoinWaitlist",
    },
  },
];

export const useCasePagesBySlug = Object.fromEntries(
  useCasePages.map((page) => [page.slug, page]),
) as Record<string, UseCasePageContent>;

export const useCaseSlugs = useCasePages.map((page) => page.slug);

export const useCaseFooterLinks = useCasePages.map((page) => ({
  useCaseLabelKey: page.hero.eyebrowKey,
  href: `/use-cases/${page.slug}`,
}));
