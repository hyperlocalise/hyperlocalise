export const PLUGIN_UI_WIDTH = 360;
export const PLUGIN_UI_MIN_HEIGHT = 200;
export const PLUGIN_UI_MAX_HEIGHT = 720;

export function clampPluginUiHeight(height: number): number {
  return Math.min(PLUGIN_UI_MAX_HEIGHT, Math.max(PLUGIN_UI_MIN_HEIGHT, Math.ceil(height)));
}

export function measurePluginUiHeight(root: HTMLElement): number {
  const measured = root.getBoundingClientRect().height;
  if (measured > 0) {
    return clampPluginUiHeight(measured);
  }
  return clampPluginUiHeight(root.scrollHeight);
}
