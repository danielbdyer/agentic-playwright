/**
 * Spatial domain types — the contract between the WebSocket event stream
 * and the Three.js visualization layer.
 *
 * These are projections of the backend domain types, kept lightweight
 * for the render loop. No domain logic here — just shapes.
 */

export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ProbeEvent {
  readonly id: string;
  readonly element: string;
  readonly screen: string;
  readonly boundingBox: BoundingBox | null;
  readonly locatorRung: number;
  readonly strategy: string;
  readonly found: boolean;
  readonly confidence: number;
}

export interface ScreenCapture {
  readonly imageBase64: string;
  readonly width: number;
  readonly height: number;
  readonly url: string;
}

export interface KnowledgeNode {
  readonly screen: string;
  readonly element: string;
  readonly confidence: number;
  readonly aliases: readonly string[];
  readonly status: 'approved-equivalent' | 'learning' | 'needs-review';
}

/** Viewport dimensions for coordinate mapping between DOM and Three.js space. */
export interface ViewportDimensions {
  readonly width: number;
  readonly height: number;
}

/** Map a DOM bounding box to normalized Three.js coordinates [-1, 1]. */
export const domToNdc = (
  box: BoundingBox,
  viewport: ViewportDimensions,
): { x: number; y: number } => ({
  x: ((box.x + box.width / 2) / viewport.width) * 2 - 1,
  y: -(((box.y + box.height / 2) / viewport.height) * 2 - 1),
});

/** Map a DOM bounding box to Three.js world coordinates on a plane. */
export const domToWorld = (
  box: BoundingBox,
  viewport: ViewportDimensions,
  planeWidth: number,
  planeHeight: number,
): { x: number; y: number; z: number } => {
  const ndc = domToNdc(box, viewport);
  return {
    x: ndc.x * (planeWidth / 2),
    y: ndc.y * (planeHeight / 2),
    z: 0.01, // Slightly in front of the screen plane
  };
};

/** Confidence to color: learning (blue) → approved (green). Pure. */
export const confidenceToColor = (confidence: number): [number, number, number] => {
  const g = Math.min(1, confidence * 1.2);
  const b = Math.max(0, 1 - confidence * 1.5);
  return [0.2, g, b];
};

/** Rung to glow intensity: higher rung = dimmer (more degraded). Pure. */
export const rungToIntensity = (rung: number): number =>
  Math.max(0.3, 1.0 - rung * 0.2);
