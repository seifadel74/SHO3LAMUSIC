import { Readable } from 'stream';
import https from 'https';
import { Source } from '../types.js';
import type { IExtractor, SearchResult } from './IExtractor.js';
import ytSearch from 'yt-search';

const INSTANCES = [
  'https://inv.nadeko.net',
  'https://yewtu.be',
  'https://invidious.snopyta.org',
  'https://vid.puffyan.us',
];

function videoId(url: string): string {
  const m = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/
  );
  if (m) return m[1];
  throw new Error('Invalid YouTube URL');
}

function jsonGet(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j && j.error) reject(new Error(j.error));
          else resolve(j);
        } catch {
          reject(new Error('Invalid JSON response'));
        }
      });
    }).on('error', reject);
  });
}

async function invidious(path: string): Promise<any> {
  for (const base of INSTANCES) {
    try {
      return await jsonGet(`${base}${path}`);
    } catch {}
  }
  throw new Error('Invidious unreachable');
}

async function retry<T>(fn: () => Promise<T>, n = 3): Promise<T> {
  for (let i = 0; i < n; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === n - 1) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('retry exhausted');
}

function trackFromData(v: {
  title?: string;
  url: string;
  durationInSec?: number;
  thumbnail?: string;
}): SearchResult {
  return {
    title: v.title ?? 'Unknown',
    url: v.url,
    duration: v.durationInSec ?? 0,
    thumbnail: v.thumbnail ?? '',
    source: Source.YouTube,
  };
}

export class YouTubeExtractor implements IExtractor {
  readonly source = Source.YouTube;

  async search(query: string): Promise<SearchResult[]> {
    const results = await ytSearch(query);
    return results.videos.slice(0, 5).map((v) =>
      trackFromData({ title: v.title, url: v.url, durationInSec: v.seconds, thumbnail: v.image })
    );
  }

  async getInfo(url: string): Promise<SearchResult> {
    const id = videoId(url);
    const data = await ytSearch({ videoId: id });
    return trackFromData({
      title: data.title,
      url: data.url,
      durationInSec: data.seconds,
      thumbnail: data.image,
    });
  }

  async getPlaylist(url: string): Promise<SearchResult[]> {
    const id = url.match(/list=([a-zA-Z0-9_-]+)/)?.[1];
    if (!id) throw new Error('Invalid playlist URL');
    const data = await invidious(`/api/v1/playlists/${id}`);
    return (data.videos ?? []).map((v: any) =>
      trackFromData({
        title: v.title,
        url: `https://youtube.com/watch?v=${v.videoId}`,
        durationInSec: v.lengthSeconds,
        thumbnail: v.videoThumbnails?.find((t: any) => t.quality === 'medium')?.url ?? '',
      })
    );
  }

  async stream(url: string): Promise<Readable> {
    const id = videoId(url);
    const data = await retry(() => invidious(`/api/v1/videos/${id}`));
    const formats = data.adaptiveFormats ?? [];
    const audio = formats
      .filter((f: any) => f.mimeType?.includes('audio'))
      .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
    if (!audio.length) throw new Error('No audio stream found');
    return new Promise((resolve, reject) => {
      https.get(audio[0].url, (res) => resolve(res as Readable)).on('error', reject);
    });
  }
}
