/**
 * engine/bridge — public API (WS-11, R6).
 *
 * Optional local-AI bridge: detect AI services on the user's machine and expose
 * an optional anime post-filter. Nothing here is imported by a core creation
 * flow (Law L2) — if every probe fails and WebGPU is absent, core creation is
 * unaffected. Import dynamically (Law L8).
 */

export type {
  BridgeServiceId,
  BridgeServiceState,
  BridgeMissReason,
  BridgeCapability,
  BridgeCapabilityId,
  BridgeServiceConfig,
  BridgeProbeOptions,
} from './types';

export {
  BRIDGE_SERVICES,
  listBridgeServices,
  detectService,
  detectAll,
  getCachedState,
  clearSessionCache,
  isProbeEnabled,
  setProbeEnabled,
  getBaseUrl,
  setBaseUrl,
} from './detector';

export {
  isAnimeFilterSupported,
  createAnimeFilter,
  DEFAULT_ANIME_PARAMS,
  ANIME4K_DETERMINISM_NOTE,
} from './anime4k-filter';
export type { AnimeFilter, AnimeFilterParams } from './anime4k-filter';
