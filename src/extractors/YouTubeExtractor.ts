import { Readable } from 'stream';
import { Source } from '../types.js';
import type { IExtractor, SearchResult } from './IExtractor.js';
import { stream, search, video_basic_info, playlist_info } from 'play-dl';

function trackFromData(v: { title?: string; url: string; durationInSec: number; thumbnails: { url: string }[] }): SearchResult {
  const thumbs = v.thumbnails;
  return {
    title: v.title ?? 'Unknown',
    url: v.url,
    duration: v.durationInSec,
    thumbnail: thumbs.length > 0 ? thumbs[thumbs.length - 1].url : '',
    source: Source.YouTube,
  };
}

export class YouTubeExtractor implements IExtractor {
  readonly source = Source.YouTube;

  async search(query: string): Promise<SearchResult[]> {
    const results = await search(query, { limit: 5, source: { youtube: 'video' } });
    return results.map(trackFromData);
  }

  async getInfo(url: string): Promise<SearchResult> {
    const info = await video_basic_info(url);
    return trackFromData(info.video_details);
  }

  async getPlaylist(url: string): Promise<SearchResult[]> {
    const pl = await playlist_info(url);
    const videos = await pl.all_videos();
    return videos.map(trackFromData);
  }

  async stream(url: string): Promise<Readable> {
    const result = await stream(url, { quality: 0 });
    return result.stream as Readable;
  }
}
