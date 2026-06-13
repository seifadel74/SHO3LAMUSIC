import { Readable } from 'stream';
import { Source } from '../types.js';
import type { IExtractor, SearchResult } from './IExtractor.js';
import ytdl from '@distube/ytdl-core';
import ytSearch from 'yt-search';

const raw = process.env.YOUTUBE_COOKIES;
let agent: ReturnType<typeof ytdl.createAgent> | undefined;

function tryCreateAgent(): typeof agent {
  if (!raw) return;
  const parts = raw.includes('#') ? raw.split(/\r?\n/).filter((l) => !l.startsWith('#') && l.includes('\t')) : raw.split(';');
  const cookies: { name: string; value: string }[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const fields = trimmed.split('\t');
    let name: string, value: string;
    if (fields.length >= 7) {
      // Netscape cookie file format: domain  flag  path  secure  expiry  name  value
      name = fields[5]?.trim();
      value = fields[6]?.trim();
    } else {
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      name = trimmed.slice(0, eq).trim();
      value = trimmed.slice(eq + 1).trim();
    }
    if (!name || !value) continue;
    // Skip cookies with invalid characters in value
    if (/[\x00-\x1f\x7f"(),\\<>@;:{}\[\]\?]/.test(value)) continue;
    cookies.push({ name, value });
  }

  if (!cookies.length) return;
  try {
    return ytdl.createAgent(cookies);
  } catch {
    return;
  }
}

agent = tryCreateAgent();

const requestOptions: ytdl.downloadOptions = agent ? { agent } : {};

function retry<T>(fn: () => Promise<T>, n = 3): Promise<T> {
  return fn().catch((err) => {
    if (n <= 1) throw err;
    return new Promise<T>((r) => setTimeout(() => r(retry(fn, n - 1)), 2000));
  });
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
      trackFromData({
        title: v.title,
        url: v.url,
        durationInSec: v.seconds,
        thumbnail: v.image,
      })
    );
  }

  async getInfo(url: string): Promise<SearchResult> {
    const id = ytdl.getVideoID(url);
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
    const data = await ytSearch({ listId: id });
    return (data.videos ?? []).map((v) =>
      trackFromData({
        title: v.title,
        url: v.url,
        durationInSec: v.seconds,
        thumbnail: v.image,
      })
    );
  }

  async stream(url: string): Promise<Readable> {
    const opts: ytdl.downloadOptions = { ...requestOptions };
    const info = await retry(() => ytdl.getInfo(url, opts));
    const audio = ytdl.filterFormats(info.formats, 'audioonly');
    if (!audio.length) throw new Error('No audio stream found');
    const format = ytdl.chooseFormat(audio, { quality: 'highestaudio' });
    return ytdl.downloadFromInfo(info, { ...opts, format }) as Readable;
  }
}
