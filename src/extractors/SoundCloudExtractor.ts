import { Readable } from 'stream';
import { Source } from '../types.js';
import { IExtractor, SearchResult } from './IExtractor.js';
import { config } from '../config.js';
import { logger } from '../core/Logger.js';

let _clientId = config.soundcloudClientId || null as string | null;

async function getClientId(): Promise<string | null> {
  if (_clientId) return _clientId;
  try {
    const html = await fetch('https://soundcloud.com').then((r) => r.text());
    const match = html.match(/client_id["']?\s*:\s*["']([a-zA-Z0-9_\-]+)["']/);
    if (match) {
      _clientId = match[1];
      logger.info('SoundCloud client_id extracted dynamically');
      return _clientId;
    }
  } catch {}
  return null;
}

async function scdlFetch<T>(path: string): Promise<T | null> {
  const cid = await getClientId();
  if (!cid) return null;
  const base = 'https://api-v2.soundcloud.com';
  const url = `${base}${path}${path.includes('?') ? '&' : '?'}client_id=${cid}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

export class SoundCloudExtractor implements IExtractor {
  readonly source = Source.SoundCloud;

  async search(query: string): Promise<SearchResult[]> {
    const data: any = await scdlFetch(`/search/tracks?q=${encodeURIComponent(query)}&limit=5`);
    if (!data) return [];
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
    if (!resolve) throw new Error('Could not fetch SoundCloud track info');
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
    if (!resolve) throw new Error('Could not fetch SoundCloud track info');
    const streamData: any = await scdlFetch(`/tracks/${resolve.id}/streams`);
    if (!streamData) throw new Error('Could not fetch SoundCloud stream');
    const mp3Url = streamData.http_mp3_128_url || streamData.hls_mp3_128_url;
    if (!mp3Url) throw new Error('No audio stream available for this track');
    const res = await fetch(mp3Url);
    return Readable.fromWeb(res.body! as any);
  }
}
