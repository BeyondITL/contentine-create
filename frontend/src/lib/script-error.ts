/**
 * Contentine Create — user-facing reason a script generation failed (SA-33).
 *
 * Shared by `editor-store` and `avatar-store` deliberately: the July voice-list
 * post-mortem (§4.2 of the P0 close-out) traced three re-sightings of one bug to
 * the same text living in two places, so this sentence lives in exactly one.
 *
 * The backend already returns a finished, user-ready sentence — `ScriptController`
 * answers `{"error":"Script generation failed. Please try again."}` — which the
 * frontend used to throw away unread. Prefer it verbatim; only supply our own
 * copy when the request never reached a server and there is no message to show.
 */

import { APIError } from '@/lib/api';

/** Turn any script-generation rejection into a sentence worth showing a user. */
export function scriptErrorMessage(err: unknown): string {
  if (err instanceof APIError && err.message.trim()) return err.message;
  // No response at all: offline, DNS, CORS, or the server is down. `TypeError:
  // Failed to fetch` is true but useless, so this is the one case we phrase.
  return 'Could not reach the script service. Check your connection and try again.';
}
