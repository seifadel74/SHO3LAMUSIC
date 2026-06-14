import { Snowflake } from 'discord.js';
import { Readable } from 'stream';

export const LoopMode = {
  None: 'none',
  Track: 'track',
  Queue: 'queue',
} as const;

export type LoopMode = (typeof LoopMode)[keyof typeof LoopMode];

export enum Source {
  YouTube = 'youtube',
  SoundCloud = 'soundcloud',
  Direct = 'direct',
}

export interface Track {
  title: string;
  url: string;
  duration: number;
  thumbnail: string;
  requestedBy: string;
  source: Source;
  stream: () => Promise<Readable>;
}

export interface GuildQueue {
  tracks: Track[];
  currentIndex: number;
  loopMode: LoopMode;
  volume: number;
}

export type GuildQueues = Map<Snowflake, GuildQueue>;
