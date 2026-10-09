import { create } from 'zustand';
import type { DeviceProfile } from '@/engine/device-scanner';

interface DeviceState {
  profile: DeviceProfile | null;
  isScanning: boolean;
  error: string | null;

  /** Run device scan (async, non-blocking). */
  scan: () => Promise<void>;
  /** Force a fresh re-scan (ignores cache). */
  rescan: () => Promise<void>;
  /** Set profile directly (e.g. from cache on startup). */
  setProfile: (p: DeviceProfile) => void;
}

export const useDeviceStore = create<DeviceState>((set) => ({
  profile: null,
  isScanning: false,
  error: null,

  scan: async () => {
    set({ isScanning: true, error: null });
    try {
      const { deviceScanner } = await import('@/engine/device-scanner');
      const profile = await deviceScanner.getOrScan();
      set({ profile, isScanning: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Device scan failed', isScanning: false });
    }
  },

  rescan: async () => {
    set({ isScanning: true, error: null });
    try {
      const { deviceScanner } = await import('@/engine/device-scanner');
      deviceScanner.clearCache();
      const profile = await deviceScanner.scan();
      set({ profile, isScanning: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Device scan failed', isScanning: false });
    }
  },

  setProfile: (profile) => set({ profile }),
}));
