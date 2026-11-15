// @vitest-environment jsdom
/**
 * AI-disclosure settings reads must survive blocked localStorage.
 *
 * `saveAiDisclosureSettings` already guards its writes, but the read path
 * used to call `localStorage.getItem` unguarded — in private modes,
 * sandboxed iframes, or with blocked site data, merely reading
 * `window.localStorage` throws a SecurityError, which propagated through
 * `getAiDisclosure()` and failed the whole export. These tests pin the
 * fallback to the SSR defaults and the normal resolution rules.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getAiDisclosure,
  getAiDisclosureSettings,
  DEFAULT_AI_DISCLOSURE,
} from './ai-disclosure';

const LS_PRESET_ID = 'contentine_ai_disclosure_preset';
const LS_CUSTOM_TEXT = 'contentine_ai_disclosure_custom';
const LS_ENABLED = 'contentine_ai_disclosure_enabled';

describe('ai-disclosure settings', () => {
  // Capture the real Storage before any test replaces it: vitest's jsdom env
  // installs localStorage as an own data property on the window, so deleting
  // an override does not bring it back — it must be restored by value.
  const realLocalStorage = window.localStorage;

  beforeEach(() => {
    unblockLocalStorage();
    window.localStorage.clear();
  });

  afterEach(() => {
    unblockLocalStorage();
  });

  function blockLocalStorage(): void {
    // Replace the own data property vitest installs (native getter is already
    // gone) with a throwing accessor — this is what a blocked-storage browser
    // does when page code reads window.localStorage.
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
      configurable: true,
    });
  }

  function unblockLocalStorage(): void {
    Object.defineProperty(window, 'localStorage', {
      value: realLocalStorage,
      writable: true,
      configurable: true,
    });
  }

  it('returns DEFAULT_AI_DISCLOSURE and does not throw when localStorage is blocked', () => {
    blockLocalStorage();
    expect(getAiDisclosureSettings()).toEqual({
      presetId: 'voice_script',
      customText: '',
      enabled: true,
    });
    expect(getAiDisclosure()).toBe(DEFAULT_AI_DISCLOSURE);
  });

  it('returns DEFAULT_AI_DISCLOSURE when nothing is stored', () => {
    expect(getAiDisclosure()).toBe(DEFAULT_AI_DISCLOSURE);
  });

  it("returns '' when enabled is stored as 'false'", () => {
    window.localStorage.setItem(LS_ENABLED, 'false');
    expect(getAiDisclosure()).toBe('');
  });

  it('falls back to the default when preset is custom with blank text', () => {
    window.localStorage.setItem(LS_PRESET_ID, 'custom');
    window.localStorage.setItem(LS_CUSTOM_TEXT, '   ');
    expect(getAiDisclosure()).toBe(DEFAULT_AI_DISCLOSURE);
  });

  it('returns the trimmed text when preset is custom with text', () => {
    window.localStorage.setItem(LS_PRESET_ID, 'custom');
    window.localStorage.setItem(LS_CUSTOM_TEXT, '  Made with AI voices.  ');
    expect(getAiDisclosure()).toBe('Made with AI voices.');
  });

  it('falls back to voice_script for an unknown stored preset id', () => {
    window.localStorage.setItem(LS_PRESET_ID, 'not-a-real-preset');
    expect(getAiDisclosureSettings().presetId).toBe('voice_script');
    expect(getAiDisclosure()).toBe(DEFAULT_AI_DISCLOSURE);
  });
});
