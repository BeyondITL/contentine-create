'use client';

/**
 * Wav2Lip ONNX engine — animates a static photo with audio-driven lip sync.
 * Uses ONNX Runtime Web to run the Wav2Lip model in the browser. When the ONNX
 * model is unavailable, falls back to face-animator pseudo-animation.
 */
export class Wav2LipEngine {
  private session: any = null;
  private ort: any = null;
  private _initializing = false;
  private _modelAvailable: boolean | null = null;

  /** Check if ONNX Runtime Web + WebGPU/WASM is available. */
  async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
      const ort = await import('onnxruntime-web');
      return typeof ort.InferenceSession !== 'undefined';
    } catch { return false; }
  }

  /**
   * Check if the Wav2Lip ONNX model is available (IndexedDB cache or public/).
   * Returns false if the model hasn't been downloaded yet.
   */
  async isModelAvailable(): Promise<boolean> {
    if (this._modelAvailable !== null) return this._modelAvailable;
    try {
      // Check asset-cache (IndexedDB) first
      const { assetCache } = await import('./asset-cache');
      const cached = await assetCache.has('models', 'wav2lip');
      if (cached) { this._modelAvailable = true; return true; }
    } catch { /* asset-cache unavailable */ }
    try {
      // Fallback: check if model file is accessible in public directory
      const res = await fetch('/models/wav2lip/wav2lip_quantized.onnx', { method: 'HEAD' });
      this._modelAvailable = res.ok;
    } catch {
      this._modelAvailable = false;
    }
    return this._modelAvailable;
  }

  /** Initialize the Wav2Lip ONNX model. Checks asset-cache first, then falls back to public/. */
  async init(onProgress?: (pct: number) => void): Promise<void> {
    if (this.session || this._initializing) return;
    this._initializing = true;
    try {
      onProgress?.(10);
      this.ort = await import('onnxruntime-web');
      onProgress?.(20);

      // Try loading from IndexedDB asset-cache first (cached model download)
      let modelSource: string | ArrayBuffer = '/models/wav2lip/wav2lip_quantized.onnx';
      try {
        const { assetCache } = await import('./asset-cache');
        const cached = await assetCache.get('models', 'wav2lip');
        if (cached) {
          modelSource = cached instanceof Blob ? await cached.arrayBuffer() : cached;
        }
      } catch { /* asset-cache unavailable — use file fallback */ }

      onProgress?.(40);
      this.session = await this.ort.InferenceSession.create(
        modelSource,
        { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }
      );
      onProgress?.(100);
      this._modelAvailable = true;
    } catch (err) {
      this._initializing = false;
      this._modelAvailable = false;
      throw new Error(`Wav2Lip model load failed: ${err}`);
    }
    this._initializing = false;
  }

  /**
   * Animate a face image with audio-driven lip sync.
   * @param faceImage - User photo cropped to face (96x96 expected).
   * @param audioBuffer - TTS-generated PCM audio as Float32Array or ArrayBuffer.
   * @param fps - Output framerate (default 25).
   * @param onProgress - Per-frame progress callback (frameIndex, totalFrames).
   * @returns Array of animated frames as ImageData.
   */
  async animate(
    faceImage: ImageBitmap | HTMLImageElement | HTMLCanvasElement,
    audioBuffer: ArrayBuffer | Float32Array,
    fps: number = 25,
    onProgress?: (frame: number, total: number) => void
  ): Promise<ImageData[]> {
    if (!this.session) await this.init();

    // Accept either ArrayBuffer or Float32Array
    const audioFloat32 = audioBuffer instanceof Float32Array
      ? audioBuffer
      : new Float32Array(audioBuffer);

    const melFrames = this.extractMelFrames(audioFloat32, fps);
    const faceTensor = await this.imageToTensor(faceImage);
    const frames: ImageData[] = [];

    for (let i = 0; i < melFrames.length; i++) {
      try {
        const melTensor = new this.ort.Tensor('float32', melFrames[i], [1, 1, 80, 16]);
        const feeds: Record<string, any> = {
          face: faceTensor,
          mel: melTensor,
        };
        const results = await this.session!.run(feeds);
        const output = results[Object.keys(results)[0]];
        const frame = this.tensorToImageData(output);
        frames.push(frame);
      } catch {
        // On inference error, duplicate last good frame
        if (frames.length > 0) frames.push(frames[frames.length - 1]);
      }
      onProgress?.(i + 1, melFrames.length);
    }

    return frames;
  }

  /**
   * Composite Wav2Lip output frames onto a full-resolution canvas.
   * Places the animated face region onto the original photo for each frame.
   */
  compositeFrames(
    originalImage: HTMLImageElement,
    animatedFaces: ImageData[],
    faceBox: { x: number; y: number; width: number; height: number },
    canvasWidth: number,
    canvasHeight: number
  ): OffscreenCanvas[] {
    const composited: OffscreenCanvas[] = [];

    // Scale factors from original image coords to canvas coords
    const scale = Math.min(canvasWidth / originalImage.width, canvasHeight / originalImage.height);
    const drawWidth = originalImage.width * scale;
    const drawHeight = originalImage.height * scale;
    const offsetX = (canvasWidth - drawWidth) / 2;
    const offsetY = (canvasHeight - drawHeight) / 2;

    for (const faceFrame of animatedFaces) {
      const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      // Draw the original photo
      ctx.drawImage(originalImage, offsetX, offsetY, drawWidth, drawHeight);

      // Draw the animated face region on top
      const faceX = offsetX + faceBox.x * scale;
      const faceY = offsetY + faceBox.y * scale;
      const faceW = faceBox.width * scale;
      const faceH = faceBox.height * scale;

      // Create temporary canvas from ImageData and scale it to the face region
      const tempCanvas = new OffscreenCanvas(faceFrame.width, faceFrame.height);
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.putImageData(faceFrame, 0, 0);
        ctx.drawImage(tempCanvas, faceX, faceY, faceW, faceH);
      }

      composited.push(canvas);
    }

    return composited;
  }

  /** Convert image to ONNX tensor (1, 3, 96, 96). */
  private async imageToTensor(img: ImageBitmap | HTMLImageElement | HTMLCanvasElement): Promise<any> {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, 96, 96);
    const imageData = ctx.getImageData(0, 0, 96, 96);
    const { data } = imageData;
    const float32 = new Float32Array(3 * 96 * 96);
    for (let i = 0; i < 96 * 96; i++) {
      float32[i] = data[i * 4] / 255.0;                // R
      float32[96 * 96 + i] = data[i * 4 + 1] / 255.0;  // G
      float32[2 * 96 * 96 + i] = data[i * 4 + 2] / 255.0; // B
    }
    return new this.ort.Tensor('float32', float32, [1, 3, 96, 96]);
  }

  /**
   * Crop the face region from an image for Wav2Lip input (96x96).
   * Adds padding around the face box for context.
   */
  cropFace(
    img: HTMLImageElement,
    faceBox: { x: number; y: number; width: number; height: number },
    padding: number = 0.2
  ): HTMLCanvasElement {
    const padX = faceBox.width * padding;
    const padY = faceBox.height * padding;
    const cropX = Math.max(0, faceBox.x - padX);
    const cropY = Math.max(0, faceBox.y - padY);
    const cropW = Math.min(img.width - cropX, faceBox.width + padX * 2);
    const cropH = Math.min(img.height - cropY, faceBox.height + padY * 2);

    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, 96, 96);
    return canvas;
  }

  /** Extract mel spectrogram frames from PCM audio. */
  private extractMelFrames(audioData: Float32Array, fps: number): Float32Array[] {
    const sampleRate = 16000;
    const hopLength = Math.floor(sampleRate / fps);
    const nMels = 80;
    const melWindow = 16;
    const totalFrames = Math.floor(audioData.length / hopLength);
    const frames: Float32Array[] = [];

    for (let f = 0; f < totalFrames; f++) {
      const melFrame = new Float32Array(nMels * melWindow);
      const start = f * hopLength;
      for (let m = 0; m < nMels; m++) {
        for (let w = 0; w < melWindow; w++) {
          const idx = start + w * (hopLength / melWindow);
          melFrame[m * melWindow + w] = idx < audioData.length ? Math.abs(audioData[Math.floor(idx)]) : 0;
        }
      }
      frames.push(melFrame);
    }

    return frames;
  }

  /** Convert ONNX output tensor to ImageData. */
  private tensorToImageData(tensor: any): ImageData {
    const [, , h, w] = tensor.dims as number[];
    const data = tensor.data as Float32Array;
    const imageData = new ImageData(w || 96, h || 96);
    const size = (w || 96) * (h || 96);
    for (let i = 0; i < size; i++) {
      imageData.data[i * 4] = Math.round((data[i] || 0) * 255);
      imageData.data[i * 4 + 1] = Math.round((data[size + i] || 0) * 255);
      imageData.data[i * 4 + 2] = Math.round((data[2 * size + i] || 0) * 255);
      imageData.data[i * 4 + 3] = 255;
    }
    return imageData;
  }

  /** Release model and ONNX runtime resources. */
  destroy(): void {
    this.session?.release();
    this.session = null;
    this.ort = null;
    this._modelAvailable = null;
  }
}

export const wav2lipEngine = new Wav2LipEngine();
