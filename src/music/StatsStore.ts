import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Snowflake } from 'discord.js';

export interface BotStats {
  totalTracks: number;
  totalDuration: number;
  userRequests: Record<Snowflake, number>;
}

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const filePath = join(dataDir, 'stats.json');
let stats: BotStats = { totalTracks: 0, totalDuration: 0, userRequests: {} };

export function loadStats(): void {
  try {
    if (!existsSync(filePath)) return;
    stats = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {}
}

export function saveStats(): void {
  try {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    writeFileSync(filePath, JSON.stringify(stats), 'utf-8');
  } catch {}
}

export function trackPlayed(duration: number, userId: Snowflake): void {
  stats.totalTracks++;
  stats.totalDuration += duration;
  stats.userRequests[userId] = (stats.userRequests[userId] ?? 0) + 1;
  saveStats();
}

export function getStats(): BotStats {
  return stats;
}
