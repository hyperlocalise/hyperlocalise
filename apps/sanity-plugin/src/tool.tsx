import { EarthGlobeIcon } from "@sanity/icons/EarthGlobe";

import { HyperlocaliseTool } from "./app";
import type { HyperlocalisePluginOptions } from "./plugin-options";

export function hyperlocaliseTool(pluginOptions: HyperlocalisePluginOptions) {
  return {
    name: "hyperlocalise",
    title: "Hyperlocalise",
    icon: EarthGlobeIcon,
    component: () => <HyperlocaliseTool pluginOptions={pluginOptions} />,
  };
}
