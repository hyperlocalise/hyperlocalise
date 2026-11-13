import {
  Bold,
  Button,
  Columns,
  Divider,
  Link,
  Muted,
  Text,
  Textbox,
  VerticalSpace,
} from "@create-figma-plugin/ui";
import { useEffect, useState } from "preact/hooks";

import {
  figmaDesignUrl,
  matchSummaryMessage,
  parseFigmaFileLink,
  planKeyLinks,
  previewSummaryMessage,
  type DesignTextNode,
  type FigmaDesignKey,
  type TextFitIssue,
} from "./design-context";
import { FormField } from "./form-field";
import {
  fetchFigmaKeyTranslations,
  matchFigmaKeys,
  searchFigmaKeys,
  syncFigmaFrameVisualContext,
  type FigmaResourceAuth,
  type FigmaSessionProject,
} from "./hyperlocalise-client";
import { localeLabel } from "./locale-label";
import { requestFromSandbox } from "./sandbox-request";
import type { StepProgress } from "./workflow-ui";

type ToastTone = "positive" | "warn" | "critical";

export type DesignContextPanelProps = {
  appUrl: string;
  auth: FigmaResourceAuth;
  project: FigmaSessionProject;
  pageId: string;
  fileName: string;
  locale: string;
  disabled: boolean;
  /** Runs work under the app's shared busy state, token refresh and error toasts. */
  run: (work: () => Promise<void>) => Promise<void>;
  showToast: (message: string, tone?: ToastTone) => void;
};

function preventLinkNavigation(event: Event) {
  event.preventDefault();
}

/**
 * Links Figma text to the project's existing keys, syncs frames to the CAT editor as
 * visual context, and previews translations in the design to check length and layout.
 */
export function DesignContextPanel(props: DesignContextPanelProps) {
  const { appUrl, auth, project, pageId, fileName, locale, disabled, run, showToast } = props;
  const [fileLinkDraft, setFileLinkDraft] = useState("");
  const [figmaFileKey, setFigmaFileKey] = useState<string | null>(null);
  const [progress, setProgress] = useState<StepProgress | null>(null);
  const [issues, setIssues] = useState<TextFitIssue[]>([]);
  /** Survives a plugin reopen, so Restore stays reachable for an earlier preview. */
  const [previewing, setPreviewing] = useState(false);
  const [linking, setLinking] = useState<DesignTextNode | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FigmaDesignKey[]>([]);

  useEffect(() => {
    let cancelled = false;
    void requestFromSandbox({ type: "design-scan", pageId, selectionOnly: true }, "design-scanned")
      .then((scan) => {
        if (cancelled) {
          return;
        }
        setFigmaFileKey(scan.figmaFileKey);
        setFileLinkDraft(scan.fileLink ?? "");
        setPreviewing(scan.previewing > 0);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  useEffect(() => {
    setIssues([]);
    setLinking(null);
  }, [pageId, project.id]);

  const resolveFileKey = async () => {
    if (figmaFileKey) {
      return figmaFileKey;
    }
    const parsed = parseFigmaFileLink(fileLinkDraft);
    if (!parsed) {
      throw new Error("Paste this file's Figma link first (Share → Copy link).");
    }
    await requestFromSandbox(
      { type: "design-file-link-set", url: fileLinkDraft.trim() },
      "design-file-link-saved",
    );
    return parsed;
  };

  const handleMatch = () =>
    run(async () => {
      setProgress({ label: "Reading text layers…", value: 15 });
      try {
        const scan = await requestFromSandbox(
          { type: "design-scan", pageId, selectionOnly: true },
          "design-scanned",
        );
        if (scan.nodes.length === 0) {
          throw new Error("No text layers on this page.");
        }
        setProgress({ label: "Matching layers to project keys…", value: 45 });
        const unlinked = scan.nodes.filter((node) => !node.link);
        const matches =
          unlinked.length > 0
            ? await matchFigmaKeys({
                appUrl,
                auth,
                projectId: project.id,
                texts: unlinked.map((node) => ({
                  nodeId: node.nodeId,
                  text: node.text,
                  layerName: node.layerName,
                })),
              })
            : [];
        const plan = planKeyLinks(scan.nodes, matches);
        if (plan.links.length > 0) {
          setProgress({ label: "Linking layers…", value: 85 });
          await requestFromSandbox({ type: "design-link", links: plan.links }, "design-linked");
        }
        const tone = plan.summary.ambiguous + plan.summary.unmatched > 0 ? "warn" : "positive";
        showToast(matchSummaryMessage(plan.summary), tone);
      } finally {
        setProgress(null);
      }
    });

  const handleSync = () =>
    run(async () => {
      setProgress({ label: "Finding frames with linked layers…", value: 5 });
      try {
        const fileKey = await resolveFileKey();
        const {
          frames,
          unframed,
          previewing: previewed,
        } = await requestFromSandbox({ type: "design-frames", pageId }, "design-frames-read");
        if (previewed > 0) {
          setPreviewing(true);
          throw new Error("Restore source before syncing, so the editor shows the source design.");
        }
        if (frames.length === 0) {
          throw new Error(
            unframed > 0
              ? "Linked layers must sit inside a frame to sync."
              : "No linked layers on this page. Run Match keys first.",
          );
        }
        let keyCount = 0;
        let skippedKeys = 0;
        for (const [index, frame] of frames.entries()) {
          const value = 10 + Math.round((index / frames.length) * 85);
          setProgress({ label: `Syncing “${frame.name}” (${index + 1}/${frames.length})…`, value });
          const exported = await requestFromSandbox(
            { type: "design-export-frame", frame },
            "design-frame-exported",
          );
          const result = await syncFigmaFrameVisualContext({
            appUrl,
            auth,
            projectId: project.id,
            fileKey,
            figmaUrl: figmaDesignUrl(fileKey, fileName, frame.nodeId),
            frame: exported.frame,
          });
          keyCount += result.boundCount;
          skippedKeys += result.skippedCount ?? 0;
        }
        const frameWord = frames.length === 1 ? "frame" : "frames";
        const skipped =
          unframed > 0 ? ` ${unframed} linked layers outside frames were skipped.` : "";
        const stale =
          skippedKeys > 0
            ? ` ${skippedKeys} linked ${skippedKeys === 1 ? "key is" : "keys are"} no longer in ${project.name}; run Match keys or relink those layers.`
            : "";
        showToast(
          `Synced ${frames.length} ${frameWord} for ${keyCount} keys. Linguists now see them in the editor.${skipped}${stale}`,
          unframed > 0 || skippedKeys > 0 ? "warn" : "positive",
        );
      } finally {
        setProgress(null);
      }
    });

  const handlePreview = () =>
    run(async () => {
      if (!locale) {
        throw new Error("Choose a language to preview.");
      }
      setProgress({ label: "Loading translations…", value: 20 });
      try {
        const scan = await requestFromSandbox(
          { type: "design-scan", pageId, selectionOnly: false },
          "design-scanned",
        );
        const keyIds = [
          ...new Set(scan.nodes.flatMap((node) => (node.link ? [node.link.id] : []))),
        ];
        if (keyIds.length === 0) {
          throw new Error("No linked layers on this page. Run Match keys first.");
        }
        const translations = await fetchFigmaKeyTranslations({
          appUrl,
          auth,
          projectId: project.id,
          locale,
          keyIds,
        });
        setProgress({ label: "Writing the preview…", value: 70 });
        const result = await requestFromSandbox(
          {
            type: "design-preview",
            pageId,
            translations: translations.map((entry) => ({ keyId: entry.keyId, text: entry.text })),
          },
          "design-previewed",
        );
        setIssues(result.issues);
        setPreviewing(true);
        const summary = previewSummaryMessage({
          localeLabel: localeLabel(locale),
          applied: result.applied,
          missing: result.missing,
          issues: result.issues,
        });
        showToast(summary.message, summary.tone);
      } finally {
        setProgress(null);
      }
    });

  const handleRestore = () =>
    run(async () => {
      const result = await requestFromSandbox(
        { type: "design-restore", pageId },
        "design-restored",
      );
      setIssues([]);
      setPreviewing(false);
      showToast(`Restored ${result.count} layers to their original text.`);
    });

  const handleSelectIssues = () =>
    run(async () => {
      await requestFromSandbox(
        { type: "design-select-nodes", nodeIds: issues.map((issue) => issue.nodeId) },
        "design-nodes-selected",
      );
    });

  const handleStartLinking = () =>
    run(async () => {
      const { nodes: selection } = await requestFromSandbox(
        { type: "design-selection", pageId },
        "design-selection-read",
      );
      if (selection.length !== 1) {
        throw new Error("Select one text layer to link.");
      }
      const node = selection[0]!;
      setLinking(node);
      setQuery(node.text.slice(0, 80));
      setResults([]);
    });

  const handleSearch = () =>
    run(async () => {
      const trimmed = query.trim();
      if (!trimmed) {
        return;
      }
      const keys = await searchFigmaKeys({ appUrl, auth, projectId: project.id, query: trimmed });
      setResults(keys);
      if (keys.length === 0) {
        showToast("No keys match that search.", "warn");
      }
    });

  const linkTo = (key: FigmaDesignKey | null) =>
    run(async () => {
      if (!linking) {
        return;
      }
      await requestFromSandbox(
        {
          type: "design-link",
          links: [
            {
              nodeId: linking.nodeId,
              link: key
                ? {
                    id: key.id,
                    key: key.key,
                    sourcePath: key.sourcePath,
                    maxLength: key.maxLength,
                  }
                : null,
            },
          ],
        },
        "design-linked",
      );
      showToast(key ? `Linked to ${key.key}.` : "Layer unlinked.");
      setLinking(null);
      setResults([]);
    });

  const overflowCount = issues.filter((issue) => issue.overflow).length;
  const overLimitCount = issues.filter((issue) => issue.overLimit).length;

  return (
    <div className="designContext">
      <VerticalSpace space="medium" />
      <Divider />
      <VerticalSpace space="medium" />
      <Text>
        <Bold>Design context</Bold>
      </Text>
      <VerticalSpace space="extraSmall" />
      <Text>
        <Muted>
          Link layers to {project.name} keys. Synced frames show in the editor beside each key.
        </Muted>
      </Text>
      {figmaFileKey ? null : (
        <>
          <VerticalSpace space="small" />
          <FormField label="Figma file link" hint="Share → Copy link. Saved with this file.">
            <Textbox
              spellCheck={false}
              value={fileLinkDraft}
              onValueInput={setFileLinkDraft}
              disabled={disabled}
              placeholder="https://www.figma.com/design/…"
            />
          </FormField>
        </>
      )}
      <VerticalSpace space="small" />
      <Columns space="extraSmall">
        <Button fullWidth secondary disabled={disabled} onClick={() => void handleMatch()}>
          Match keys
        </Button>
        <Button fullWidth secondary disabled={disabled} onClick={() => void handleSync()}>
          Sync to editor
        </Button>
      </Columns>
      <VerticalSpace space="extraSmall" />
      <Columns space="extraSmall">
        <Button
          fullWidth
          secondary
          disabled={disabled || !locale}
          onClick={() => void handlePreview()}
        >
          {locale ? `Preview ${localeLabel(locale)}` : "Preview"}
        </Button>
        <Button
          fullWidth
          secondary
          disabled={disabled || !previewing}
          onClick={() => void handleRestore()}
        >
          Restore source
        </Button>
      </Columns>
      {progress ? (
        <div className="stepProgress">
          <Text>
            <Muted>{progress.label}</Muted>
          </Text>
          <progress className="progressBar" max={100} value={progress.value} />
        </div>
      ) : null}
      {issues.length > 0 ? (
        <div className="fieldDescription">
          <Text>
            <Muted>
              {overflowCount > 0 ? `${overflowCount} overflow. ` : ""}
              {overLimitCount > 0 ? `${overLimitCount} over the character limit. ` : ""}
            </Muted>
            <Link
              href="#"
              onClick={(event: Event) => {
                preventLinkNavigation(event);
                if (!disabled) {
                  void handleSelectIssues();
                }
              }}
            >
              Select layers
            </Link>
          </Text>
        </div>
      ) : null}
      <VerticalSpace space="small" />
      {linking ? (
        <div className="designLinker">
          <Text>
            <Muted>Link “{linking.text.slice(0, 60)}”</Muted>
            {linking.link ? <Muted> (now {linking.link.key})</Muted> : null}
          </Text>
          <VerticalSpace space="extraSmall" />
          <div className="pageFieldRow">
            <div className="pageFieldSelect">
              <Textbox
                spellCheck={false}
                value={query}
                onValueInput={setQuery}
                disabled={disabled}
                placeholder="Search key or source text"
              />
            </div>
            <Button secondary disabled={disabled} onClick={() => void handleSearch()}>
              Search
            </Button>
          </div>
          {results.length > 0 ? (
            <ul className="designKeyResults">
              {results.map((key) => (
                <li key={key.id}>
                  <button
                    type="button"
                    className="designKeyResult"
                    disabled={disabled}
                    onClick={() => void linkTo(key)}
                  >
                    <span className="designKeyName">{key.key}</span>
                    <span className="designKeySource">{key.sourceText}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <VerticalSpace space="extraSmall" />
          <Text>
            {linking.link ? (
              <>
                <Link
                  href="#"
                  onClick={(event: Event) => {
                    preventLinkNavigation(event);
                    if (!disabled) {
                      void linkTo(null);
                    }
                  }}
                >
                  Unlink
                </Link>
                {" · "}
              </>
            ) : null}
            <Link
              href="#"
              onClick={(event: Event) => {
                preventLinkNavigation(event);
                setLinking(null);
                setResults([]);
              }}
            >
              Cancel
            </Link>
          </Text>
        </div>
      ) : (
        <Text>
          <Link
            href="#"
            onClick={(event: Event) => {
              preventLinkNavigation(event);
              if (!disabled) {
                void handleStartLinking();
              }
            }}
          >
            Link selected layer to a key…
          </Link>
        </Text>
      )}
    </div>
  );
}
