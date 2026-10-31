/**
 * Contentine Create — Cartoon Engine (public surface)
 *
 * Consumers (the /cartoon timeline editor, WS-4) must load this module via
 * dynamic import only (Law L8 — Next.js static export):
 *
 *   const cartoon = await import('@/engine/cartoon');
 *
 * Pipeline: scene plan (source of truth) → voice takes (tts-manager) →
 * offline audio mix → GSAP timeline compile → frame-accurate worker render
 * (OffscreenCanvas → WebCodecs → Mediabunny) → MP4 with provenance (L7).
 */

export {
  SCENE_PLAN_VERSION,
  validateScenePlan,
  canonicalJson,
  sha256Hex,
  hashScenePlan,
  hashScene,
  diffScenePlans,
} from './scene-plan';
export type {
  ScenePlan,
  ScenePlanScene,
  BackgroundSpec,
  CharacterBlock,
  DialogueLine,
  GestureCue,
  SfxCue,
  MusicCue,
  CaptionSpec,
  DurationHints,
  ScenePlanDiff,
} from './scene-plan';

export { computePlanTiming, takeKeyForLine } from './timing';
export type { PlanTiming, SceneWindow, DialogueWindow } from './timing';

export { stampVisemesFromText } from './visemes';
export type { VisemeId, VisemeStamp } from './visemes';

export { getRig, registerRig, createRestPose, TRACER_STICK_RIG } from './rig';
export type { RigDefinition, RigPose, GestureFn, GestureTimeline } from './rig';

export { synthesizeTakes, parseVoiceProfileRef, takeTimingInfo, takeMatchesLine } from './voice-takes';
export type { VoiceTake, VoiceProfile } from './voice-takes';

export { mixPlanAudio, MIX_SAMPLE_RATE } from './audio-mixer';
export type { MixedAudio, MixOptions } from './audio-mixer';

export { compileTimeline, seekTimeline } from './timeline-compiler';
export type { CompiledTimeline, CompiledStage, TakeTimingInfo } from './timeline-compiler';

export { renderCartoonProject, rerenderEditedProject } from './cartoon-renderer';
export type {
  CartoonRenderOptions,
  CartoonRenderResult,
  SceneRenderRecord,
  PartialRenderReport,
  CartoonRenderPhase,
} from './cartoon-renderer';

export { probeMp4 } from './mp4-probe';
export type { Mp4Probe, Mp4TrackProbe } from './mp4-probe';
