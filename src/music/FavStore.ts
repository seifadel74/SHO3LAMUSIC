import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Snowflake } from 'discord.js';
import { Source } from '../types.js';

export interface FavTrack {
  title: string;
  url: string;
  duration: number;
  thumbnail: string;
  source: Source;
}

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const filePath = join(dataDir, 'favorites.json');
const favorites = new Map<Snowflake, FavTrack[]>();

export function loadFavorites(): void {
  try {
    if (!existsSync(filePath)) return;
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    for (const [userId, tracks] of Object.entries(data)) {
      favorites.set(userId, tracks as FavTrack[]);
    }
  } catch {}
}

export function saveFavorites(): void {
  try {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    const obj: Record<string, FavTrack[]> = {};
    for (const [userId, tracks] of favorites) {
      if (tracks.length > 0) obj[userId] = tracks;
    }
    writeFileSync(filePath, JSON.stringify(obj), 'utf-8');
  } catch {}
}

export function getUserFavorites(userId: Snowflake): FavTrack[] {
  return favorites.get(userId) ?? [];
}

export function addFavorite(userId: Snowflake, track: FavTrack): number {
  const list = getUserFavorites(userId);
  if (list.some((t) => t.url === track.url)) return list.length;
  list.push(track);
  favorites.set(userId, list);
  saveFavorites();
  return list.length;
}

export function removeFavorite(userId: Snowflake, index: number): FavTrack | null {
  const list = getUserFavorites(userId);
  if (index < 0 || index >= list.length) return null;
  const [removed] = list.splice(index, 1);
  favorites.set(userId, list);
  saveFavorites();
  return removed;
}
