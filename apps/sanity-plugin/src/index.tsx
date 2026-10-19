import {definePlugin} from 'sanity'

import type {HyperlocalisePluginOptions} from './plugin-options'
import {hyperlocaliseTool} from './tool'

export type {HyperlocalisePluginOptions}

export const hyperlocalise = definePlugin<HyperlocalisePluginOptions | void>((config = {}) => {
  const pluginOptions: HyperlocalisePluginOptions = config ?? {}
  return {
    name: 'sanity-plugin-hyperlocalise',
    tools: [hyperlocaliseTool(pluginOptions)],
  }
})
