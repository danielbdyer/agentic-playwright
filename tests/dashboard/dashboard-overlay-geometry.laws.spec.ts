import { expect, test } from '@playwright/test';
import {
  boundingBoxToPlaneWorld,
  boundingBoxToRatios,
  domToNdc,
  ratiosToDisplayRect,
} from '../../dashboard/src/projections/overlays/overlay-geometry';

const box = {
  x: 200,
  y: 100,
  width: 100,
  height: 50,
} as const;

test('boundingBoxToRatios supports responsive remapping onto a new display rect', () => {
  const ratios = boundingBoxToRatios(box, { width: 1000, height: 500 });
  const displayRect = ratiosToDisplayRect(ratios, {
    left: 20,
    top: 40,
    width: 500,
    height: 250,
  });

  expect(ratios).toEqual({
    left: 0.2,
    top: 0.2,
    width: 0.1,
    height: 0.1,
  });
  expect(displayRect).toEqual({
    left: 120,
    top: 90,
    width: 50,
    height: 25,
  });
});

test('domToNdc and boundingBoxToPlaneWorld preserve the same anchor point', () => {
  const ndc = domToNdc(box, { width: 1000, height: 500 });
  const world = boundingBoxToPlaneWorld(box, { width: 1000, height: 500 }, {
    x: -1.8,
    width: 3,
    height: 2.2,
    z: 0.1,
  });

  expect(ndc.x).toBeCloseTo(-0.5);
  expect(ndc.y).toBeCloseTo(0.5);
  expect(world.x).toBeCloseTo(-2.55);
  expect(world.y).toBeCloseTo(0.55);
  expect(world.z).toBeCloseTo(0.1);
});

test('geometry helpers degrade safely when viewport dimensions are zero', () => {
  const ratios = boundingBoxToRatios(box, { width: 0, height: 0 });
  const ndc = domToNdc(box, { width: 0, height: 0 });

  expect(Number.isFinite(ratios.left)).toBeTruthy();
  expect(Number.isFinite(ratios.top)).toBeTruthy();
  expect(Number.isFinite(ndc.x)).toBeTruthy();
  expect(Number.isFinite(ndc.y)).toBeTruthy();
});
