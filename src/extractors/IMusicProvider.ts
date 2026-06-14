import { Readable } from 'stream';
import { Track, Source } from '../types.js';

export interface SearchResult {
  title: string;
  url: string;
  duration: number;
  thumbnail: string;
  source: Source;
}

export interface IMusicProvider {
  readonly name: string;
  readonly enabled: boolean;
  readonly source: Source;
  search(query: string): Promise<SearchResult[]>;
  getInfo(url: string): Promise<SearchResult>;
  stream(url: string): Promise<Readable>;
  getPlaylist?(url: string): Promise<SearchResult[]>;
  validate?(url: string): boolean;
}
