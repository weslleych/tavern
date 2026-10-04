import type { Page } from '@playwright/test';

export type MapView = { x: number; y: number; zoom: number; width: number; height: number };

// Observe real rendering without adding test-only state or methods to the app.
export function recordMapView() {
  const testWindow = window as Window & { mapViewRecording?: boolean };
  if (testWindow.mapViewRecording) return;
  testWindow.mapViewRecording = true;
  const original = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (
    this: CanvasRenderingContext2D,
    ...args: [CanvasImageSource, ...number[]]
  ) {
    if (
      this.canvas.getAttribute('aria-label') === 'Map canvas' &&
      args[0] instanceof HTMLCanvasElement
    ) {
      const matrix = this.getTransform();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.dataset.view = JSON.stringify({
        x: matrix.e / ratio,
        y: matrix.f / ratio,
        zoom: matrix.a / ratio,
      });
    }
    return Reflect.apply(original, this, args);
  };
}

export async function settleMap(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

export async function readMapView(page: Page): Promise<MapView> {
  await settleMap(page);
  return page.getByLabel('Map canvas').evaluate((canvas) => {
    const bounds = canvas.getBoundingClientRect();
    return {
      ...JSON.parse((canvas as HTMLCanvasElement).dataset.view!),
      width: bounds.width,
      height: bounds.height,
    };
  });
}
