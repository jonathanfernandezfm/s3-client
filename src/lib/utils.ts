import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function getFileExtension(filename: string): string {
  const ext = filename.split(".").pop();
  return ext ? ext.toLowerCase() : "";
}

const PREVIEW_EXTENSIONS = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'],
  pdf:   ['pdf'],
  video: ['mp4', 'webm', 'mov', 'm4v', 'ogv'],
  audio: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'],
  text:  [
    'txt', 'md', 'log', 'json', 'yaml', 'yml', 'xml', 'csv', 'tsv', 'toml', 'ini',
    'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs', 'java', 'kt',
    'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'swift', 'sh', 'bash', 'zsh', 'sql',
    'html', 'htm', 'css', 'scss', 'sass', 'less', 'env', 'gitignore', 'dockerfile',
  ],
} as const;

export type PreviewKind = keyof typeof PREVIEW_EXTENSIONS;

export function getPreviewKind(filename: string): PreviewKind | null {
  const ext = getFileExtension(filename);
  for (const kind in PREVIEW_EXTENSIONS) {
    if ((PREVIEW_EXTENSIONS[kind as PreviewKind] as readonly string[]).includes(ext)) {
      return kind as PreviewKind;
    }
  }
  return null;
}

export function isImageFile(filename: string): boolean {
  return getPreviewKind(filename) === 'image';
}
