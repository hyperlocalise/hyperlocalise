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
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useIntl } from "react-intl";
import { z } from "zod";
import { HugeiconsIcon } from "@hugeicons/react";
import { SparklesIcon, Video01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/primitives/cn";
import { imageTextRegionsSchema } from "@/lib/projects/files/image-text-layers";
import {
  EMPTY_VIDEO_REFINEMENTS,
  MAX_VIDEO_REFINEMENT_LENGTH,
  MAX_VIDEO_TEXT_ELEMENTS,
  videoRefinementInstructions,
  videoTimecode,
  type VideoRefinements,
} from "@/lib/projects/files/video-refinements";
import { ContentEditorVideoInspector } from "./content-editor-video-inspector";
import { videoWorkspaceMessages as messages } from "./content-editor-video-workspace.messages";

const frameResponseSchema = z.object({
  frameText: z.object({ timestamp: z.number().min(0).max(30), regions: imageTextRegionsSchema }),
});
export function videoFrameEndpoint(src: string | null, origin: string): string | null {
  if (!src || !URL.canParse(src, origin)) return null;
  const url = new URL(src, origin);
  return url.origin === origin &&
    /^\/api\/orgs\/[^/]+\/projects\/[^/]+\/assets\/[^/]+$/.test(url.pathname)
    ? `${url.pathname}/frame-text`
    : null;
}

export function ContentEditorVideoWorkspace(props: {
  sourceSrc: string | null;
  targetSrc: string | null;
  sourceLocale: string;
  targetLocale: string;
  sourcePaneVisible: boolean;
  canEdit: boolean;
  isBusy: boolean;
  isLoading: boolean;
  actions: ReactNode;
  onDirtyChange: (dirty: boolean) => void;
  onRegenerate?: (input: { instructions?: string }) => void | Promise<void>;
}) {
  const intl = useIntl();
  const id = useId();
  const sourceRef = useRef<HTMLVideoElement>(null);
  const targetRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const generatingRef = useRef(false);
  const [draft, setDraft] = useState<VideoRefinements>(EMPTY_VIDEO_REFINEMENTS);
  const [applied, setApplied] = useState(JSON.stringify(EMPTY_VIDEO_REFINEMENTS));
  const [view, setView] = useState(props.targetSrc ? "target" : "source");
  const [tab, setTab] = useState("sound");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mediaErrors, setMediaErrors] = useState({ source: false, target: false });
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [loadedSource, setLoadedSource] = useState(false);
  const [observedTarget, setObservedTarget] = useState(props.targetSrc);
  if (observedTarget !== props.targetSrc) {
    setObservedTarget(props.targetSrc);
    setMediaErrors((current) => ({ ...current, target: false }));
    if (props.targetSrc) setView("target");
  }
  const dirty = JSON.stringify(draft) !== applied;
  const busy = props.isBusy || generating || extracting;
  const editable = props.canEdit && Boolean(props.onRegenerate) && !busy;
  const instructions = videoRefinementInstructions(draft);
  const tooLong = instructions.length > MAX_VIDEO_REFINEMENT_LENGTH;
  const displaySource = view === "source" || !props.targetSrc;
  const comparison = props.sourcePaneVisible && Boolean(props.targetSrc);

  useEffect(() => {
    mountedRef.current = true;
    setEndpoint(videoFrameEndpoint(props.sourceSrc, window.location.origin));
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
    };
  }, [props.sourceSrc]);
  useEffect(() => {
    props.onDirtyChange(dirty || generating || extracting || props.isLoading || mediaErrors.target);
    return () => props.onDirtyChange(false);
  }, [dirty, generating, extracting, props.isLoading, mediaErrors.target, props.onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function seek(timestamp: number) {
    const next = Math.max(0, Math.min(duration || timestamp, timestamp));
    setTime(next);
    for (const video of [sourceRef.current, targetRef.current]) {
      if (video && video.readyState >= 1 && Number.isFinite(video.duration)) {
        video.pause();
        video.currentTime = Math.min(next, video.duration);
      }
    }
  }
  function selectElement(elementId: string) {
    setSelectedId(elementId);
    setTab("text");
    const element = draft.elements.find((item) => item.id === elementId);
    if (element) seek(element.timestamp);
  }
  function changeView(value: string) {
    seek(time);
    setView(value);
  }
  function updateTime(video: HTMLVideoElement, role: "source" | "target") {
    if ((displaySource ? "source" : "target") !== role) return;
    setTime(video.currentTime);
    const other = role === "source" ? targetRef.current : sourceRef.current;
    if (
      other &&
      other.readyState >= 1 &&
      Number.isFinite(other.duration) &&
      Math.abs(other.currentTime - video.currentTime) > 0.25
    )
      other.currentTime = Math.min(video.currentTime, other.duration);
  }
  async function extract() {
    const video = sourceRef.current;
    if (
      !endpoint ||
      !video ||
      !editable ||
      requestRef.current ||
      video.readyState < 2 ||
      video.seeking
    )
      return;
    seek(time);
    // Capture the source's actual decoded frame, never a translated preview frame.
    const timestamp = video.currentTime;
    const controller = new AbortController();
    requestRef.current = controller;
    setExtracting(true);
    setError(null);
    setNotice(null);
    try {
      if (video.seeking) {
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            clearTimeout(timeout);
            video.removeEventListener("seeked", done);
            controller.signal.removeEventListener("abort", abort);
          };
          const done = () => {
            cleanup();
            resolve();
          };
          const abort = () => {
            cleanup();
            reject(new Error("aborted"));
          };
          const timeout = setTimeout(abort, 5000);
          video.addEventListener("seeked", done, { once: true });
          controller.signal.addEventListener("abort", abort, { once: true });
        });
      }
      const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext("2d");
      if (!context || !canvas.width || !canvas.height) throw new Error("frame_unavailable");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const response = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timestamp, frame: canvas.toDataURL("image/png") }),
      });
      if (!response.ok) throw new Error("extraction_failed");
      const { frameText } = frameResponseSchema.parse(await response.json());
      if (controller.signal.aborted) return;
      const remaining = MAX_VIDEO_TEXT_ELEMENTS - draft.elements.length;
      const elements = frameText.regions.slice(0, remaining).map((region) => ({
        id: crypto.randomUUID(),
        timestamp: frameText.timestamp,
        text: region.text,
        bounds: region.bounds,
        replacement: "",
        keepOriginal: false,
      }));
      setDraft((current) => ({ ...current, elements: [...current.elements, ...elements] }));
      if (elements[0]) setSelectedId(elements[0].id);
      if (!elements.length) setNotice(intl.formatMessage(messages.noText));
      else if (frameText.regions.length > remaining)
        setNotice(intl.formatMessage(messages.limit, { count: MAX_VIDEO_TEXT_ELEMENTS }));
    } catch {
      if (!controller.signal.aborted) setError(intl.formatMessage(messages.extractError));
    } finally {
      requestRef.current = null;
      if (!controller.signal.aborted) setExtracting(false);
    }
  }
  async function generate() {
    if (!props.onRegenerate || busy || !props.canEdit || tooLong || generatingRef.current) return;
    generatingRef.current = true;
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      await props.onRegenerate({ instructions });
      if (!mountedRef.current) return;
      setApplied(JSON.stringify(draft));
      setView("target");
    } catch {
      if (mountedRef.current) setError(intl.formatMessage(messages.generateError));
    } finally {
      generatingRef.current = false;
      if (mountedRef.current) setGenerating(false);
    }
  }
  function renderVideo(role: "source" | "target") {
    const source = role === "source";
    const src = source ? props.sourceSrc : props.targetSrc;
    const active = source === displaySource;
    if (!source && !src && displaySource) return null;
    return (
      <section
        className={cn(
          "min-w-0 overflow-hidden border border-border/60 bg-card",
          !comparison && !active && "hidden",
        )}
        aria-label={intl.formatMessage(source ? messages.original : messages.translated)}
      >
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-medium text-balance">
            {intl.formatMessage(source ? messages.original : messages.translated)}{" "}
            <span className="text-muted-foreground">
              · {source ? props.sourceLocale : props.targetLocale}
            </span>
          </h2>
          {comparison ? (
            <Button
              size="xs"
              variant={active ? "secondary" : "ghost"}
              aria-pressed={active}
              onClick={() => changeView(role)}
            >
              {intl.formatMessage(source ? messages.listenOriginal : messages.listenTranslation)}
            </Button>
          ) : null}
        </div>
        {!source && props.isLoading ? (
          <Skeleton
            className="aspect-video w-full"
            aria-label={intl.formatMessage(messages.loading)}
          />
        ) : src ? (
          <>
            <video
              ref={source ? sourceRef : targetRef}
              src={src}
              controls
              playsInline
              preload="metadata"
              muted={!active}
              aria-label={intl.formatMessage(source ? messages.original : messages.translated)}
              className="aspect-video max-h-[32rem] w-full bg-muted/50 object-contain"
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                if (source && Number.isFinite(video.duration)) setDuration(video.duration);
                if (Number.isFinite(video.duration))
                  video.currentTime = Math.min(time, video.duration);
              }}
              onLoadedData={() => {
                if (source) setLoadedSource(true);
              }}
              onPlay={() => {
                setView(role);
                (source ? targetRef.current : sourceRef.current)?.pause();
              }}
              onTimeUpdate={(event) => updateTime(event.currentTarget, role)}
              onError={() => {
                setMediaErrors((current) => ({ ...current, [role]: true }));
                if (source) setLoadedSource(false);
              }}
            />
            {mediaErrors[role] ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {intl.formatMessage(messages.mediaError)}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMediaErrors((current) => ({ ...current, [role]: false }));
                      (source ? sourceRef.current : targetRef.current)?.load();
                    }}
                  >
                    {intl.formatMessage(messages.retry)}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
          </>
        ) : (
          <Empty className="aspect-video">
            <EmptyHeader>
              <EmptyTitle>{intl.formatMessage(messages.emptyTarget)}</EmptyTitle>
              <EmptyDescription>{intl.formatMessage(messages.emptyTargetHint)}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-3 sm:p-6">
      <div className="mx-auto flex max-w-[96rem] flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <HugeiconsIcon
              icon={Video01Icon}
              className="size-5 text-muted-foreground"
              aria-hidden
            />
            <div>
              <h2 className="text-base font-semibold text-balance">
                {intl.formatMessage(messages.refine)}
              </h2>
              <p className="text-sm text-muted-foreground">{intl.formatMessage(messages.intro)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {props.actions}
            {props.targetSrc ? (
              <Button variant="outline" size="xs" render={<a href={props.targetSrc} download />}>
                {intl.formatMessage(messages.download)}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Tabs
                value={displaySource ? "source" : "target"}
                onValueChange={(value) => changeView(String(value))}
              >
                <TabsList aria-label={intl.formatMessage(messages.refine)}>
                  <TabsTrigger value="source">{intl.formatMessage(messages.original)}</TabsTrigger>
                  <TabsTrigger value="target" disabled={!props.targetSrc}>
                    {intl.formatMessage(messages.translated)}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Badge variant="secondary">
                {intl.formatMessage(
                  busy
                    ? messages.pending
                    : dirty
                      ? messages.dirty
                      : props.targetSrc
                        ? messages.clean
                        : messages.emptyTarget,
                )}
              </Badge>
            </div>
            <div className={cn("grid gap-3", comparison && "lg:grid-cols-2")}>
              {renderVideo("source")}
              {renderVideo("target")}
            </div>
            <section
              className="flex flex-col gap-4 border border-border/60 bg-card p-4"
              aria-label={intl.formatMessage(messages.timeline)}
            >
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-sm font-medium text-balance">
                  {intl.formatMessage(messages.timeline)}
                </h3>
                <output
                  className="text-xs text-muted-foreground tabular-nums"
                  htmlFor={`${id}-seek`}
                >
                  {videoTimecode(time)} / {videoTimecode(duration)}
                </output>
              </div>
              <input
                id={`${id}-seek`}
                type="range"
                min={0}
                max={duration || 1}
                step={0.1}
                value={Math.min(time, duration || 1)}
                disabled={!duration || extracting}
                onChange={(event) => seek(Number(event.target.value))}
                aria-label={intl.formatMessage(messages.seek)}
                aria-valuetext={videoTimecode(time)}
                className="h-5 w-full accent-primary"
              />
              <Separator />
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-2 text-xs text-muted-foreground">
                  {intl.formatMessage(messages.text)}
                </span>
                {draft.elements.length ? (
                  draft.elements.map((element, index) => (
                    <Button
                      key={element.id}
                      size="xs"
                      variant={selectedId === element.id ? "secondary" : "outline"}
                      onClick={() => selectElement(element.id)}
                      aria-label={`${intl.formatMessage(messages.element, { index: index + 1 })}, ${intl.formatMessage(messages.at, { time: videoTimecode(element.timestamp) })}`}
                    >
                      <span className="tabular-nums">{videoTimecode(element.timestamp)}</span>
                      <span className="max-w-32 truncate">
                        {element.text || intl.formatMessage(messages.element, { index: index + 1 })}
                      </span>
                    </Button>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {intl.formatMessage(messages.emptyText)}
                  </span>
                )}
              </div>
              <p className="text-pretty text-xs text-muted-foreground">
                {intl.formatMessage(messages.timelineHint)}
              </p>
            </section>
            <p className="text-pretty text-xs text-muted-foreground">
              {intl.formatMessage(messages.listenHint)}
            </p>
          </div>
          <aside className="flex min-w-0 flex-col border border-border/60 bg-card xl:sticky xl:top-0 xl:max-h-[calc(100dvh-14rem)]">
            <ContentEditorVideoInspector
              draft={draft}
              onChange={setDraft}
              selectedId={selectedId}
              onSelect={selectElement}
              onExtract={() => void extract()}
              canExtract={Boolean(endpoint)}
              frameReady={loadedSource && !mediaErrors.source}
              extracting={extracting}
              canEdit={editable}
              targetLocale={props.targetLocale}
              timestamp={time}
              tab={tab}
              onTabChange={setTab}
            />
            <Separator />
            <div className="flex flex-col gap-3 p-5">
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              {notice ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {notice}
                </p>
              ) : null}
              {tooLong ? (
                <Alert variant="destructive">
                  <AlertDescription>{intl.formatMessage(messages.length)}</AlertDescription>
                </Alert>
              ) : null}
              {props.onRegenerate ? (
                <Button
                  disabled={!editable || !props.sourceSrc || props.isLoading || tooLong}
                  onClick={() => void generate()}
                >
                  {generating || props.isBusy ? (
                    <Spinner />
                  ) : (
                    <HugeiconsIcon icon={SparklesIcon} data-icon="inline-start" aria-hidden />
                  )}
                  {intl.formatMessage(
                    generating || props.isBusy
                      ? messages.generating
                      : props.targetSrc
                        ? messages.regenerate
                        : messages.generate,
                  )}
                </Button>
              ) : null}
              <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
                {intl.formatMessage(
                  !props.canEdit
                    ? messages.readOnly
                    : !props.onRegenerate
                      ? messages.unavailable
                      : dirty
                        ? messages.draftHint
                        : messages.generateHint,
                )}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
