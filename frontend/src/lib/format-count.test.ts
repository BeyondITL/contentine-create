/**
 * formatCount: unit selection happens after rounding, so values just below
 * a unit boundary that round up to it (999_950+) render in the next unit.
 */
import { describe, it, expect } from 'vitest';
import { formatCount } from './format-count';

describe('formatCount', () => {
  it('renders sub-thousand counts verbatim', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
  });

  it('renders thousands with one decimal', () => {
    expect(formatCount(1000)).toBe('1.0K');
    expect(formatCount(1500)).toBe('1.5K');
  });

  it('keeps 999_949 in K', () => {
    expect(formatCount(999_949)).toBe('999.9K');
  });

  it('moves counts that round up to 1000.0K into M', () => {
    expect(formatCount(999_950)).toBe('1.0M');
    expect(formatCount(999_999)).toBe('1.0M');
  });

  it('renders millions with one decimal', () => {
    expect(formatCount(1_000_000)).toBe('1.0M');
    expect(formatCount(2_500_000)).toBe('2.5M');
  });
});
