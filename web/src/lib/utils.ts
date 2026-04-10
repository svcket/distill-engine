import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parses ISO 8601 duration strings (e.g., PT16M25S) into total seconds.
 */
export function parseIsoDuration(iso8601: string): number {
  if (!iso8601 || !iso8601.startsWith('PT')) return 0;
  
  const matches = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!matches) return 0;
  
  const h = parseInt(matches[1] || '0');
  const m = parseInt(matches[2] || '0');
  const s = parseInt(matches[3] || '0');
  
  return (h * 3600) + (m * 60) + s;
}

/**
 * Formats seconds into a human-readable string (M:SS or H:MM:SS).
 */
export function formatDuration(seconds: number | string | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds === "—") return "—";
  
  let totalSeconds = 0;
  if (typeof seconds === 'string') {
    if (seconds.startsWith('PT')) {
      totalSeconds = parseIsoDuration(seconds);
    } else {
      totalSeconds = parseInt(seconds);
    }
  } else {
    totalSeconds = Math.floor(seconds);
  }
  
  if (isNaN(totalSeconds) || totalSeconds <= 0) return "—";
  
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}
