import { Readable } from 'stream';
import { Source } from '../types.js';
import { IExtractor, SearchResult } from './IExtractor.js';
import { config } from '../config.js';
import { logger } from '../core/Logger.js';

const clientId = config.soundcloudClientId;

async function scdlFetch<T>(path: string): Promise<T> {
  const base = 'https://api-v2.soundcloud.com';
  const cid = clientId || (await fetchClientId());
  const url = `${base}${path}${path.includes('?') ? '&' : '?'}client_id=${cid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SoundCloud API error: ${res.status}`);
  return res.json();
}

async function fetchClientId(): Promise<string> {
  const html = await fetch('https://soundcloud.com').then((r) => r.text());
  const match = html.match(/client_id["']?\s*:\s*["']([a-zA-Z0-9]+)["']/);
  if (!match) throw new Error('Could not extract SoundCloud client_id');
  logger.info('SoundCloud client_id extracted dynamically');
  return match[1];
}

export class SoundCloudExtractor implements IExtractor {
  readonly source = Source.SoundCloud;

  async search(query: string): Promise<SearchResult[]> {
    const data: any = await scdlFetch(`/search/tracks?q=${encodeURIComponent(query)}&limit=5`);
    return (data.collection ?? []).map((t: any) => ({
      title: t.title ?? 'Unknown',
      url: t.permalink_url,
      duration: Math.floor((t.duration ?? 0) / 1000),
      thumbnail: t.artwork_url ?? '',
      source: Source.SoundCloud,
    }));
  }

  async getInfo(url: string): Promise<SearchResult> {
    const resolve: any = await scdlFetch(`/resolve?url=${encodeURIComponent(url)}`);
    return {
      title: resolve.title ?? 'Unknown',
      url: resolve.permalink_url,
      duration: Math.floor((resolve.duration ?? 0) / 1000),
      thumbnail: resolve.artwork_url ?? '',
      source: Source.SoundCloud,
    };
  }

  async stream(url: string): Promise<Readable> {
    const resolve: any = await scdlFetch(`/resolve?url=${encodeURIComponent(url)}`);
    const trackId = resolve.id;
    const streamData: any = await scdlFetch(`/tracks/${trackId}/streams`);
    const mp3Url = streamData.http_mp3_128_url || streamData.hls_mp3_128_url;
    if (!mp3Url) throw new Error('No audio stream available for this track');
    const res = await fetch(mp3Url);
    return Readable.fromWeb(res.body! as any);
  }
}
