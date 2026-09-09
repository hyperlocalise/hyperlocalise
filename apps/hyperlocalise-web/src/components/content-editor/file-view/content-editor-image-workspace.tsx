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
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ImageCanvas } from "./content-editor-image-canvas";
import { ContentEditorFileGenerateDialog } from "./content-editor-file-generate-dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useIntl } from "react-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/primitives/cn";
import {
  imageTextLayersSchema,
  type ImageTextLayers,
  type ImageTextRegion,
} from "@/lib/projects/files/image-text-layers";
import { imageViewerMessages as messages } from "./content-editor-image-viewer.messages";

type ImageWorkspaceProps = {
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
};

export function imageTextLayersEndpoint(src: string | null): string | null {
  if (!src || !URL.canParse(src, window.location.origin)) return null;
  const url = new URL(src, window.location.origin);
  if (
    url.origin !== window.location.origin ||
    !/^\/api\/orgs\/[^/]+\/projects\/[^/]+\/assets\/[^/]+$/.test(url.pathname)
  )
    return null;
  return `${url.pathname}/text-layers`;
}

export function ContentEditorImageWorkspace(props: ImageWorkspaceProps) {
  const intl = useIntl();
  const reduceMotion = useReducedMotion();
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const mutationRef = useRef<AbortController | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewOutdated, setPreviewOutdated] = useState(false);
  const [observedTarget, setObservedTarget] = useState(props.targetSrc);

  const [layers, setLayers] = useState<ImageTextLayers | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "extracting" | "saving">("loading");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reload, setReload] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [reveal, setReveal] = useState(50);
  const [wipe, setWipe] = useState(false);
  const [showRegions, setShowRegions] = useState(true);
  const [view, setView] = useState<"source" | "target">("target");
  if (observedTarget !== props.targetSrc) {
    setObservedTarget(props.targetSrc);
    setView("target");
    setPreviewOutdated(false);
  }
  // URL parsing occurs in an effect so server rendering never reads window.
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const selected = layers?.regions.find((region) => region.id === selectedId) ?? layers?.regions[0];
  const busy = props.isBusy || generating || status !== "idle";
  const transition = { duration: reduceMotion ? 0 : 0.2, ease: "easeOut" as const };
  useEffect(() => {
    const controller = new AbortController();
    props.onDirtyChange(false);
    const path = imageTextLayersEndpoint(props.sourceSrc);
    setEndpoint(path);
    if (!path) {
      setStatus("idle");
      return () => {
        controller.abort();
        mutationRef.current?.abort();
      };
    }
    setStatus("loading");
    setError(null);
    void fetch(path, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("load");
        const body = await response.json();
        const next = body.textLayers === null ? null : imageTextLayersSchema.parse(body.textLayers);
        if (!controller.signal.aborted) {
          setLayers(next);
          setSelectedId(next?.regions[0]?.id ?? null);
          setDirty(false);
          setConflict(false);
          props.onDirtyChange(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(intl.formatMessage(messages.loadError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setStatus("idle");
      });
    return () => {
      controller.abort();
      mutationRef.current?.abort();
    };
  }, [props.sourceSrc, props.onDirtyChange, reload, intl]);

  async function persist(method: "POST" | "PATCH") {
    if (!endpoint) return false;
    const controller = new AbortController();
    mutationRef.current = controller;
    setStatus(method === "POST" ? "extracting" : "saving");
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(endpoint, {
        method,
        signal: controller.signal,
        ...(method === "PATCH"
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(layers) }
          : {}),
      });
      if (response.status === 409) {
        setConflict(true);
        throw new Error("conflict");
      }
      if (!response.ok) throw new Error("request");
      const body = await response.json();
      const next = imageTextLayersSchema.parse(body.textLayers);
      if (controller.signal.aborted) return false;
      setLayers(next);
      setSelectedId((current) =>
        next.regions.some((region) => region.id === current)
          ? current
          : (next.regions[0]?.id ?? null),
      );
      setDirty(false);
      props.onDirtyChange(Boolean(props.targetSrc));
      setPreviewOutdated(Boolean(props.targetSrc));
      setSaved(true);
      return true;
    } catch (cause) {
      if (controller.signal.aborted) return false;
      setError(
        intl.formatMessage(
          cause instanceof Error && cause.message === "conflict"
            ? messages.conflict
            : method === "POST"
              ? messages.extractError
              : messages.saveError,
        ),
      );
      return false;
    } finally {
      if (!controller.signal.aborted) setStatus("idle");
    }
  }

  async function generate(instructions: string) {
    if (!props.onRegenerate) return;
    if (dirty && !(await persist("PATCH"))) throw new Error("save_failed");
    setGenerating(true);
    try {
      await props.onRegenerate({ instructions: instructions || undefined });
      if (!mountedRef.current) return;
      setPreviewOutdated(false);
      props.onDirtyChange(false);
      setView("target");
      setGenerateOpen(false);
    } finally {
      if (mountedRef.current) setGenerating(false);
    }
  }

  function editRegion(update: Partial<ImageTextRegion>) {
    if (!selected || !layers) return;
    setLayers({
      ...layers,
      regions: layers.regions.map((region) =>
        region.id === selected.id ? { ...region, ...update } : region,
      ),
    });
    setDirty(true);
    setSaved(false);
    props.onDirtyChange(true);
  }
  function editTranslation(field: "text" | "instructions", value: string) {
    if (!selected) return;
    editRegion({
      translations: {
        ...selected.translations,
        [props.targetLocale]: {
          ...(selected.translations[props.targetLocale] ?? { text: "", instructions: "" }),
          [field]: value,
        },
      },
    });
  }
  const originalLabel = intl.formatMessage(messages.original, {
    locale: props.sourceLocale,
  });
  const translatedLabel = intl.formatMessage(messages.translated, {
    locale: props.targetLocale,
  });
  const displaySource = view === "source" || (!props.targetSrc && !props.sourcePaneVisible);
  const mainSrc = displaySource ? props.sourceSrc : props.targetSrc;
  const canvasProps = {
    regions: layers?.regions ?? [],
    selectedId: selected?.id ?? null,
    onSelect: (id: string) => {
      setSelectedId(id);
      if (!props.sourcePaneVisible && !wipe) setView("source");
    },
    zoom,
    reveal,
    showRegions,
    onRevealChange: setReveal,
  };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-3 sm:p-6">
      <div className="mx-auto flex max-w-[96rem] flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="xs"
              variant="outline"
              aria-pressed={displaySource}
              onClick={() => {
                setView("source");
                setWipe(false);
              }}
            >
              {intl.formatMessage(messages.sourceView)}
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={!props.targetSrc}
              aria-pressed={!displaySource}
              onClick={() => setView("target")}
            >
              {intl.formatMessage(messages.targetView)}
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={!props.targetSrc || !props.sourceSrc}
              aria-pressed={wipe}
              onClick={() => {
                setWipe(!wipe);
                setView("target");
              }}
            >
              {intl.formatMessage(messages.wipe)}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              aria-pressed={showRegions}
              onClick={() => setShowRegions(!showRegions)}
            >
              {intl.formatMessage(showRegions ? messages.hideLayers : messages.showLayers)}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              {intl.formatMessage(messages.zoom)}
              <input
                aria-label={intl.formatMessage(messages.zoom)}
                type="range"
                min={50}
                max={200}
                step={10}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                className="w-24 accent-primary"
              />
              <span className="w-9 tabular-nums">{zoom}%</span>
            </label>
            <Button size="xs" variant="ghost" onClick={() => setZoom(100)}>
              {intl.formatMessage(messages.fit)}
            </Button>
          </div>
        </div>
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div
            className={cn(
              "relative grid min-w-0 items-start gap-4",
              props.sourcePaneVisible && !wipe && "lg:grid-cols-2",
            )}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {props.sourcePaneVisible && !wipe && props.sourceSrc ? (
                <motion.section
                  key="source"
                  layout={reduceMotion ? false : "position"}
                  initial={{ opacity: reduceMotion ? 1 : 0, x: reduceMotion ? 0 : -24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: reduceMotion ? 0 : -24 }}
                  transition={transition}
                  className="min-w-0 border border-border/60 bg-card shadow-sm"
                  aria-label={intl.formatMessage(messages.sourceAlt)}
                >
                  <h2 className="border-b px-4 py-3 text-sm font-medium">{originalLabel}</h2>
                  <ImageCanvas
                    key={props.sourceSrc}
                    {...canvasProps}
                    src={props.sourceSrc}
                    label={intl.formatMessage(messages.sourceAlt)}
                  />
                </motion.section>
              ) : null}
              <motion.section
                key="target"
                layout={reduceMotion ? false : "position"}
                transition={transition}
                className="min-w-0 border border-border/60 bg-card shadow-sm"
                aria-label={intl.formatMessage(
                  displaySource ? messages.sourceAlt : messages.targetAlt,
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                  <h2 className="text-sm font-medium">
                    {wipe
                      ? `${originalLabel} / ${translatedLabel}`
                      : displaySource
                        ? originalLabel
                        : translatedLabel}
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {props.actions}
                    {props.onRegenerate ? (
                      <Button
                        size="xs"
                        variant={props.targetSrc ? "outline" : "default"}
                        disabled={!props.canEdit || !props.sourceSrc || busy || conflict}
                        onClick={() => setGenerateOpen(true)}
                      >
                        {generating || props.isBusy ? <Spinner /> : null}
                        {intl.formatMessage(
                          generating || props.isBusy
                            ? messages.localising
                            : dirty
                              ? props.targetSrc
                                ? messages.saveRegenerate
                                : messages.saveLocalise
                              : props.targetSrc
                                ? messages.regenerate
                                : messages.localise,
                        )}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {props.isLoading ? (
                  <div className="flex min-h-72 items-center justify-center">
                    <Spinner />
                  </div>
                ) : mainSrc ? (
                  <ImageCanvas
                    key={`${mainSrc}:${wipe}`}
                    {...canvasProps}
                    src={wipe && props.sourceSrc ? props.sourceSrc : mainSrc}
                    compareSrc={wipe ? props.targetSrc : null}
                    showRegions={showRegions && (displaySource || wipe)}
                    label={intl.formatMessage(
                      displaySource ? messages.sourceAlt : messages.targetAlt,
                    )}
                  />
                ) : (
                  <p className="p-6 text-sm text-muted-foreground">
                    {intl.formatMessage(messages.emptyTarget)}
                  </p>
                )}
                {wipe ? (
                  <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                    {intl.formatMessage(messages.dividerHint)}
                  </p>
                ) : null}
                {previewOutdated ? (
                  <p role="status" className="border-t p-4 text-sm text-muted-foreground">
                    {intl.formatMessage(messages.previewOutdated)}
                  </p>
                ) : null}
                {!props.targetSrc ? (
                  <p className="border-t p-4 text-sm text-muted-foreground">
                    {intl.formatMessage(messages.noTarget)}
                  </p>
                ) : null}
              </motion.section>
            </AnimatePresence>
          </div>
          <aside
            className="min-w-0 border border-border/60 bg-card shadow-sm"
            aria-label={intl.formatMessage(messages.layers)}
          >
            <div className="flex items-center justify-between gap-2 border-b p-4">
              <h2 className="text-sm font-medium">
                {intl.formatMessage(messages.layers)}
                {layers ? (
                  <span className="ml-2 text-muted-foreground tabular-nums">
                    {layers.regions.length}
                  </span>
                ) : null}
              </h2>
              {layers ? (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!dirty || busy || !props.canEdit || conflict}
                  onClick={() => void persist("PATCH")}
                >
                  {intl.formatMessage(status === "saving" ? messages.saving : messages.save)}
                </Button>
              ) : null}
            </div>
            <div className="flex flex-col gap-4 p-4">
              {status === "loading" ? (
                <Spinner />
              ) : !layers ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    {intl.formatMessage(endpoint ? messages.intro : messages.external)}
                  </p>
                  <Button
                    size="sm"
                    disabled={!endpoint || !props.canEdit || busy || Boolean(error)}
                    onClick={() => void persist("POST")}
                  >
                    {status === "extracting" ? <Spinner /> : null}
                    {intl.formatMessage(
                      status === "extracting" ? messages.extracting : messages.extract,
                    )}
                  </Button>
                </>
              ) : layers.regions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {intl.formatMessage(messages.empty)}
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {intl.formatMessage(messages.inferred)}
                  </p>
                  <div className="flex max-h-44 flex-col gap-1 overflow-y-auto">
                    {layers.regions.map((region, index) => (
                      <Button
                        key={region.id}
                        size="sm"
                        variant={region.id === selected?.id ? "secondary" : "ghost"}
                        className="justify-start"
                        aria-pressed={region.id === selected?.id}
                        onClick={() => canvasProps.onSelect(region.id)}
                      >
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {index + 1}
                        </span>
                        <span className="truncate">
                          {region.text || intl.formatMessage(messages.region, { index: index + 1 })}
                        </span>
                      </Button>
                    ))}
                  </div>
                  {selected ? (
                    <>
                      <label className="flex flex-col gap-2 text-xs font-medium">
                        {intl.formatMessage(messages.sourceText)}
                        <Textarea
                          value={selected.text}
                          maxLength={4000}
                          disabled={!props.canEdit || busy}
                          onChange={(event) => editRegion({ text: event.target.value })}
                          className="min-h-20 text-sm"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-xs font-medium">
                        {intl.formatMessage(messages.replacement, { locale: props.targetLocale })}
                        <Textarea
                          value={selected.translations[props.targetLocale]?.text ?? ""}
                          maxLength={4000}
                          disabled={!props.canEdit || busy}
                          placeholder={intl.formatMessage(messages.replacementHint)}
                          onChange={(event) => editTranslation("text", event.target.value)}
                          className="min-h-20 text-sm"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-xs font-medium">
                        {intl.formatMessage(messages.instructions, { locale: props.targetLocale })}
                        <Textarea
                          value={selected.translations[props.targetLocale]?.instructions ?? ""}
                          maxLength={2000}
                          disabled={!props.canEdit || busy}
                          placeholder={intl.formatMessage(messages.instructionsHint)}
                          onChange={(event) => editTranslation("instructions", event.target.value)}
                          className="min-h-20 text-sm"
                        />
                      </label>
                    </>
                  ) : null}
                </>
              )}
              {error ? (
                <div className="flex flex-col gap-2">
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      if (conflict || !layers) setReload((value) => value + 1);
                      else void persist("PATCH");
                    }}
                  >
                    {intl.formatMessage(conflict ? messages.reload : messages.retry)}
                  </Button>
                </div>
              ) : null}
              {dirty ? (
                <p role="status" className="text-xs text-muted-foreground">
                  {intl.formatMessage(messages.unsaved)}
                </p>
              ) : saved ? (
                <p role="status" className="text-xs text-muted-foreground">
                  {intl.formatMessage(messages.saved)}
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
      {props.onRegenerate ? (
        <ContentEditorFileGenerateDialog
          open={generateOpen}
          onOpenChange={setGenerateOpen}
          mode={props.targetSrc ? "regenerate" : "generate"}
          viewerId="image"
          isSubmitting={generating || props.isBusy || status === "saving"}
          onSubmit={generate}
          imageContext={{
            targetLocale: props.targetLocale,
            layerCount: layers?.regions.length ?? 0,
            hasUnsavedLayers: dirty,
          }}
        />
      ) : null}
    </div>
  );
}
