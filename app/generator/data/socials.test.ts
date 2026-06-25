import { describe, it, expect } from 'vitest';
import { resolveSocialUrl } from './socials';
import type { Social } from '../types';

describe('resolveSocialUrl', () => {
  const mockTiktok: Social = {
    id: 'tiktok',
    name: 'TikTok',
    category: 'Social Media',
    iconUrl: '...',
    type: 'simpleicon',
    siSlug: 'tiktok',
    baseUrl: 'https://tiktok.com/@',
    placeholder: 'e.g. https://tiktok.com/@username',
  };

  const mockGithub: Social = {
    id: 'github',
    name: 'GitHub',
    category: 'Developer',
    iconUrl: '...',
    type: 'simpleicon',
    siSlug: 'github',
    baseUrl: 'https://github.com/',
    placeholder: 'e.g. https://github.com/username',
  };

  const mockEmail: Social = {
    id: 'email',
    name: 'Email',
    category: 'Contact',
    iconUrl: '...',
    type: 'simpleicon',
    siSlug: 'maildotru',
    baseUrl: 'mailto:',
    placeholder: 'e.g. hello@example.com',
  };

  it('returns empty string for falsy input', () => {
    expect(resolveSocialUrl(mockTiktok, '')).toBe('');
    expect(resolveSocialUrl(mockTiktok, '   ')).toBe('');
  });

  it('handles email specifically by prepending mailto:', () => {
    expect(resolveSocialUrl(mockEmail, 'test@example.com')).toBe('mailto:test@example.com');
    expect(resolveSocialUrl(mockEmail, 'mailto:test@example.com')).toBe('mailto:test@example.com');
  });

  it('returns the input directly if it already contains http:// or https://', () => {
    expect(resolveSocialUrl(mockTiktok, 'https://tiktok.com/@myhandle')).toBe(
      'https://tiktok.com/@myhandle'
    );
    expect(resolveSocialUrl(mockGithub, 'http://github.com/johndoe')).toBe(
      'http://github.com/johndoe'
    );
  });

  it('strips leading @ symbol when baseUrl ends with @ to prevent duplication', () => {
    expect(resolveSocialUrl(mockTiktok, '@myhandle')).toBe('https://tiktok.com/@myhandle');
  });

  it('concatenates correctly when input is just the username and baseUrl ends with @', () => {
    expect(resolveSocialUrl(mockTiktok, 'myhandle')).toBe('https://tiktok.com/@myhandle');
  });

  it('concatenates correctly when input is just the username and baseUrl does NOT end with @', () => {
    expect(resolveSocialUrl(mockGithub, 'johndoe')).toBe('https://github.com/johndoe');
  });

  it('does NOT strip leading @ if baseUrl does NOT end with @ (e.g. literal @ in username for some reason)', () => {
    expect(resolveSocialUrl(mockGithub, '@johndoe')).toBe('https://github.com/@johndoe');
  });
});
