/**
 * Contentine Create — Face Animator (Pseudo-Avatar)
 * Uses face-api.js for 68-point facial landmark detection, then animates:
 *   - Mouth open/close synced to TTS audio amplitude
 *   - Random eye blinks at natural intervals
 *   - Subtle head bob for liveliness
 *
 * All processing is browser-side. Models loaded from /models/face-api/.
 */

// Types for face-api.js (loaded dynamically to avoid build issues)
interface FaceLandmarks68 {
  getMouth(): { x: number; y: number }[];
  getLeftEye(): { x: number; y: number }[];
  getRightEye(): { x: number; y: number }[];
  getJawOutline(): { x: number; y: number }[];
  getNose(): { x: number; y: number }[];
}

interface FaceDetection {
  detection: { box: { x: number; y: number; width: number; height: number } };
  landmarks: FaceLandmarks68;
}

export interface FaceData {
  /** Bounding box of the face. */
  faceBox: { x: number; y: number; width: number; height: number };
  /** 68 facial landmark points. */
  landmarks: { x: number; y: number }[];
  /** Mouth region landmarks (points 48-67). */
  mouth: { x: number; y: number }[];
  /** Left eye landmarks (points 36-41). */
  leftEye: { x: number; y: number }[];
  /** Right eye landmarks (points 42-47). */
  rightEye: { x: number; y: number }[];
  /** Jaw outline (points 0-16). */
  jaw: { x: number; y: number }[];
  /** Nose landmarks (points 27-35). */
  nose: { x: number; y: number }[];
}

export interface AnimationFrame {
  /** Mouth openness (0 = closed, 1 = fully open). */
  mouthOpen: number;
  /** Left eye openness (0 = closed, 1 = open). */
  leftEyeOpen: number;
  /** Right eye openness (0 = closed, 1 = open). */
  rightEyeOpen: number;
  /** Head rotation in degrees (-3 to 3). */
  headRotation: number;
  /** Head vertical offset in pixels (-2 to 2). */
  headBob: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let faceapi: any = null;
let modelsLoaded = false;

/**
 * Load face-api.js and its models from local /models/face-api/ path.
 */
export async function initFaceDetection(
  onProgress?: (percent: number, message: string) => void
): Promise<void> {
  if (modelsLoaded) return;

  onProgress?.(5, 'Loading face detection library...');

  // Dynamic import to avoid webpack bundling issues
  faceapi = await import('face-api.js');

  onProgress?.(20, 'Loading face detection models...');

  // Load models from local path (downloaded by setup-assets.sh)
  await faceapi.nets.tinyFaceDetector.loadFromUri('/models/face-api');
  onProgress?.(50, 'Loading landmark model...');

  await faceapi.nets.faceLandmark68Net.loadFromUri('/models/face-api');
  onProgress?.(80, 'Loading expression model...');

  await faceapi.nets.faceExpressionNet.loadFromUri('/models/face-api');
  onProgress?.(100, 'Face detection ready');

  modelsLoaded = true;
}

/**
 * Detect face landmarks in an image.
 * Returns face data with all 68 landmarks organized by region.
 */
export async function detectFace(
  imageElement: HTMLImageElement | HTMLCanvasElement
): Promise<FaceData | null> {
  if (!faceapi || !modelsLoaded) {
    throw new Error('Face detection not initialized. Call initFaceDetection() first.');
  }

  const detection = await faceapi
    .detectSingleFace(imageElement, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks();

  if (!detection) return null;

  const landmarks = detection.landmarks;
  const positions = landmarks.positions;
  const allPoints = positions.map((p: { x: number; y: number }) => ({ x: p.x, y: p.y }));

  return {
    faceBox: {
      x: detection.detection.box.x,
      y: detection.detection.box.y,
      width: detection.detection.box.width,
      height: detection.detection.box.height,
    },
    landmarks: allPoints,
    mouth: landmarks.getMouth().map((p: { x: number; y: number }) => ({ x: p.x, y: p.y })),
    leftEye: landmarks.getLeftEye().map((p: { x: number; y: number }) => ({ x: p.x, y: p.y })),
    rightEye: landmarks.getRightEye().map((p: { x: number; y: number }) => ({ x: p.x, y: p.y })),
    jaw: landmarks.getJawOutline().map((p: { x: number; y: number }) => ({ x: p.x, y: p.y })),
    nose: landmarks.getNose().map((p: { x: number; y: number }) => ({ x: p.x, y: p.y })),
  };
}

/**
 * Generate animation keyframes from audio amplitude data.
 * Maps audio amplitude to mouth opening and adds eye blinks + head bob.
 *
 * @param audioData — Float32Array PCM audio data.
 * @param sampleRate — Audio sample rate (e.g., 24000).
 * @param fps — Target video FPS (e.g., 30).
 * @returns Array of animation frames, one per video frame.
 */
export function generateAnimationFrames(
  audioData: Float32Array,
  sampleRate: number,
  fps: number
): AnimationFrame[] {
  const durationSec = audioData.length / sampleRate;
  const totalFrames = Math.ceil(durationSec * fps);
  const samplesPerFrame = sampleRate / fps;
  const frames: AnimationFrame[] = [];

  // Pre-generate blink schedule (natural: every 3-6 seconds, lasting ~200ms)
  const blinkTimes: number[] = [];
  let nextBlink = 2 + Math.random() * 3;
  while (nextBlink < durationSec) {
    blinkTimes.push(nextBlink);
    nextBlink += 3 + Math.random() * 3;
  }

  for (let i = 0; i < totalFrames; i++) {
    const time = i / fps;
    const sampleStart = Math.floor(i * samplesPerFrame);
    const sampleEnd = Math.min(sampleStart + Math.ceil(samplesPerFrame), audioData.length);

    // Calculate RMS amplitude for this frame
    let sumSquared = 0;
    for (let s = sampleStart; s < sampleEnd; s++) {
      sumSquared += audioData[s] * audioData[s];
    }
    const rms = Math.sqrt(sumSquared / Math.max(1, sampleEnd - sampleStart));

    // Map amplitude to mouth opening (0-1), with smoothing
    const mouthOpen = Math.min(1, rms * 4); // Scale factor tuned for natural look

    // Eye blinks — check if current time is within a blink window
    let leftEyeOpen = 1;
    let rightEyeOpen = 1;
    for (const blinkTime of blinkTimes) {
      const blinkDuration = 0.15; // 150ms blink
      if (time >= blinkTime && time < blinkTime + blinkDuration) {
        const blinkProgress = (time - blinkTime) / blinkDuration;
        // Smooth blink curve: close then open
        const blinkAmount = blinkProgress < 0.5
          ? 1 - blinkProgress * 2
          : (blinkProgress - 0.5) * 2;
        leftEyeOpen = blinkAmount;
        rightEyeOpen = blinkAmount;
        break;
      }
    }

    // Subtle head bob — sine wave at natural frequency
    const headBob = Math.sin(time * 1.5) * 1.5; // ±1.5 pixels
    const headRotation = Math.sin(time * 0.8 + 1) * 1.5; // ±1.5 degrees

    frames.push({
      mouthOpen,
      leftEyeOpen,
      rightEyeOpen,
      headRotation,
      headBob,
    });
  }

  return frames;
}

/**
 * Render a single animated avatar frame on canvas.
 * Takes the original image, face data, and current animation state.
 */
export function renderAvatarFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  image: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number,
  faceData: FaceData,
  animation: AnimationFrame
): void {
  // Clear canvas
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Calculate scale to fit image in canvas
  const scale = Math.min(canvasWidth / image.width, canvasHeight / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = (canvasWidth - drawWidth) / 2;
  const offsetY = (canvasHeight - drawHeight) / 2;

  ctx.save();

  // Apply head bob and rotation
  const centerX = offsetX + (faceData.faceBox.x + faceData.faceBox.width / 2) * scale;
  const centerY = offsetY + (faceData.faceBox.y + faceData.faceBox.height / 2) * scale;

  ctx.translate(centerX, centerY);
  ctx.rotate((animation.headRotation * Math.PI) / 180);
  ctx.translate(-centerX, -centerY + animation.headBob);

  // Draw the base image
  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  // Animate mouth — draw a dark overlay that simulates opening
  if (animation.mouthOpen > 0.05) {
    const mouth = faceData.mouth;
    if (mouth.length >= 12) {
      ctx.save();

      // Upper lip center (point 51 in 68-point model, ~index 3 in mouth array)
      const upperLip = mouth[3];
      // Lower lip center (point 57, ~index 9)
      const lowerLip = mouth[9];
      // Mouth width points
      const leftCorner = mouth[0];
      const rightCorner = mouth[6];

      const mouthCenterX = offsetX + ((leftCorner.x + rightCorner.x) / 2) * scale;
      const mouthCenterY = offsetY + ((upperLip.y + lowerLip.y) / 2) * scale;
      const mouthWidth = Math.abs(rightCorner.x - leftCorner.x) * scale * 0.7;
      const mouthHeight = Math.abs(lowerLip.y - upperLip.y) * scale * animation.mouthOpen * 2;

      // Draw dark ellipse for open mouth
      ctx.fillStyle = 'rgba(30, 20, 20, 0.85)';
      ctx.beginPath();
      ctx.ellipse(
        mouthCenterX,
        mouthCenterY + mouthHeight * 0.2,
        mouthWidth * 0.5,
        Math.max(2, mouthHeight * 0.5),
        0, 0, Math.PI * 2
      );
      ctx.fill();

      ctx.restore();
    }
  }

  // Animate eye blinks — draw skin-colored overlay when closing
  if (animation.leftEyeOpen < 0.95) {
    drawEyeBlink(ctx, faceData.leftEye, scale, offsetX, offsetY, 1 - animation.leftEyeOpen);
  }
  if (animation.rightEyeOpen < 0.95) {
    drawEyeBlink(ctx, faceData.rightEye, scale, offsetX, offsetY, 1 - animation.rightEyeOpen);
  }

  ctx.restore();
}

/** Draw an eye blink overlay — fills eye region with a skin-toned rectangle. */
function drawEyeBlink(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  eyePoints: { x: number; y: number }[],
  scale: number,
  offsetX: number,
  offsetY: number,
  closedness: number
): void {
  if (eyePoints.length < 6) return;

  // Get eye bounding box
  const xs = eyePoints.map((p) => p.x);
  const ys = eyePoints.map((p) => p.y);
  const minX = Math.min(...xs) * scale + offsetX;
  const maxX = Math.max(...xs) * scale + offsetX;
  const minY = Math.min(...ys) * scale + offsetY;
  const maxY = Math.max(...ys) * scale + offsetY;

  const eyeWidth = maxX - minX;
  const eyeHeight = maxY - minY;
  const eyeCenterY = (minY + maxY) / 2;

  // Draw eyelid closing from top
  const lidHeight = eyeHeight * closedness * 1.5;
  ctx.fillStyle = 'rgba(200, 170, 140, 0.9)'; // Skin-tone approximation
  ctx.fillRect(
    minX - 2,
    eyeCenterY - lidHeight / 2,
    eyeWidth + 4,
    lidHeight
  );
}

/** Check if face-api.js models are loaded and ready. */
export function isFaceDetectionReady(): boolean {
  return modelsLoaded;
}

/**
 * Generate default FaceData for avatar presets where face-api.js cannot detect landmarks
 * (e.g., illustrated/SVG avatars). Uses standard portrait proportions centered on a 400×400 image.
 * The animation will still look natural since mouth/eye overlays scale to the face region.
 */
export function getDefaultFaceData(imageWidth = 400, imageHeight = 400): FaceData {
  const cx = imageWidth / 2;
  const cy = imageHeight * 0.42; // Face center slightly above image center
  const faceW = imageWidth * 0.55;
  const faceH = imageHeight * 0.6;

  // Standard face proportions for a front-facing portrait
  const eyeY = cy - faceH * 0.08;
  const eyeSpacing = faceW * 0.18;
  const mouthY = cy + faceH * 0.18;
  const noseY = cy + faceH * 0.05;

  // Build simplified but functional landmark regions
  const leftEye = [
    { x: cx - eyeSpacing - 12, y: eyeY - 4 },
    { x: cx - eyeSpacing - 6, y: eyeY - 6 },
    { x: cx - eyeSpacing, y: eyeY - 4 },
    { x: cx - eyeSpacing + 6, y: eyeY - 4 },
    { x: cx - eyeSpacing, y: eyeY + 4 },
    { x: cx - eyeSpacing - 6, y: eyeY + 4 },
  ];

  const rightEye = [
    { x: cx + eyeSpacing - 6, y: eyeY - 4 },
    { x: cx + eyeSpacing, y: eyeY - 6 },
    { x: cx + eyeSpacing + 6, y: eyeY - 4 },
    { x: cx + eyeSpacing + 12, y: eyeY - 4 },
    { x: cx + eyeSpacing + 6, y: eyeY + 4 },
    { x: cx + eyeSpacing, y: eyeY + 4 },
  ];

  // Mouth: 20 points forming an oval
  const mouthW = faceW * 0.28;
  const mouthH = faceW * 0.08;
  const mouth: { x: number; y: number }[] = [];
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2;
    mouth.push({
      x: cx + Math.cos(angle) * mouthW,
      y: mouthY + Math.sin(angle) * mouthH,
    });
  }

  // Nose: simple vertical line
  const nose = [
    { x: cx, y: noseY - 15 },
    { x: cx - 5, y: noseY },
    { x: cx, y: noseY + 5 },
    { x: cx + 5, y: noseY },
    { x: cx, y: noseY + 10 },
    { x: cx - 8, y: noseY + 12 },
    { x: cx, y: noseY + 14 },
    { x: cx + 8, y: noseY + 12 },
    { x: cx, y: noseY + 10 },
  ];

  // Jaw outline: U-shape around face
  const jaw: { x: number; y: number }[] = [];
  for (let i = 0; i <= 16; i++) {
    const angle = Math.PI + (i / 16) * Math.PI;
    jaw.push({
      x: cx + Math.cos(angle) * (faceW / 2),
      y: cy + Math.sin(angle) * (faceH / 2) * 0.8 + faceH * 0.2,
    });
  }

  return {
    faceBox: {
      x: cx - faceW / 2,
      y: cy - faceH / 2,
      width: faceW,
      height: faceH,
    },
    landmarks: [...leftEye, ...rightEye, ...mouth.slice(0, 20), ...nose, ...jaw],
    mouth,
    leftEye,
    rightEye,
    jaw,
    nose,
  };
}
