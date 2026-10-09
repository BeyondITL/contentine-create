/**
 * engine/bridge — local-AI bridge (WS-11, R6).
 *
 * Detection layer for optional AI services running on the user's OWN machine
 * (Draw Things, ComfyUI). Law L2: this is pure enhancement — NO core creation
 * flow may depend on any of it. Detection is a short-timeout, fire-and-forget
 * probe run only on an explicit user action (a settings/device visit or a
 * "Detect" click), cached per session, never on startup, never blocking.
 *
 * Honesty (Law L1): states are reported exactly as measured. We never claim a
 * service is present that we could not reach, and we never surface a capability
 * (e.g. ToonCrafter) unless a compatible pipeline is actually detected.
 */

/** A local AI service the bridge knows how to probe. */
export type BridgeServiceId = 'draw-things' | 'comfyui';

/** Result of probing a single local service. Every state is an honest measurement. */
export type BridgeServiceState =
  | {
      /** The probe reached the service and it answered as expected. */
      status: 'detected';
      serviceId: BridgeServiceId;
      /** Base URL that answered (e.g. http://localhost:8188). */
      baseUrl: string;
      /** Version string only if the service's API actually reports one; else null. */
      version: string | null;
      /**
       * Capabilities the detected service reports that we can honestly surface.
       * Empty when the service is up but exposes no capability we recognise.
       */
      capabilities: BridgeCapability[];
      probedAt: number;
    }
  | {
      /** The probe ran to completion (or timed out / errored) without reaching the service. */
      status: 'not-detected';
      serviceId: BridgeServiceId;
      baseUrl: string;
      /** Why we could not confirm it — surfaced verbatim in the explainer, never hidden. */
      reason: BridgeMissReason;
      probedAt: number;
    }
  | {
      /** The user turned probing off, or the environment forbids it. No probe was attempted. */
      status: 'probe-disabled';
      serviceId: BridgeServiceId;
      baseUrl: string;
    };

/**
 * Why a probe did not confirm a service. These are the honest, distinguishable
 * outcomes — a CORS block (service likely up but not sharing headers) is NOT the
 * same as a connection refusal (service likely down), and we say which.
 */
export type BridgeMissReason =
  /** Nothing accepted the connection — the service is most likely not running. */
  | 'unreachable'
  /** The probe exceeded its short timeout budget. */
  | 'timeout'
  /**
   * The connection was made but the browser blocked reading the response
   * (no CORS header). The service may well be running — it just isn't sharing
   * its API with this origin. Actionable, so we say so.
   */
  | 'blocked-by-cors'
  /** Something answered but it did not look like the expected service API. */
  | 'unexpected-response';

/** An honestly-detected capability offered by a local service. */
export interface BridgeCapability {
  id: BridgeCapabilityId;
  /** Human label for the settings card. */
  label: string;
  /** Where it came from, e.g. "via your local ComfyUI". */
  via: string;
}

export type BridgeCapabilityId =
  /** ToonCrafter generative interpolation node present in the detected ComfyUI. */
  | 'tooncrafter'
  /** Generic image generation (Draw Things / ComfyUI txt2img-class endpoint). */
  | 'image-generation';

/** Per-service probe configuration. Defaults are the services' documented localhost ports. */
export interface BridgeServiceConfig {
  serviceId: BridgeServiceId;
  label: string;
  /** Default base URL; user-overridable in the settings card. */
  defaultBaseUrl: string;
  /** Short-hand of what the service is, for the "what is this" explainer. */
  blurb: string;
}

/** Options for a detection run. */
export interface BridgeProbeOptions {
  /** Override the base URL (from the user's saved value); falls back to the service default. */
  baseUrl?: string;
  /** Per-probe timeout budget in ms. Kept short so it can never feel like a hang. */
  timeoutMs?: number;
  /** Force a fresh probe even if this session already has a cached result. */
  force?: boolean;
  /** External abort (e.g. component unmount) — threaded to the leaf fetch (failure-patterns: no swallowed signal). */
  signal?: AbortSignal;
}
