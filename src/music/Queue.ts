import { LoopMode, type GuildQueue, type Track } from '../types.js';

export function createQueue(): GuildQueue {
  return {
    tracks: [],
    currentIndex: -1,
    loopMode: LoopMode.None,
    volume: 50,
  };
}

export function addTrack(queue: GuildQueue, track: Track): number {
  queue.tracks.push(track);
  return queue.tracks.length;
}

export function removeTrack(queue: GuildQueue, index: number): Track | null {
  if (index < 0 || index >= queue.tracks.length) return null;
  const [removed] = queue.tracks.splice(index, 1);
  if (index <= queue.currentIndex) queue.currentIndex--;
  return removed;
}

export function skipTrack(queue: GuildQueue): Track | null {
  if (queue.tracks.length === 0) return null;

  if (queue.loopMode === LoopMode.Track) {
    return queue.tracks[queue.currentIndex] ?? null;
  }

  const nextIndex = queue.currentIndex + 1;
  if (nextIndex < queue.tracks.length) {
    queue.currentIndex = nextIndex;
    return queue.tracks[nextIndex];
  }

  if (queue.loopMode === LoopMode.Queue) {
    queue.currentIndex = 0;
    return queue.tracks[0];
  }

  queue.currentIndex = -1;
  return null;
}

export function jumpTo(queue: GuildQueue, index: number): Track | null {
  if (index < 0 || index >= queue.tracks.length) return null;
  queue.currentIndex = index;
  return queue.tracks[index];
}

export function shuffleQueue(queue: GuildQueue): void {
  if (queue.tracks.length < 3) return;
  const current = queue.tracks[queue.currentIndex];
  const rest = queue.tracks.filter((_, i) => i !== queue.currentIndex);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  queue.tracks = [current, ...rest];
  queue.currentIndex = 0;
}

export function clearQueue(queue: GuildQueue): void {
  queue.tracks = [];
  queue.currentIndex = -1;
}
