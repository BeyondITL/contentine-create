/**
 * Contentine Create — Cartoon Studio: voice-take identity
 *
 * A take is valid for a dialogue line only if it was synthesized from the same
 * text with the same voice profile. `voiceProfileRef` encodes both the voice id
 * and the speed (`kokoro:af_sky@1.0`), so a voice or speed change on an
 * unchanged line invalidates the take. Matching on text alone would replay the
 * old audio.
 *
 * Pure and dependency-free so page components can import it statically while
 * the engine stays behind dynamic imports (Law L8).
 */

export interface TakeIdentity {
  text: string;
  voiceProfileRef: string;
}

export function takeMatchesLine(take: TakeIdentity | undefined, line: TakeIdentity): boolean {
  return take !== undefined && take.text === line.text && take.voiceProfileRef === line.voiceProfileRef;
}
