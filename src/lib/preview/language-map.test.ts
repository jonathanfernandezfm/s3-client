import { describe, it, expect } from 'vitest';
import { inferLanguage } from './language-map';

describe('inferLanguage', () => {
  it('returns typescript for .ts files', () => {
    expect(inferLanguage('app.ts')).toBe('typescript');
  });

  it('returns bash for .sh files', () => {
    expect(inferLanguage('script.sh')).toBe('bash');
  });

  it('returns docker for Dockerfile (no extension)', () => {
    expect(inferLanguage('Dockerfile')).toBe('docker');
  });

  it('returns null for unknown extension', () => {
    expect(inferLanguage('mystery.xyz')).toBeNull();
  });

  it('returns null for plain .txt files', () => {
    expect(inferLanguage('plain.txt')).toBeNull();
  });
});
