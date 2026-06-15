import { Source } from '../types.js';
import type { IMusicProvider, SearchResult } from './IMusicProvider.js';
import ytSearch from 'yt-search';

const log = {
  info: (msg: string) => console.log(`[${new Date().toISOString()}] [YT] ${msg}`),
  warn: (msg: string) => console.warn(`[${new Date().toISOString()}] [YT] ${msg}`),
  error: (msg: string) => console.error(`[${new Date().toISOString()}] [YT] ${msg}`),
};

// ── URL helpers ──────────────────────────────────────────────────────────────
const VIDEO_ID_RE = /(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/;
const PLAYLIST_ID_RE = /list=([a-zA-Z0-9_-]+)/;

function trackData(v: { title?: string; url: string; durationInSec?: number; thumbnail?: string }): SearchResult {
  return { title: v.title ?? 'Unknown', url: v.url, duration: v.durationInSec ?? 0, thumbnail: v.thumbnail ?? '', source: Source.YouTube };
}

// ── Provider class ───────────────────────────────────────────────────────────
export class YouTubeExtractor implements IMusicProvider {
  readonly name = 'YouTube';
  readonly enabled = true;
  readonly source = Source.YouTube;

  validate(url: string): boolean { return VIDEO_ID_RE.test(url); }

  async search(query: string): Promise<SearchResult[]> {
    const results = await ytSearch(query);
    return results.videos.slice(0, 5).map(v => trackData({ title: v.title, url: v.url, durationInSec: v.seconds, thumbnail: v.image }));
  }

  async getInfo(url: string): Promise<SearchResult> {
    const id = url.match(VIDEO_ID_RE)?.[1];
    if (!id) throw new Error('Invalid YouTube URL');
    const data = await ytSearch({ videoId: id });
    return trackData({ title: data.title, url: `https://youtube.com/watch?v=${id}`, durationInSec: data.seconds, thumbnail: data.image });
  }

  async getPlaylist(url: string): Promise<SearchResult[]> {
    const listId = url.match(PLAYLIST_ID_RE)?.[1];
    if (!listId) throw new Error('Invalid playlist URL');
    const data = await ytSearch({ listId });
    return data.videos.slice(0, 50).map((v: any) => trackData({ title: v.title, url: v.url, durationInSec: v.seconds, thumbnail: v.image }));
  }
}
