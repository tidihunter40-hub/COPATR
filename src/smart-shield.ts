/**
 * TR Smart Shield
 *
 * The processing intentionally happens in the browser, before upload. It keeps
 * private source files out of third-party image services and only removes a
 * background when the pixels around the whole border make that decision safe.
 */
export const SMART_SHIELD_SIZE = 512;
export const SMART_SHIELD_MAX_BYTES = 3 * 1024 * 1024;
export const SMART_SHIELD_MAX_SOURCE_EDGE = 4096;
const PROCESSING_EDGE = 1024;

type RasterType = 'image/png' | 'image/jpeg' | 'image/webp';
type Bounds = { left: number; top: number; right: number; bottom: number };
export type SmartShieldStatus = 'processed' | 'original_fallback';
export type SmartShieldResult = {
  status: SmartShieldStatus;
  processed: File | null;
  source: { mime: RasterType; width: number; height: number; bytes: number };
  meta: Record<string, unknown>;
};

const extensionMime: Record<string, RasterType> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const extensionFor = (mime: RasterType) => mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];

export function detectSmartShieldType(bytes: Uint8Array): RasterType | null {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

export async function validateSmartShieldFile(file: File): Promise<RasterType> {
  if (!(file instanceof File) || !file.size) throw new Error('Selecione um escudo PNG, JPG, JPEG ou WEBP.');
  if (file.size > SMART_SHIELD_MAX_BYTES) throw new Error('O escudo deve ter no máximo 3 MB.');
  const type = detectSmartShieldType(new Uint8Array(await file.arrayBuffer()));
  const extension = String(file.name).toLowerCase().split('.').pop() || '';
  if (!type || extensionMime[extension] !== type || (file.type && file.type !== type)) {
    throw new Error('Arquivo inválido. Envie um PNG, JPG, JPEG ou WEBP verdadeiro.');
  }
  return type;
}

export function alphaBounds(data: Uint8ClampedArray, width: number, height: number, threshold = 8): Bounds | null {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (data[(y * width + x) * 4 + 3] <= threshold) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return right >= left ? { left, top, right, bottom } : null;
}

const distance = (data: Uint8ClampedArray, offset: number, red: number, green: number, blue: number) => {
  const r = data[offset] - red, g = data[offset + 1] - green, b = data[offset + 2] - blue;
  return Math.sqrt(r * r + g * g + b * b);
};

/** Returns an alpha mask only for a dominant, low-variance, border-connected background. */
export function removeUniformBorderBackground(data: Uint8ClampedArray, width: number, height: number) {
  if (width < 24 || height < 24) return { removed: false, confidence: 0, reason: 'source_too_small' };
  const edgePixels: number[] = [];
  for (let x = 0; x < width; x += 1) { edgePixels.push(x, (height - 1) * width + x); }
  for (let y = 1; y < height - 1; y += 1) { edgePixels.push(y * width, y * width + width - 1); }
  const bins = new Map<string, { count: number; r: number; g: number; b: number }>();
  for (const pixel of edgePixels) {
    const offset = pixel * 4;
    const key = `${Math.round(data[offset] / 24)}:${Math.round(data[offset + 1] / 24)}:${Math.round(data[offset + 2] / 24)}`;
    const bin = bins.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    bin.count += 1; bin.r += data[offset]; bin.g += data[offset + 1]; bin.b += data[offset + 2]; bins.set(key, bin);
  }
  const dominant = [...bins.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant || dominant.count / edgePixels.length < 0.82) return { removed: false, confidence: 0, reason: 'border_not_uniform' };
  const red = dominant.r / dominant.count, green = dominant.g / dominant.count, blue = dominant.b / dominant.count;
  let variance = 0;
  for (const pixel of edgePixels) variance += distance(data, pixel * 4, red, green, blue) ** 2;
  variance = Math.sqrt(variance / edgePixels.length);
  if (variance > 26) return { removed: false, confidence: 0, reason: 'border_not_uniform' };

  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0, tail = 0;
  const add = (pixel: number) => {
    if (visited[pixel] || distance(data, pixel * 4, red, green, blue) > 38) return;
    visited[pixel] = 1; queue[tail++] = pixel;
  };
  for (const pixel of edgePixels) add(pixel);
  while (head < tail) {
    const pixel = queue[head++], x = pixel % width, y = Math.floor(pixel / width);
    if (x) add(pixel - 1); if (x + 1 < width) add(pixel + 1); if (y) add(pixel - width); if (y + 1 < height) add(pixel + width);
  }
  const fraction = tail / total;
  if (fraction < 0.08 || fraction > 0.86) return { removed: false, confidence: 0, reason: 'unsafe_coverage' };
  const candidate = new Uint8ClampedArray(data);
  for (let pixel = 0; pixel < total; pixel += 1) if (visited[pixel]) candidate[pixel * 4 + 3] = 0;
  const bounds = alphaBounds(candidate, width, height);
  const foregroundArea = bounds ? (bounds.right - bounds.left + 1) * (bounds.bottom - bounds.top + 1) / total : 0;
  if (!bounds || foregroundArea < 0.035) return { removed: false, confidence: 0, reason: 'unsafe_foreground' };
  return { removed: true, confidence: Number((dominant.count / edgePixels.length * (1 - variance / 52)).toFixed(3)), bounds, data: candidate };
}

export function containBox(bounds: Bounds, sourceWidth: number, sourceHeight: number, target = SMART_SHIELD_SIZE) {
  const pad = Math.max(2, Math.round(target * 0.075));
  const contentWidth = bounds.right - bounds.left + 1, contentHeight = bounds.bottom - bounds.top + 1;
  const scale = Math.min((target - pad * 2) / contentWidth, (target - pad * 2) / contentHeight);
  const width = Math.max(1, Math.round(contentWidth * scale)), height = Math.max(1, Math.round(contentHeight * scale));
  return { sx: Math.max(0, bounds.left), sy: Math.max(0, bounds.top), sw: Math.min(sourceWidth - bounds.left, contentWidth), sh: Math.min(sourceHeight - bounds.top, contentHeight), dx: Math.round((target - width) / 2), dy: Math.round((target - height) / 2), dw: width, dh: height };
}

function canvas(width: number, height: number) {
  const element = document.createElement('canvas');
  element.width = width; element.height = height;
  const context = element.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Não foi possível preparar o escudo neste navegador.');
  return { element, context };
}

function blobFrom(canvasElement: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvasElement.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Não foi possível gerar o PNG do escudo.')), 'image/png'));
}

export async function prepareSmartShield(file: File): Promise<SmartShieldResult> {
  const mime = await validateSmartShieldFile(file);
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('Não foi possível abrir o escudo. Escolha uma imagem válida.'); }
  const source = { mime, width: bitmap.width, height: bitmap.height, bytes: file.size };
  if (!bitmap.width || !bitmap.height || bitmap.width > SMART_SHIELD_MAX_SOURCE_EDGE || bitmap.height > SMART_SHIELD_MAX_SOURCE_EDGE) {
    bitmap.close(); throw new Error(`O escudo deve ter até ${SMART_SHIELD_MAX_SOURCE_EDGE} × ${SMART_SHIELD_MAX_SOURCE_EDGE} pixels.`);
  }
  if (Math.min(bitmap.width, bitmap.height) < 64) {
    bitmap.close();
    return { status: 'original_fallback', processed: null, source, meta: { version: 1, mode: 'original_fallback', reason: 'source_too_small' } };
  }
  const scale = Math.min(1, PROCESSING_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
  const sourceCanvas = canvas(width, height);
  sourceCanvas.context.imageSmoothingEnabled = true;
  sourceCanvas.context.drawImage(bitmap, 0, 0, width, height); bitmap.close();
  const pixels = sourceCanvas.context.getImageData(0, 0, width, height);
  let minAlpha = 255;
  for (let index = 3; index < pixels.data.length; index += 4) minAlpha = Math.min(minAlpha, pixels.data[index]);
  let bounds = alphaBounds(pixels.data, width, height);
  let mode = 'alpha_preserved', confidence = 1;
  if (minAlpha >= 250) {
    const masked = removeUniformBorderBackground(pixels.data, width, height);
    if (masked.removed && masked.data && masked.bounds) {
      pixels.data.set(masked.data); sourceCanvas.context.putImageData(pixels, 0, 0); bounds = masked.bounds; mode = 'uniform_border_removed'; confidence = masked.confidence;
    } else { mode = 'opaque_preserved'; confidence = 0; }
  }
  if (!bounds) return { status: 'original_fallback', processed: null, source, meta: { version: 1, mode: 'original_fallback', reason: 'empty_or_unsafe_image' } };
  const target = canvas(SMART_SHIELD_SIZE, SMART_SHIELD_SIZE);
  target.context.clearRect(0, 0, SMART_SHIELD_SIZE, SMART_SHIELD_SIZE);
  const fit = containBox(bounds, width, height);
  target.context.imageSmoothingEnabled = true;
  target.context.imageSmoothingQuality = 'high';
  target.context.drawImage(sourceCanvas.element, fit.sx, fit.sy, fit.sw, fit.sh, fit.dx, fit.dy, fit.dw, fit.dh);
  const processed = new File([await blobFrom(target.element)], `tr-smart-shield-${crypto.randomUUID()}.png`, { type: 'image/png' });
  return { status: 'processed', processed, source, meta: { version: 1, mode, confidence, output: { width: SMART_SHIELD_SIZE, height: SMART_SHIELD_SIZE, mime: 'image/png' }, source_extension: extensionFor(mime) } };
}
