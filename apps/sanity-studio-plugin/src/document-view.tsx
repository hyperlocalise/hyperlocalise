import { TranslateIcon } from "@sanity/icons/Translate";
import type { ComponentViewBuilder, StructureBuilder } from "sanity/structure";

import { HyperlocaliseDocumentWorkflow } from "./app";
import { parsePluginConfig, type HyperlocalisePluginConfig } from "./config";
import { ConfigErrorCard } from "./config-error";
import { isRecord } from "./json";

type DocumentViewProps = {
  documentId: string;
  schemaType: { name: string };
  document?: { displayed?: Record<string, unknown> };
  options?: unknown;
};

function readDisplayedDocument(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }
  if (isRecord(value.displayed)) {
    return value.displayed;
  }
  return value;
}

function HyperlocaliseDocumentView(props: DocumentViewProps) {
  const parsed = parsePluginConfig(props.options);
  if (!parsed.ok) {
    return <ConfigErrorCard message={parsed.error} />;
  }
  return (
    <HyperlocaliseDocumentWorkflow
      pluginOptions={parsed.data}
      documentId={props.documentId}
      documentType={props.schemaType.name}
      document={readDisplayedDocument(props.document)}
    />
  );
}

export function hyperlocalisePlugin(
  S: StructureBuilder,
  config: HyperlocalisePluginConfig | unknown,
): ComponentViewBuilder {
  return S.view
    .component(HyperlocaliseDocumentView)
    .id("hyperlocalise")
    .title("Hyperlocalise")
    .icon(TranslateIcon)
    .options(config);
}
