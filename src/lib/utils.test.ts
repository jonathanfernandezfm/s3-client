import { describe, it, expect } from 'vitest';
import { getPreviewKind, isImageFile, formatDate, formatNumber } from './utils';

describe('getPreviewKind', () => {
  it('returns image for .JPG (case-insensitive)', () => {
    expect(getPreviewKind('photo.JPG')).toBe('image');
  });

  it('returns text for .md', () => {
    expect(getPreviewKind('readme.md')).toBe('text');
  });

  it('returns pdf for .pdf', () => {
    expect(getPreviewKind('report.pdf')).toBe('pdf');
  });

  it('returns video for .mp4', () => {
    expect(getPreviewKind('clip.mp4')).toBe('video');
  });

  it('returns audio for .mp3', () => {
    expect(getPreviewKind('voice.mp3')).toBe('audio');
  });

  it('returns null for .zip', () => {
    expect(getPreviewKind('archive.zip')).toBeNull();
  });

  it('returns null for file with no extension', () => {
    expect(getPreviewKind('noextension')).toBeNull();
  });

  it('returns pdf for multi-dot filename', () => {
    expect(getPreviewKind('multi.dot.pdf')).toBe('pdf');
  });
});

describe('isImageFile', () => {
  it('returns true for .png', () => {
    expect(isImageFile('a.png')).toBe(true);
  });

  it('returns false for .pdf (regression)', () => {
    expect(isImageFile('a.pdf')).toBe(false);
  });
});

describe('formatNumber', () => {
  it('formats large numbers with en-US thousand separators', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('formats zero', () => {
    expect(formatNumber(0)).toBe('0');
  });
});

describe('formatDate', () => {
  it('contains the year for a known input', () => {
    expect(formatDate('2026-06-05T14:30:00.000Z')).toContain('2026');
  });

  it('contains the month abbreviation for a known input', () => {
    expect(formatDate('2026-06-05T14:30:00.000Z')).toContain('Jun');
  });
});
