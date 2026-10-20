import {definePlugin} from 'sanity'

import {hyperlocaliseDocumentInspector} from './document-inspector'
import type {HyperlocalisePluginOptions} from './plugin-options'

export const hyperlocalise = definePlugin<HyperlocalisePluginOptions | void>((config = {}) => {
  const pluginOptions: HyperlocalisePluginOptions = config ?? {}
  return {
    name: 'sanity-plugin-hyperlocalise',
    document: {
      inspectors: (prev) => [...prev, hyperlocaliseDocumentInspector(pluginOptions)],
    },
  }
})
