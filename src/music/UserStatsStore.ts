import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Snowflake } from 'discord.js';

export interface TrackPlay {
  title: string;
  url: string;
  duration: number;
  timestamp: number;
}

export interface UserStats {
  totalTracks: number;
  totalDuration: number;
  trackCounts: Record<string, number>;
  lastPlayed: TrackPlay[];
}

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const filePath = join(dataDir, 'userstats.json');
let userStats = new Map<Snowflake, UserStats>();

export function loadUserStats(): void {
  try {
    if (!existsSync(filePath)) return;
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    for (const [userId, stats] of Object.entries(data)) {
      userStats.set(userId, stats as UserStats);
    }
  } catch {}
}

function saveUserStats(): void {
  try {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    const obj: Record<string, UserStats> = {};
    for (const [userId, stats] of userStats) {
      if (stats.totalTracks > 0) obj[userId] = stats;
    }
    writeFileSync(filePath, JSON.stringify(obj), 'utf-8');
  } catch {}
}

export function trackPlayedByUser(userId: Snowflake, title: string, url: string, duration: number): void {
  let stats = userStats.get(userId);
  if (!stats) {
    stats = { totalTracks: 0, totalDuration: 0, trackCounts: {}, lastPlayed: [] };
  }
  stats.totalTracks++;
  stats.totalDuration += duration;
  stats.trackCounts[url] = (stats.trackCounts[url] ?? 0) + 1;
  stats.lastPlayed.unshift({ title, url, duration, timestamp: Date.now() });
  if (stats.lastPlayed.length > 20) stats.lastPlayed.length = 20;
  userStats.set(userId, stats);
  saveUserStats();
}

export function getUserStats(userId: Snowflake): UserStats | null {
  return userStats.get(userId) ?? null;
}
