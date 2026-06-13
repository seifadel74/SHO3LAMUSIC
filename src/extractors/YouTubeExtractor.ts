import { Readable } from 'stream';
import { Source } from '../types.js';
import type { IExtractor, SearchResult } from './IExtractor.js';
import ytdl from '@distube/ytdl-core';
import ytSearch from 'yt-search';

const cookieStr = process.env.YOUTUBE_COOKIES;
let agent: ReturnType<typeof ytdl.createAgent> | undefined;
if (cookieStr) {
  const cookies = cookieStr
    .split(';')
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq === -1) return null;
      return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim() };
    })
    .filter(Boolean) as { name: string; value: string }[];
  if (cookies.length) agent = ytdl.createAgent(cookies);
}

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
    const info = await retry(() => ytdl.getInfo(url, requestOptions));
    const audio = ytdl.filterFormats(info.formats, 'audioonly');
    if (!audio.length) throw new Error('No audio stream found');
    const format = ytdl.chooseFormat(audio, { quality: 'highestaudio' });
    return ytdl.downloadFromInfo(info, { format }) as Readable;
  }
}
