import assert from 'node:assert/strict';
import test from 'node:test';
import { alphaBounds, containBox, detectSmartShieldType, removeUniformBorderBackground } from '../dist/smart-shield.mjs';

const canvas = (width, height, color = [255, 255, 255, 255]) => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) pixels.set(color, index);
  return pixels;
};
const pixel = (pixels, width, x, y, color) => pixels.set(color, (y * width + x) * 4);

test('TR Smart Shield identifies only genuine supported raster signatures', () => {
  assert.equal(detectSmartShieldType(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png');
  assert.equal(detectSmartShieldType(Uint8Array.from([255, 216, 255, 0])), 'image/jpeg');
  assert.equal(detectSmartShieldType(Uint8Array.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])), 'image/webp');
  assert.equal(detectSmartShieldType(Uint8Array.from([60, 115, 118, 103])), null);
});

test('removes a uniform connected border without special casing white or black', () => {
  const width = 60, height = 60, pixels = canvas(width, height);
  for (let y = 15; y < 45; y += 1) for (let x = 15; x < 45; x += 1) pixel(pixels, width, x, y, [12, 56, 120, 255]);
  const result = removeUniformBorderBackground(pixels, width, height);
  assert.equal(result.removed, true);
  assert.ok(result.confidence > 0.8);
  assert.deepEqual(result.bounds, { left: 15, top: 15, right: 44, bottom: 44 });
  assert.equal(result.data[3], 0);
});

test('keeps ambiguous opaque art intact instead of guessing its background', () => {
  const pixels = canvas(60, 60, [0, 0, 0, 255]);
  const result = removeUniformBorderBackground(pixels, 60, 60);
  assert.equal(result.removed, false);
  assert.equal(result.reason, 'unsafe_coverage');
});

test('transparent bounds and 512px containment preserve the crest aspect ratio', () => {
  const pixels = canvas(20, 20, [0, 0, 0, 0]);
  pixel(pixels, 20, 3, 5, [20, 80, 160, 255]); pixel(pixels, 20, 14, 12, [20, 80, 160, 255]);
  const bounds = alphaBounds(pixels, 20, 20);
  assert.deepEqual(bounds, { left: 3, top: 5, right: 14, bottom: 12 });
  const box = containBox(bounds, 20, 20);
  assert.equal(box.dw, 436);
  assert.equal(box.dh, 291);
  assert.equal(box.dx, 38);
});
