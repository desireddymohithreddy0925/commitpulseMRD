import { describe, it, expect } from 'vitest';
import { themes } from '../themes';
import { generateSVG } from '../generator';
import type { BadgeParams, ContributionCalendar, StreakStats } from '../../../types';
import { contrastRatio } from './test-utils';

describe('tokyo_night_blue theme', () => {
  it('exists as a key in the themes object', () => {
    expect(themes).toHaveProperty('tokyo_night_blue');
  });

  it('has valid 6-digit hex color strings (without #) for bg, text, and accent', () => {
    const hexRegex = /^[0-9a-fA-F]{6}$/;

    expect(themes.tokyo_night_blue.bg).toMatch(hexRegex);
    expect(themes.tokyo_night_blue.text).toMatch(hexRegex);
    expect(themes.tokyo_night_blue.accent).toMatch(hexRegex);
  });

  it('matches the defined tokyo_night_blue color values for the design spec', () => {
    expect(themes.tokyo_night_blue.bg).toBe('1a1b26');
    expect(themes.tokyo_night_blue.text).toBe('c0caf5');
    expect(themes.tokyo_night_blue.accent).toBe('7aa2f7');
  });

  it('contains the specific tokyo_night_blue hex colors in generated SVG output', () => {
    const mockStats: StreakStats = {
      currentStreak: 5,
      longestStreak: 10,
      totalContributions: 100,
      todayDate: '2024-06-12',
    };
    const mockCalendar: ContributionCalendar = {
      totalContributions: 10,
      weeks: [
        {
          contributionDays: [
            { contributionCount: 5, date: '2024-06-11' },
            { contributionCount: 5, date: '2024-06-12' },
          ],
        },
      ],
    };
    const tokyoNightParams: BadgeParams = {
      user: 'testuser',
      bg: themes.tokyo_night_blue.bg,
      text: themes.tokyo_night_blue.text,
      accent: themes.tokyo_night_blue.accent,
      speed: '8s',
      scale: 'linear',
    };

    const svg = generateSVG(mockStats, tokyoNightParams, mockCalendar);

    expect(svg).toContain(`#${themes.tokyo_night_blue.bg}`);
    expect(svg).toContain(`#${themes.tokyo_night_blue.text}`);
    expect(svg).toContain(`#${themes.tokyo_night_blue.accent}`);
  });

  it('provides sufficient WCAG AA contrast between background and text', () => {
    const ratio = contrastRatio(themes.tokyo_night_blue.bg, themes.tokyo_night_blue.text);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
