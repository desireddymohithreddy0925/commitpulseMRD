import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

// We only mock the two things that reach outside this process:
// the GitHub API call and the wall-clock time helper.
// calculateStreak and generateSVG run for real, giving us genuine end-to-end coverage.
vi.mock('../../../lib/github', () => ({
  fetchGitHubContributions: vi.fn(),
  getOrgDashboardData: vi.fn(),
}));

vi.mock('../../../utils/time', () => ({
  getSecondsUntilUTCMidnight: vi.fn(),
  getSecondsUntilMidnightInTimezone: vi.fn(),
}));

import { fetchGitHubContributions, getOrgDashboardData } from '../../../lib/github';
import { getSecondsUntilUTCMidnight, getSecondsUntilMidnightInTimezone } from '../../../utils/time';
import type { ContributionCalendar, ExtendedContributionData } from '../../../types';

// Two weeks of realistic data. The last day has 0 contributions so the streak
// is in "grace period" territory — a good baseline that exercises most code paths.
const mockCalendar: ContributionCalendar = {
  totalContributions: 10,
  weeks: [
    {
      contributionDays: [
        { contributionCount: 1, date: '2024-06-10' },
        { contributionCount: 2, date: '2024-06-11' },
        { contributionCount: 0, date: '2024-06-12' },
        { contributionCount: 3, date: '2024-06-13' },
        { contributionCount: 1, date: '2024-06-14' },
        { contributionCount: 0, date: '2024-06-15' },
        { contributionCount: 3, date: '2024-06-16' },
      ],
    },
    {
      contributionDays: [
        { contributionCount: 0, date: '2024-06-17' },
        { contributionCount: 0, date: '2024-06-18' },
        { contributionCount: 0, date: '2024-06-19' },
        { contributionCount: 0, date: '2024-06-20' },
        { contributionCount: 0, date: '2024-06-21' },
        { contributionCount: 0, date: '2024-06-22' },
        { contributionCount: 0, date: '2024-06-23' },
      ],
    },
  ],
};

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL('http://localhost/api/streak');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

describe('GET /api/streak', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // reset call counts so per-test call assertions are isolated
    vi.mocked(fetchGitHubContributions).mockResolvedValue({
      calendar: mockCalendar,
      repoContributions: [],
    } as unknown as ExtendedContributionData);
    vi.mocked(getOrgDashboardData).mockResolvedValue({
      profile: {
        username: 'octocat',
        name: 'The Octocat',
        avatarUrl: 'https://github.com/octocat.png',
        isPro: false,
        bio: 'Testing organization mock pipelines',
        location: 'San Francisco, CA',
        joinedDate: '2011-01-25',
        developerScore: 85,
        stats: { repositories: 10, followers: 2500, following: 9, stars: 450 },
      },
      stats: {
        totalCommits: 10,
        totalIssues: 2,
        totalPRs: 5,
        totalReviews: 1,
        totalDiscussions: 0,
        contributedTo: 3,
      },
      calendar: mockCalendar,
    } as unknown as Awaited<ReturnType<typeof getOrgDashboardData>>);
    // Fixed values so Cache-Control assertions don't depend on the real clock.
    vi.mocked(getSecondsUntilUTCMidnight).mockReturnValue(3600);
    vi.mocked(getSecondsUntilMidnightInTimezone).mockReturnValue(7200);
  });

  it('falls back to the default isometric view when an invalid view is provided', async () => {
    const request = new Request('http://localhost:3000/api/streak?user=octocat&view=invalid');
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('@keyframes grow-up');
  });

  describe('parameter validation', () => {
    it('returns 400 when grace=-1 is provided', async () => {
      const response = await GET(makeRequest({ user: 'octocat', grace: '-1' }));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.details.fieldErrors.grace[0]).toBe('grace must be an integer between 0 and 7');
    });

    it('returns 400 when grace exceeds max value', async () => {
      const response = await GET(makeRequest({ user: 'octocat', grace: '999' }));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.details.fieldErrors.grace[0]).toBe('grace must be an integer between 0 and 7');
    });

    it('returns 400 when days=0 is provided', async () => {
      const response = await GET(makeRequest({ user: 'octocat', days: '0' }));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe('Invalid parameters');
    });

    it('returns 400 when days is negative', async () => {
      const response = await GET(makeRequest({ user: 'octocat', days: '-5' }));
      expect(response.status).toBe(400);
    });

    it('returns 400 Bad Request when ?layout= is set to an unsupported format', async () => {
      const response = await GET(makeRequest({ user: 'octocat', layout: 'unsupported_layout' }));
      expect(response.status).toBe(400);
    });

    it('does not call the GitHub API when layout is invalid', async () => {
      await GET(makeRequest({ user: 'octocat', layout: 'unsupported_layout' }));
      expect(fetchGitHubContributions).not.toHaveBeenCalled();
    });

    it('returns 400 with a structured error body for unsupported_layout', async () => {
      const response = await GET(makeRequest({ user: 'octocat', layout: 'unsupported_layout' }));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe('Invalid parameters');
    });

    it('returns 400 Bad Request when ?layout= is set to an unsupported format (Variation 4)', async () => {
      const response = await GET(makeRequest({ user: 'octocat', layout: 'unsupported_layout' }));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.details.fieldErrors.layout[0]).toContain(
        'Invalid layout format. Supported values: default, compact, full.'
      );
    });

    it('returns 400 when the user parameter is missing', async () => {
      const response = await GET(makeRequest());
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe('Invalid parameters');
      expect(body.details).not.toBeNull();
      expect(typeof body.details).toBe('object');
      expect(Array.isArray(body.details)).toBe(false);
    });

    it('returns 400 when org parameter contains spaces and invalid characters', async () => {
      const response = await GET(
        makeRequest({ user: 'octocat', org: 'invalid_org_name_with_spaces' })
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.details.fieldErrors.org[0]).toBe('Invalid organization name format');
      expect(getOrgDashboardData).not.toHaveBeenCalled();
    });

    it('does not hit the GitHub API at all when user is missing', async () => {
      await GET(makeRequest());
      expect(fetchGitHubContributions).not.toHaveBeenCalled();
    });

    it('returns 400 for malformed GitHub usernames', async () => {
      const invalidUsers = ['http://localhost', 'harendra-', 'a--b', 'a'.repeat(40)];
      for (const user of invalidUsers) {
        const response = await GET(makeRequest({ user }));
        expect(response.status).toBe(400);
      }
      expect(fetchGitHubContributions).not.toHaveBeenCalled();
    });

    it('returns 400 when user contains spaces', async () => {
      const response = await GET(makeRequest({ user: 'john doe' }));
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.details.fieldErrors.user[0]).toContain('Invalid GitHub username');
    });

    it('returns 400 when user exceeds 39 characters', async () => {
      const response = await GET(makeRequest({ user: 'a'.repeat(40) }));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(JSON.stringify(body)).toContain('cannot exceed 39 characters');
    });

    it('returns 400 Bad Request and details indicating the username cannot exceed 39 characters when using NextRequest', async () => {
      const url = `http://localhost/api/streak?user=${'a'.repeat(40)}`;
      const request = new NextRequest(url);
      const response = await GET(request);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe('Invalid parameters');
      expect(body.details.fieldErrors.user[0]).toMatch(/cannot exceed 39 characters/);
    });

    it('returns 400 for invalid monthly badge dimensions', async () => {
      const invalidDimensionParams: Array<Record<string, string>> = [
        { width: 'abc' },
        { width: '-50' },
        { width: '1201' },
        { height: 'abc' },
        { height: '0' },
        { height: '801' },
      ];
      for (const params of invalidDimensionParams) {
        const response = await GET(makeRequest({ user: 'octocat', view: 'monthly', ...params }));
        expect(response.status).toBe(400);
      }
      expect(fetchGitHubContributions).not.toHaveBeenCalled();
    });

    it('returns 400 when grace is below the minimum value', async () => {
      const response = await GET(makeRequest({ user: 'octocat', grace: '-1' }));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe('Invalid parameters');
      expect(body.details.fieldErrors.grace[0]).toBe('grace must be an integer between 0 and 7');
      expect(fetchGitHubContributions).not.toHaveBeenCalled();
    });

    it('returns 400 for unsupported ?layout query parameter values (strict schema validation)', async () => {
      const response = await GET(
        new Request('http://localhost:3000/api/streak?user=octocat&layout=unsupported_layout')
      );
      expect(response.status).toBe(400);
    });

    it('returns 400 when an invalid theme value is provided and lists allowed themes', async () => {
      const response = await GET(makeRequest({ user: 'octocat', theme: 'nonexistent_theme_name' }));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe('Invalid parameters');
      expect(body.details.fieldErrors.theme).toBeDefined();
      const errorMessage = body.details.fieldErrors.theme[0];
      expect(errorMessage).toContain('Invalid theme');
      expect(errorMessage).toContain('Supported themes:');
      expect(errorMessage).toContain('auto');
      expect(errorMessage).toContain('random');
      expect(errorMessage).toContain('dark');
      expect(errorMessage).toContain('light');
      expect(fetchGitHubContributions).not.toHaveBeenCalled();
    });

    it('should return 200 OK and valid SVG when the optional repo query parameter is provided', async () => {
      const response = await GET(makeRequest({ user: 'octocat', repo: 'commitpulse' }));
      expect(response.status).toBe(200);
      const textOutput = await response.text();
      expect(textOutput).toContain('<svg');
    });

    it('should return 200 OK and valid SVG when the optional org query parameter is provided', async () => {
      const response = await GET(makeRequest({ user: 'octocat', org: 'vercel' }));
      expect(response.status).toBe(200);
      const textOutput = await response.text();
      expect(textOutput).toContain('<svg');
    });

    it('returns 400 when org contains invalid characters', async () => {
      const response = await GET(
        makeRequest({ user: 'octocat', org: 'invalid_org_name_with_spaces' })
      );
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.details.fieldErrors.org[0]).toBe('Invalid organization name format');
      expect(getOrgDashboardData).not.toHaveBeenCalled();
    });
  });

  describe('successful response', () => {
    it('returns 200 with SVG content type', async () => {
      const response = await GET(makeRequest({ user: 'octocat' }));
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    });

    it('returns a well-formed SVG body', async () => {
      const response = await GET(makeRequest({ user: 'octocat' }));
      const body = await response.text();
      expect(body).toContain('<svg');
      expect(body).toContain('viewBox');
      expect(body).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(body).toContain('</svg>');
    });

    it('returns valid SVG when mode=loc is given', async () => {
      const response = await GET(makeRequest({ user: 'octocat', mode: 'loc' }));
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
      const body = await response.text();
      expect(body).toContain('<svg');
    });

    it('forwards the username to fetchGitHubContributions', async () => {
      await GET(makeRequest({ user: 'octocat' }));
      expect(fetchGitHubContributions).toHaveBeenCalledWith('octocat', { bypassCache: false });
    });

    it('forwards grace parameter to fetchGitHubContributions', async () => {
      await GET(makeRequest({ user: 'octocat', grace: '2' }));
      expect(fetchGitHubContributions).toHaveBeenCalled();
    });

    it('embeds the username (uppercased) in the SVG title', async () => {
      const response = await GET(makeRequest({ user: 'octocat' }));
      const body = await response.text();
      expect(body).toContain('OCTOCAT');
    });

    it('should contain a <title> element with accessible label in the SVG response', async () => {
      const response = await GET(makeRequest({ user: 'octocat' }));
      const body = await response.text();
      expect(body).toContain('<title>');
      expect(body).toContain('Stats for');
    });
  });

  describe('edge cases for empty/private profiles', () => {
    it('Scenario 1: Normal active GitHub user', async () => {
      const response = await GET(makeRequest({ user: 'octocat' }));
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain('<svg');
    });

    it('Scenario 2 & 3: User with 0 public repositories or private profile (empty calendar)', async () => {
      vi.mocked(fetchGitHubContributions).mockResolvedValue({
        calendar: { totalContributions: 0, weeks: [] },
        repoContributions: [],
      } as unknown as ExtendedContributionData);

      const response = await GET(makeRequest({ user: 'private-user' }));
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain('<svg');
      expect(body).toContain('>0<');
    });

    it('Scenario 4: Nonexistent username', async () => {
      // Corrected: Handled error gracefully to prevent vitest unhandled rejection crash
      vi.mocked(fetchGitHubContributions).mockRejectedValue(
        new Error('GitHub user "nonexistent" not found')
      );

      const response = await GET(makeRequest({ user: 'nonexistent' }));
      expect(response.status).toBe(404);
      const body = await response.text();
      expect(body).toContain('<svg');
      expect(body).toContain('NOT FOUND');
    });

    it('Scenario 5: GitHub API failure', async () => {
      // Corrected: Handled error gracefully to prevent vitest unhandled rejection crash
      vi.mocked(fetchGitHubContributions).mockRejectedValue(new Error('API Rate Limit Exceeded'));

      const response = await GET(makeRequest({ user: 'octocat' }));
      expect(response.status).toBe(429);
      const body = await response.text();
      expect(body).toContain('<svg');
      expect(body).toContain('API RATE LIMIT');
    });
  });

  describe('cache-control header', () => {
    it('caches until UTC midnight by default, using the value from getSecondsUntilUTCMidnight', async () => {
      const response = await GET(makeRequest({ user: 'octocat' }));
      expect(response.headers.get('Cache-Control')).toBe(
        'public, s-maxage=3600, stale-while-revalidate=86400'
      );
    });

    it('reflects a different time value when the clock changes', async () => {
      vi.mocked(getSecondsUntilUTCMidnight).mockReturnValue(7200);
      const response = await GET(makeRequest({ user: 'octocat' }));
      expect(response.headers.get('Cache-Control')).toBe(
        'public, s-maxage=7200, stale-while-revalidate=86400'
      );
    });

    it('bypasses the cache entirely when ?refresh=true', async () => {
      const response = await GET(makeRequest({ user: 'octocat', refresh: 'true' }));
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
    });

    it('passes bypassCache=true when refresh=true', async () => {
      await GET(makeRequest({ user: 'octocat', refresh: 'true' }));
      expect(fetchGitHubContributions).toHaveBeenCalledWith('octocat', { bypassCache: true });
    });

    it('keeps normal caching when refresh is "false"', async () => {
      const response = await GET(makeRequest({ user: 'octocat', refresh: 'false' }));
      expect(response.headers.get('Cache-Control')).toContain('public');
    });

    it('keeps normal caching when refresh is "1" (not the exact string "true")', async () => {
      const response = await GET(makeRequest({ user: 'octocat', refresh: '1' }));
      expect(response.headers.get('Cache-Control')).toContain('public');
    });
  });

  describe('security headers', () => {
    it('sets a strict Content-Security-Policy with safe SVG styling rules', async () => {
      const response = await GET(makeRequest({ user: 'octocat' }));
      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("style-src 'unsafe-inline'");
      expect(csp).toContain('https://fonts.googleapis.com');
      expect(csp).not.toContain('script-src');
    });
  });

  describe('speed parameter', () => {
    it('accepts a valid integer speed like "3s" and passes it to the SVG', async () => {
      const response = await GET(makeRequest({ user: 'octocat', speed: '3s' }));
      const body = await response.text();
      expect(body).toContain('3s');
    });

    it('falls back to 8s for decimal values below minimum bound', async () => {
      const response = await GET(makeRequest({ user: 'octocat', speed: '1.5s' }));
      const body = await response.text();
      expect(body).toContain('8s');
    });

    it('falls back to 8s when the speed format is invalid (no unit)', async () => {
      const response = await GET(makeRequest({ user: 'octocat', speed: 'fast' }));
      const body = await response.text();
      expect(body).toContain('8s');
      expect(body).not.toContain('fast');
    });

    it('falls back to 8s when speed is a bare number without the "s" suffix', async () => {
      const response = await GET(makeRequest({ user: 'octocat', speed: '5' }));
      const body = await response.text();
      expect(body).toContain('8s');
    });

    it('falls back to 8s when speed=10 is provided without unit', async () => {
      const response = await GET(makeRequest({ user: 'octocat', speed: '10' }));
      const body = await response.text();
      expect(body).toContain('8s');
    });

    it('falls back to 8s when speed is below minimum bound', async () => {
      const response = await GET(makeRequest({ user: 'octocat', speed: '1s' }));
      const body = await response.text();
      expect(body).toContain('8s');
    });

    it('falls back to 8s when speed exceeds maximum bound', async () => {
      const response = await GET(makeRequest({ user: 'octocat', speed: '999s' }));
      const body = await response.text();
      expect(body).toContain('8s');
    });

    it('accepts the minimum boundary speed "2s"', async () => {
      const response = await GET(makeRequest({ user: 'octocat', speed: '2s' }));
      const body = await response.text();
      expect(body).toContain('2s');
    });

    it('accepts the maximum boundary speed "20s"', async () => {
      const response = await GET(makeRequest({ user: 'octocat', speed: '20s' }));
      const body = await response.text();
      expect(body).toContain('20s');
    });

    it('falls back to 8s when speed is a non-integer decimal like "2.0s"', async () => {
      const response = await GET(makeRequest({ user: 'octocat', speed: '2.0s' }));
      const body = await response.text();
      expect(body).toContain('8s');
      expect(body).not.toContain('2.0s');
    });
  });

  describe('scale parameter', () => {
    it('returns 200 when scale=log is given', async () => {
      const response = await GET(makeRequest({ user: 'octocat', scale: 'log' }));
      expect(response.status).toBe(200);
    });

    it('defaults to linear scale when an unknown scale value is given', async () => {
      const response = await GET(makeRequest({ user: 'octocat', scale: 'exponential' }));
      expect(response.status).toBe(200);
    });

    it('defaults to linear scale when scale=foo is given', async () => {
      const response = await GET(makeRequest({ user: 'octocat', scale: 'foo' }));
      expect(response.status).toBe(200);
    });

    it('produces different SVG output for scale=log versus scale=linear with mixed contribution counts', async () => {
      vi.mocked(fetchGitHubContributions).mockResolvedValue({
        calendar: {
          totalContributions: 203,
          weeks: [
            {
              contributionDays: [
                { contributionCount: 1, date: '2024-06-10' },
                { contributionCount: 5, date: '2024-06-11' },
                { contributionCount: 20, date: '2024-06-12' },
                { contributionCount: 100, date: '2024-06-13' },
                { contributionCount: 50, date: '2024-06-14' },
                { contributionCount: 5, date: '2024-06-15' },
                { contributionCount: 1, date: '2024-06-16' },
              ],
            },
          ],
        },
        repoContributions: [],
      } as unknown as ExtendedContributionData);

      const linearResponse = await GET(makeRequest({ user: 'octocat', scale: 'linear' }));
      const logResponse = await GET(makeRequest({ user: 'octocat', scale: 'log' }));
      const linearBody = await linearResponse.text();
      const logBody = await logResponse.text();

      expect(linearResponse.status).toBe(200);
      expect(logResponse.status).toBe(200);
      expect(linearBody).not.toBe(logBody);
    });
  });

  describe('year parameter', () => {
    it('accepts a valid 4-digit year', async () => {
      const response = await GET(makeRequest({ user: 'octocat', year: '2024' }));
      expect(response.status).toBe(200);
    });

    it('passes correct from/to range when ?year=2023 is provided', async () => {
      await GET(makeRequest({ user: 'octocat', year: '2023' }));
      expect(fetchGitHubContributions).toHaveBeenCalledWith('octocat', {
        bypassCache: false,
        from: '2023-01-01T00:00:00Z',
        to: '2023-12-31T23:59:59Z',
      });
    });

    it('passes correct from/to range when ?year=2008 is provided', async () => {
      await GET(makeRequest({ user: 'octocat', year: '2008' }));
      expect(fetchGitHubContributions).toHaveBeenCalledWith('octocat', {
        bypassCache: false,
        from: '2008-01-01T00:00:00Z',
        to: '2008-12-31T23:59:59Z',
      });
    });

    it('returns 400 when custom from date is after custom to date', async () => {
      const response = await GET(
        makeRequest({ user: 'octocat', from: '2025-12-31', to: '2025-01-01' })
      );
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.details.fieldErrors.to[0]).toContain(
        '"to" date must be after or equal to "from" date'
      );
      expect(fetchGitHubContributions).not.toHaveBeenCalled();
    });

    it('functions normally when the year parameter is missing', async () => {
      const response = await GET(makeRequest({ user: 'octocat' }));
      expect(response.status).toBe(200);
    });

    it('returns 400 for invalid year format', async () => {
      const response = await GET(makeRequest({ user: 'octocat', year: 'abcd' }));
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.details.fieldErrors.year[0]).toContain('GitHub was founded in 2008');
    });

    it('returns 400 for malformed numeric year', async () => {
      const response = await GET(makeRequest({ user: 'octocat', year: '100000' }));
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.details.fieldErrors.year[0]).toContain('GitHub was founded in 2008');
    });

    it('returns 400 for years before GitHub existed', async () => {
      const response = await GET(makeRequest({ user: 'octocat', year: '1999' }));
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.details.fieldErrors.year[0]).toContain('GitHub was founded in 2008');
    });

    it('returns 400 for the year=2007(before GitHub was founded)', async () => {
      const response = await GET(makeRequest({ user: 'octocat', year: '2007' }));
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.details.fieldErrors.year[0]).toContain('GitHub was founded in 2008');
    });

    it('returns 400 for future years', async () => {
      const futureYear = (new Date().getFullYear() + 1).toString();
      const response = await GET(makeRequest({ user: 'octocat', year: futureYear }));
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.details.fieldErrors.year[0]).toContain('GitHub was founded in 2008');
    });

    it('accepts year=2008 (the earliest valid year)', async () => {
      const response = await GET(makeRequest({ user: 'octocat', year: '2008' }));
      expect(response.status).toBe(200);
    });

    it('accepts the current year', async () => {
      const currentYear = new Date().getFullYear().toString();
      const response = await GET(makeRequest({ user: 'octocat', year: currentYear }));
      expect(response.status).toBe(200);
    });

    describe('date parameter', () => {
      it('returns 400 when an invalid ISO8601 calendar date format like "2026-15-40" is supplied', async () => {
        const response = await GET(makeRequest({ user: 'octocat', date: '2026-15-40' }));
        const body = await response.json();
        expect(response.status).toBe(400);
        expect(body.details.fieldErrors.date[0]).toContain('Invalid "date" format');
      });

      it('returns 400 when an invalid ISO8601 calendar date format like "2026-15-40" is supplied (Variation 4)', async () => {
        const response = await GET(makeRequest({ user: 'octocat', date: '2026-15-40' }));
        const body = await response.json();
        expect(response.status).toBe(400);
        expect(body.details.fieldErrors.date[0]).toContain('Invalid "date" format. Use ISO 8601.');
      });
    });
  });

  describe('radius parameter', () => {
    it('applies radius=16 to the SVG background rect', async () => {
      const response = await GET(makeRequest({ user: 'octocat', radius: '16' }));
      const body = await response.text();
      expect(body).toContain('rx="16"');
    });

    it('applies radius=0 to the SVG background rect', async () => {
      const response = await GET(makeRequest({ user: 'octocat', radius: '0' }));
      const body = await response.text();
      expect(body).toContain('rx="0"');
    });

    it('clamps radius values above the maximum limit', async () => {
      const response = await GET(makeRequest({ user: 'octocat', radius: '200' }));
      const body = await response.text();
      expect(body).toContain('rx="50"');
    });

    it('clamps negative radius to 0', async () => {
      const response = await GET(makeRequest({ user: 'octocat', radius: '-5' }));
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(body).toContain('rx="0"');
    });

    it('handles non-numeric radius gracefully', async () => {
      const response = await GET(makeRequest({ user: 'octocat', radius: 'abc' }));
      expect(response.status).toBe(200);
    });
  });

  describe('theme parameter', () => {
    it('returns 200 for a valid known theme like "neon"', async () => {
      const response = await GET(makeRequest({ user: 'octocat', theme: 'neon' }));
      expect(response.status).toBe(200);
    });

    it('returns SVG content type for theme=neon', async () => {
      const response = await GET(makeRequest({ user: 'octocat', theme: 'neon' }));
      expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    });

    it('returns SVG content type for theme=dracula', async () => {
      const response = await GET(makeRequest({ user: 'octocat', theme: 'dracula' }));
      expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    });

    it('returns SVG content type for theme=auto', async () => {
      const response = await GET(makeRequest({ user: 'octocat', theme: 'auto' }));
      expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    });

    it('returns auto-theme SVG markup with dark-mode CSS variables when theme=auto', async () => {
      const response = await GET(makeRequest({ user: 'octocat', theme: 'auto' }));
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(body).toContain('prefers-color-scheme: dark');
      expect(body).toContain('--cp-bg');
    });

    it('returns 400 Bad Request listing allowed themes when an invalid theme is provided', async () => {
      const response = await GET(makeRequest({ user: 'octocat', theme: 'nonexistent_theme_name' }));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe('Invalid parameters');
      const fieldError = body.details.fieldErrors.theme[0];
      expect(fieldError).toContain('Invalid theme. Supported themes:');
      expect(fieldError).toContain('dark');
      expect(fieldError).toContain('light');
      expect(fieldError).toContain('neon');
    });
  });
});
