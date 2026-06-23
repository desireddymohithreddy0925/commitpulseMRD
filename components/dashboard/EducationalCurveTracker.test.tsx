import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EducationalCurveTracker from './EducationalCurveTracker';

// Safely mock global fetch without using 'any'
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('EducationalCurveTracker Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the animated pulse skeleton initially', () => {
    // FIX: Provide a resolving promise so the CI runner doesn't hang forever.
    // The initial render is synchronous, so we will still catch the skeleton state!
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ success: true, data: null }),
    });

    const { container } = render(<EducationalCurveTracker username="jalisa2106" />);
    // Check for the skeleton container class
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders the data successfully after API fetch', async () => {
    const mockPayload = {
      success: true,
      data: {
        totalStudyDays: 14,
        primaryDomain: 'Applied AI & Data Mining',
        timeline: [{ date: '2026-04-15', totalDailyCommits: 5, domains: {} }],
      },
    };

    mockFetch.mockResolvedValueOnce({
      json: async () => mockPayload,
    });

    render(<EducationalCurveTracker username="jalisa2106" />);

    // Wait for the skeleton to disappear and text to appear
    await waitFor(() => {
      expect(screen.getByText('Applied AI & Data Mining')).toBeInTheDocument();
      expect(screen.getByText('14')).toBeInTheDocument(); // The active days count
      expect(screen.getByText('Active Study Days')).toBeInTheDocument();
    });
  });

  it('fails silently/renders nothing on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ success: false, error: 'User not found' }),
    });

    const { container } = render(<EducationalCurveTracker username="unknown_user" />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
