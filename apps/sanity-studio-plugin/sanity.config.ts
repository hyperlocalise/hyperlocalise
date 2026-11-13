import { documentInternationalization } from "@sanity/document-internationalization";
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { internationalizedArray } from "sanity-plugin-internationalized-array";

import { hyperlocalisePlugin, hyperlocaliseTool } from "./src";
import { documentLevelTypes, fieldLevelTypes, languages } from "./dev-studio/languages";
import { schemaTypes } from "./dev-studio/schema";

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || "placeholder";
const dataset = process.env.SANITY_STUDIO_DATASET || "production";

const pluginConfig = {
  supportedLanguages: languages,
  documentLocalizationSchemaTypes: documentLevelTypes,
  fieldLocalizationSchemaTypes: fieldLevelTypes,
  customBlockTypes: ["myblock"],
};

export default defineConfig({
  name: "hyperlocalise-dev",
  title: "Hyperlocalise plugin dev studio",
  projectId,
  dataset,
  plugins: [
    structureTool({
      defaultDocumentNode: (S, { schemaType }) => {
        if ([...documentLevelTypes, ...fieldLevelTypes].includes(schemaType)) {
          return S.document().views([S.view.form(), hyperlocalisePlugin(S, pluginConfig)]);
        }
        return S.document();
      },
    }),
    documentInternationalization({
      supportedLanguages: languages,
      schemaTypes: documentLevelTypes,
      weakReferences: true,
    }),
    internationalizedArray({
      languages,
      fieldTypes: ["string", "text"],
    }),
  ],
  tools: [
    hyperlocaliseTool({
      supportedLanguages: languages,
      schemaTypes: documentLevelTypes,
      customBlockTypes: ["myblock"],
    }),
  ],
  schema: {
    types: schemaTypes,
  },
});
