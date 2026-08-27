declare module "cobe" {
  type Marker = { location: [number, number]; size: number };

  type GlobeOptions = {
    devicePixelRatio?: number;
    width: number;
    height: number;
    phi?: number;
    theta?: number;
    dark?: number;
    diffuse?: number;
    mapSamples?: number;
    mapBrightness?: number;
    baseColor?: [number, number, number];
    markerColor?: [number, number, number];
    glowColor?: [number, number, number];
    markers?: Marker[];
  };

  type GlobeInstance = {
    update: (options: Partial<GlobeOptions> & { phi?: number }) => void;
    destroy: () => void;
  };

  export default function createGlobe(
    canvas: HTMLCanvasElement,
    options: GlobeOptions,
  ): GlobeInstance;
}

declare module "unpdf" {
  export function extractText(
    data: Uint8Array,
    options?: { mergePages?: boolean },
  ): Promise<{ text: string }>;
}
