import { getFileExtension } from '@/lib/utils';

const LANGUAGE_MAP: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  swift: 'swift',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  sql: 'sql',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'markup',
  html: 'markup',
  htm: 'markup',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  md: 'markdown',
  dockerfile: 'docker',
};

export function inferLanguage(filename: string): string | null {
  const ext = getFileExtension(filename);
  return LANGUAGE_MAP[ext] ?? null;
}
