"use client";

import * as React from "react";
import Image from "next/image";
import { FormattedMessage } from "react-intl";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  UserIcon,
  CodeIcon,
  GitPullRequestIcon,
  PlayIcon,
  ShieldCheckIcon,
  BookOpenIcon,
  TranslateIcon,
  CircleNotchIcon,
  ArrowClockwiseIcon,
} from "@phosphor-icons/react";

import { TypographyH2, TypographyH3, TypographyP } from "@/components/ui/typography";

import type { UseCasePageContent } from "./use-case-page-content";
import { useCasePageMessages, type UseCaseMessageKey } from "./use-case-page-content.messages";

type Props = {
  content: UseCasePageContent;
};

const scenarioMeshes = [
  "/images/mesh/mesh-gradient-1788785908604.jpg",
  "/images/mesh/mesh-gradient-1784863799475.jpg",
  "/images/mesh/mesh-gradient-1788785752729.jpg",
] as const;

function Message({ messageKey }: { messageKey: UseCaseMessageKey }) {
  return <FormattedMessage {...useCasePageMessages[messageKey]} />;
}

type ScenarioStep = UseCasePageContent["workflow"]["steps"][number];

type ScenarioVisualProps = {
  steps: ScenarioStep[];
  active: boolean;
};

function StepText({ step }: { step: ScenarioStep | undefined }) {
  if (!step) return null;

  return (
    <>
      <TypographyH3 className="text-xl font-medium leading-snug tracking-[-0.035em]">
        <Message messageKey={step.labelKey} />
      </TypographyH3>

      {step.descriptionKey ? (
        <TypographyP className="mt-2 text-[0.95rem] leading-relaxed" tone="subtle">
          <Message messageKey={step.descriptionKey} />
        </TypographyP>
      ) : null}
    </>
  );
}

function ReleaseTriggerVisual({ steps, active }: ScenarioVisualProps) {
  const triggerStep = steps[0];

  return (
    <div className="absolute inset-x-[7%] top-1/2 -translate-y-1/2">
      <div className="relative flex flex-col items-center">
        <div className="relative z-10 w-full overflow-hidden rounded-2xl border border-border/40 bg-background/95 p-4 shadow-[0_12px_35px_rgba(0,0,0,0.10)] backdrop-blur-xl">
          <div className="border-b border-border/70 pb-3">
            <p className="text-sm font-semibold text-foreground">
              <Message messageKey="productLocalisationScenarioProductManager" />
            </p>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <UserIcon className="size-6 text-primary" weight="regular" aria-hidden />
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground">
                <Message messageKey="productLocalisationScenarioProductManager" />
              </p>

              <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
                <Message messageKey="productLocalisationScenarioProductTeam" />
              </p>
            </div>

            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-2 text-[0.7rem] font-medium text-foreground shadow-sm">
              <GitPullRequestIcon className="size-4" aria-hidden />

              <Message messageKey="productLocalisationScenarioCreatePR" />
            </span>
          </div>
        </div>

        <div className="relative flex h-12 w-full justify-center">
          <div className="h-full border-l-2 border-dashed border-foreground/25" />
        </div>

        <div
          className={[
            "relative z-10 flex w-full items-center gap-3 rounded-xl border border-border/40 bg-background/95 px-4 py-3.5 shadow-lg backdrop-blur-xl",
            "transition-colors duration-300",
            active ? "border-primary/30" : "",
          ].join(" ")}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <GitPullRequestIcon className="size-5 text-primary" aria-hidden />
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-foreground">
              {triggerStep && <Message messageKey={triggerStep.labelKey} />}
            </p>

            {triggerStep?.descriptionKey && (
              <p className="mt-1 line-clamp-2 text-[0.65rem] leading-relaxed text-muted-foreground">
                <Message messageKey={triggerStep.descriptionKey} />
              </p>
            )}
          </div>

          <CheckCircleIcon
            className={[
              "size-5 shrink-0 transition-colors duration-300",
              active ? "text-primary" : "text-muted-foreground/40",
            ].join(" ")}
            weight={active ? "fill" : "regular"}
            aria-hidden
          />
        </div>

        <div className="flex h-8 justify-center">
          <div className="h-full border-l-2 border-dashed border-foreground/25" />
        </div>

        <span
          className={[
            "relative z-10 flex size-8 items-center justify-center rounded-full shadow-md transition-colors duration-300",
            active ? "bg-primary text-primary-foreground" : "bg-foreground text-background",
          ].join(" ")}
        >
          {active ? (
            <CheckCircleIcon className="size-4" weight="fill" aria-hidden />
          ) : (
            <ArrowRightIcon className="size-4" aria-hidden />
          )}
        </span>
      </div>
    </div>
  );
}

function TranslationVisual({ active }: ScenarioVisualProps) {
  const stages = [
    {
      Icon: CodeIcon,
      titleKey: "productLocalisationWorkflowStep0Description",
      descriptionKey: "productLocalisationScenarioFlowStepContextDetail",
    },
    {
      Icon: BookOpenIcon,
      titleKey: "productLocalisationScenarioFlowStepContextTitle",
      descriptionKey: "productLocalisationScenarioFlowStepContextSubtitle",
    },
    {
      Icon: TranslateIcon,
      titleKey: "productLocalisationScenarioFlowStepDraftTitle",
      descriptionKey: "productLocalisationWorkflowStep2Description",
    },
    {
      Icon: ShieldCheckIcon,
      titleKey: "productLocalisationCapability2Title",
      descriptionKey: "productLocalisationCapability2Description",
    },
  ] as const;

  return (
    <div className="absolute inset-x-[7%] top-1/2 -translate-y-1/2">
      <div className="relative">
        {stages.map(({ Icon, titleKey, descriptionKey }, index) => (
          <React.Fragment key={titleKey}>
            {/* Floating process card */}
            <div className="relative z-10 flex items-start gap-3 rounded-xl border border-white/15 bg-black/60 px-3 py-3 shadow-lg backdrop-blur-xl">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                <Icon className="size-4 text-white" aria-hidden />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-[0.72rem] font-semibold leading-4 text-white">
                  <Message messageKey={titleKey} />
                </p>

                <p className="mt-1 text-[0.63rem] leading-4 text-white/70">
                  <Message messageKey={descriptionKey} />
                </p>
              </div>

              <CheckCircleIcon
                className={[
                  "mt-1 size-4 shrink-0 transition-colors duration-300",
                  active ? "text-white" : "text-white/40",
                ].join(" ")}
                weight={active ? "fill" : "regular"}
                aria-hidden
              />
            </div>

            {index < stages.length - 1 && (
              <div className="flex h-5 justify-center">
                <div className="h-full border-l-2 border-dashed border-white/40" />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function ReleaseReadinessVisual({ steps, active }: ScenarioVisualProps) {
  const syncStep = steps[4];
  const releaseStep = steps[5];

  const events = [
    {
      Icon: TranslateIcon,
      step: syncStep,
    },
    {
      Icon: ShieldCheckIcon,
      step: releaseStep,
    },
    {
      Icon: CheckCircleIcon,
      step: releaseStep,
    },
  ] as const;

  return (
    <div className="absolute inset-x-[7%] top-1/2 -translate-y-1/2">
      <div className="relative space-y-3">
        <div className="absolute bottom-4 left-5 top-4 border-l-2 border-dashed border-foreground/20" />

        {events.map(({ Icon, step }, index) => (
          <div
            key={index}
            className="relative flex items-center gap-3 rounded-xl border border-border/40 bg-background/95 px-4 py-3.5 shadow-lg backdrop-blur-xl"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="size-4 text-primary" aria-hidden />
            </span>

            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
              {step && <Message messageKey={step.labelKey} />}
            </span>

            <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[0.65rem] tabular-nums text-muted-foreground">
              {`0${index + 1}`}
            </span>
          </div>
        ))}

        <div className="relative flex justify-center pt-1">
          <span
            className={[
              "flex size-10 items-center justify-center rounded-full shadow-lg transition-all duration-300",
              active ? "bg-primary text-primary-foreground" : "bg-foreground text-background",
            ].join(" ")}
          >
            {active ? (
              <CheckCircleIcon className="size-5" weight="fill" aria-hidden />
            ) : (
              <ArrowRightIcon className="size-5" aria-hidden />
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ProductLocalisationScenario({ content }: Props) {
  const [activeStage, setActiveStage] = React.useState(-1);
  const [isRunning, setIsRunning] = React.useState(false);
  const [isComplete, setIsComplete] = React.useState(false);

  const steps = content.workflow.steps;

  const cards = [
    {
      titleStep: steps[0],
      image: scenarioMeshes[0],
      Visual: ReleaseTriggerVisual,
    },
    {
      titleStep: steps[2],
      image: scenarioMeshes[1],
      Visual: TranslationVisual,
    },
    {
      titleStep: steps[5],
      image: scenarioMeshes[2],
      Visual: ReleaseReadinessVisual,
    },
  ] as const;

  React.useEffect(() => {
    if (!isRunning) return;

    const timers = [
      window.setTimeout(() => setActiveStage(0), 200),
      window.setTimeout(() => setActiveStage(1), 1700),
      window.setTimeout(() => setActiveStage(2), 3200),
      window.setTimeout(() => {
        setIsRunning(false);
        setIsComplete(true);
      }, 4700),
    ];

    return () => {
      timers.forEach(window.clearTimeout);
    };
  }, [isRunning]);

  function runSimulation() {
    if (isRunning) return;

    setActiveStage(-1);
    setIsComplete(false);
    setIsRunning(true);
  }

  return (
    <div className="mx-auto w-full max-w-[1440px]">
      <div className="grid items-end gap-8 lg:grid-cols-2 lg:gap-16">
        <div className="max-w-xl">
          <TypographyP className="mb-5 text-sm" tone="subtle">
            <Message messageKey={content.scenario.labelKey} />
          </TypographyP>

          <TypographyH2 className="text-4xl leading-[1.05] tracking-[-0.05em] sm:text-5xl lg:text-[3.5rem]">
            <Message messageKey={content.scenario.titleKey} />
          </TypographyH2>
        </div>

        <div className="max-w-xl lg:ml-auto lg:pb-2">
          <TypographyP className="text-sm leading-relaxed sm:text-md" tone="subtle">
            <Message messageKey={content.scenario.narrativeKey} />
          </TypographyP>
        </div>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-x-6 gap-y-12 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ titleStep, image, Visual }, index) => {
          const active = activeStage >= index;
          const current = activeStage === index && isRunning;
          return (
            <article key={index} className="min-w-0">
              <button
                type="button"
                aria-pressed={activeStage === index}
                aria-label={
                  titleStep ? useCasePageMessages[titleStep.labelKey].defaultMessage : undefined
                }
                className="group block w-full cursor-pointer rounded-[1.25rem] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div
                  className={[
                    "relative aspect-[4/5] overflow-hidden rounded-[1.25rem]",
                    "transition-shadow duration-300",
                    current ? "ring-2 ring-primary/40" : "",
                  ].join(" ")}
                >
                  <Image
                    src={image}
                    alt=""
                    fill
                    unoptimized
                    sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.025]"
                  />

                  {index !== 1 && <div className="absolute inset-0 bg-background/10" />}

                  <Visual steps={steps} active={active} />

                  <span className="absolute left-4 top-4 flex size-8 items-center justify-center rounded-lg bg-black/25 text-xs font-medium text-white backdrop-blur-sm">
                    {index + 1}
                  </span>
                </div>

                <div className="mt-6">
                  <StepText step={titleStep} />
                </div>
              </button>
            </article>
          );
        })}
      </div>

      <div className="mt-10 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={runSimulation}
          disabled={isRunning}
          className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {isRunning ? (
            <CircleNotchIcon className="size-4 animate-spin" aria-hidden />
          ) : isComplete ? (
            <ArrowClockwiseIcon className="size-4" aria-hidden />
          ) : (
            <PlayIcon className="size-4" weight="fill" aria-hidden />
          )}

          {isRunning ? (
            <Message messageKey="productLocalisationScenarioFlowStatusRunning" />
          ) : isComplete ? (
            <Message messageKey="productLocalisationScenarioRerun" />
          ) : (
            <Message messageKey="productLocalisationScenarioFlowRun" />
          )}
        </button>

        <div className="flex items-center gap-1.5" aria-hidden>
          {cards.map((_, index) => (
            <span
              key={index}
              className={[
                "h-1.5 rounded-full transition-all duration-300",
                activeStage === index ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/25",
              ].join(" ")}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
