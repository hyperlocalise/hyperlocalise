import {EarthGlobeIcon} from '@sanity/icons'
import type {DocumentInspector} from 'sanity'

import {HyperlocaliseTool} from './app'
import type {HyperlocalisePluginOptions} from './plugin-options'

export function hyperlocaliseDocumentInspector(
  pluginOptions: HyperlocalisePluginOptions,
): DocumentInspector {
  return {
    name: 'hyperlocalise',
    title: 'Hyperlocalise',
    icon: EarthGlobeIcon,
    component: (props) => (
      <HyperlocaliseTool
        pluginOptions={pluginOptions}
        documentId={props.documentId}
        documentType={props.schemaType.name}
      />
    ),
  }
}
