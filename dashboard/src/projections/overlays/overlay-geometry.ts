import type { BoundingBox } from '../../../../lib/domain/observation/dashboard';

export interface ViewportDimensions {
  readonly width: number;
  readonly height: number;
}

export interface OverlayRatios {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface DisplayRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface PlaneProjection {
  readonly x: number;
  readonly width: number;
  readonly height: number;
  readonly z?: number;
}

const normalizeViewport = (
  viewport: ViewportDimensions,
): ViewportDimensions => ({
  width: Math.max(viewport.width, 1),
  height: Math.max(viewport.height, 1),
});

export const boundingBoxCenter = (
  box: BoundingBox,
): { readonly x: number; readonly y: number } => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

export const boundingBoxToRatios = (
  box: BoundingBox,
  viewport: ViewportDimensions,
): OverlayRatios => {
  const normalized = normalizeViewport(viewport);
  return {
    left: box.x / normalized.width,
    top: box.y / normalized.height,
    width: box.width / normalized.width,
    height: box.height / normalized.height,
  };
};

export const ratiosToDisplayRect = (
  ratios: OverlayRatios,
  rect: DisplayRect,
): DisplayRect => ({
  left: rect.left + ratios.left * rect.width,
  top: rect.top + ratios.top * rect.height,
  width: ratios.width * rect.width,
  height: ratios.height * rect.height,
});

export const domToNdc = (
  box: BoundingBox,
  viewport: ViewportDimensions,
): { readonly x: number; readonly y: number } => {
  const normalized = normalizeViewport(viewport);
  const center = boundingBoxCenter(box);
  return {
    x: (center.x / normalized.width) * 2 - 1,
    y: -((center.y / normalized.height) * 2 - 1),
  };
};

export const boundingBoxToPlaneWorld = (
  box: BoundingBox,
  viewport: ViewportDimensions,
  plane: PlaneProjection,
): { readonly x: number; readonly y: number; readonly z: number } => {
  const ndc = domToNdc(box, viewport);
  return {
    x: plane.x + ndc.x * (plane.width / 2),
    y: ndc.y * (plane.height / 2),
    z: plane.z ?? 0.01,
  };
};
