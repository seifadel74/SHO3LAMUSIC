import { Snowflake } from 'discord.js';
import { Message } from 'discord.js';
import { type GuildQueue, type GuildQueues, type Track, LoopMode } from '../types.js';
import { createQueue, addTrack, removeTrack, skipTrack, jumpTo, shuffleQueue, clearQueue } from './Queue.js';
import { loadQueues, saveQueues } from './QueueStore.js';

const queues: GuildQueues = new Map();
const nowPlayingMessages = new Map<Snowflake, Message>();

export function getQueue(guildId: Snowflake): GuildQueue {
  let queue = queues.get(guildId);
  if (!queue) {
    queue = createQueue();
    queues.set(guildId, queue);
  }
  return queue;
}

export function deleteQueue(guildId: Snowflake): void {
  queues.delete(guildId);
  saveQueues(queues);
}

export function setNowPlayingMessage(guildId: Snowflake, message: Message): void {
  nowPlayingMessages.set(guildId, message);
}

export function getNowPlayingMessage(guildId: Snowflake): Message | undefined {
  return nowPlayingMessages.get(guildId);
}

export function deleteNowPlayingMessage(guildId: Snowflake): void {
  nowPlayingMessages.delete(guildId);
}

export function initQueues(): void {
  loadQueues(queues);
}

export { addTrack, removeTrack, skipTrack, jumpTo, shuffleQueue, clearQueue, LoopMode };
export type { Track, GuildQueue };

// Wrapped mutations with auto-save
export function addTrackAndSave(queue: GuildQueue, track: Track): number {
  const pos = addTrack(queue, track);
  saveQueues(queues);
  return pos;
}

export function removeTrackAndSave(queue: GuildQueue, index: number): Track | null {
  const t = removeTrack(queue, index);
  saveQueues(queues);
  return t;
}

export function skipTrackAndSave(queue: GuildQueue): Track | null {
  const t = skipTrack(queue);
  saveQueues(queues);
  return t;
}

export function clearQueueAndSave(queue: GuildQueue): void {
  clearQueue(queue);
  saveQueues(queues);
}
