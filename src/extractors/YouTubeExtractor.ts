import { Readable } from 'stream';
import { Source } from '../types.js';
import type { IExtractor, SearchResult } from './IExtractor.js';
import { stream, video_basic_info, playlist_info, setToken } from 'play-dl';
import ytSearch from 'yt-search';

setToken({
  useragent: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'],
});

function trackFromData(v: { title?: string; url: string; durationInSec?: number; thumbnail?: string; thumbnails?: { url: string }[] }): SearchResult {
  return {
    title: v.title ?? 'Unknown',
    url: v.url,
    duration: v.durationInSec ?? 0,
    thumbnail: v.thumbnail ?? (Array.isArray(v.thumbnails) && v.thumbnails.length > 0 ? v.thumbnails[v.thumbnails.length - 1].url : ''),
    source: Source.YouTube,
  };
}

export class YouTubeExtractor implements IExtractor {
  readonly source = Source.YouTube;

  async search(query: string): Promise<SearchResult[]> {
    const results = await ytSearch(query);
    return results.videos.slice(0, 5).map((v) => trackFromData({
      title: v.title,
      url: v.url,
      durationInSec: v.duration.seconds,
      thumbnail: v.image,
    }));
  }

  async getInfo(url: string): Promise<SearchResult> {
    const info = await video_basic_info(url);
    return trackFromData(info.video_details);
  }

  async getPlaylist(url: string): Promise<SearchResult[]> {
    const pl = await playlist_info(url);
    const videos = await pl.all_videos();
    return videos.map((v) => trackFromData(v));
  }

  async stream(url: string): Promise<Readable> {
    const result = await stream(url, { quality: 0 });
    return result.stream as Readable;
  }
}
