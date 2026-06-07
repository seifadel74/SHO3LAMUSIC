import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { type GuildQueue, type GuildQueues, type Track, LoopMode, Source } from '../types.js';
import { getExtractorForSource } from '../extractors/ExtractorRouter.js';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const filePath = join(dataDir, 'queues.json');

interface SerializableTrack {
  title: string;
  url: string;
  duration: number;
  thumbnail: string;
  requestedBy: string;
  source: Source;
}

interface SerializableQueue {
  tracks: SerializableTrack[];
  currentIndex: number;
  loopMode: LoopMode;
  volume: number;
}

function toSerializable(track: Track): SerializableTrack {
  return {
    title: track.title,
    url: track.url,
    duration: track.duration,
    thumbnail: track.thumbnail,
    requestedBy: track.requestedBy,
    source: track.source,
  };
}

function toTrack(s: SerializableTrack): Track {
  return {
    ...s,
    stream: async () => getExtractorForSource(s.source).stream(s.url),
  };
}

export function saveQueues(queues: GuildQueues): void {
  try {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    const obj: Record<string, SerializableQueue> = {};
    for (const [guildId, queue] of queues) {
      if (queue.tracks.length === 0) continue;
      obj[guildId] = {
        tracks: queue.tracks.map(toSerializable),
        currentIndex: queue.currentIndex,
        loopMode: queue.loopMode,
        volume: queue.volume,
      };
    }
    writeFileSync(filePath, JSON.stringify(obj), 'utf-8');
  } catch {}
}

export function loadQueues(queues: GuildQueues): void {
  try {
    if (!existsSync(filePath)) return;
    const data = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, SerializableQueue>;
    for (const [guildId, sq] of Object.entries(data)) {
      queues.set(guildId, {
        tracks: sq.tracks.map(toTrack),
        currentIndex: sq.currentIndex,
        loopMode: sq.loopMode,
        volume: sq.volume,
      });
    }
  } catch {
    // Corrupted file — ignore
  }
}
