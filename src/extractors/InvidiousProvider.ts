import { Readable } from 'stream';
import { spawn } from 'child_process';
import { Source } from '../types.js';
import { IMusicProvider, SearchResult } from './IMusicProvider.js';

const VIDEO_ID_RE = /(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/;

function extractVideoId(url: string): string | null {
  return url.match(VIDEO_ID_RE)?.[1] ?? null;
}

const log = {
  info: (msg: string) => console.log(`[INVIDIOUS] ${msg}`),
  warn: (msg: string) => console.warn(`[INVIDIOUS] ${msg}`),
  error: (msg: string) => console.error(`[INVIDIOUS] ${msg}`),
};

const FALLBACK_INSTANCES = [
  'https://inv.nadeko.net',
  'https://yewtu.be',
  'https://invidious.private.coffee',
  'https://vid.puffyan.us',
  'https://invidious.lunar.icu',
  'https://inv.vern.cc',
];

let instances: string[] = [];
let workingInstance: string | null = null;

async function refreshInstances(): Promise<void> {
  try {
    const res = await fetch('https://api.invidious.io/instances.json?sort_by=type,users', {
      signal: AbortSignal.timeout(8000),
    });
    const data: any = await res.json();
    const urls: string[] = data
      .filter(([_, i]: any) => i.type === 'https' && i.api && i.uri)
      .map(([_, i]: any) => i.uri.replace(/\/$/, ''));
    if (urls.length > 0) {
      instances = urls.sort(() => Math.random() - 0.5);
      log.info(`Loaded ${instances.length} instances from api.invidious.io`);
      return;
    }
  } catch {
    log.warn('Failed to fetch instance list, using hardcoded fallbacks');
  }
  instances = [...FALLBACK_INSTANCES].sort(() => Math.random() - 0.5);
}

async function api(path: string): Promise<any> {
  if (instances.length === 0) await refreshInstances();

  const tried = new Set<string>();
  while (tried.size < instances.length) {
    const idx = Math.floor(Math.random() * instances.length);
    const inst = instances[idx];
    if (tried.has(inst)) continue;
    tried.add(inst);

    try {
      const url = `${inst}/api/v1/${path}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        workingInstance = inst;
        return res.json();
      }
      if (res.status === 429) {
        log.warn(`Rate limited on ${inst}, trying next`);
      }
    } catch {
      // instance unreachable, try next
    }
  }

  throw new Error('All Invidious instances failed');
}

function trackFromVideo(v: any): SearchResult {
  return {
    title: v.title ?? 'Unknown',
    url: `https://youtube.com/watch?v=${v.videoId}`,
    duration: v.lengthSeconds ?? 0,
    thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
    source: Source.YouTube,
  };
}

export class InvidiousProvider implements IMusicProvider {
  readonly name = 'Invidious (YouTube Proxy)';
  readonly enabled = true;
  readonly source = Source.YouTube;

  validate(url: string): boolean {
    return VIDEO_ID_RE.test(url);
  }

  async search(query: string): Promise<SearchResult[]> {
    const data = await api(`search?q=${encodeURIComponent(query)}&type=video`);
    return (data ?? []).slice(0, 5).map(trackFromVideo);
  }

  async getInfo(url: string): Promise<SearchResult> {
    const id = extractVideoId(url);
    if (!id) throw new Error('Invalid YouTube URL');
    const data = await api(`videos/${id}`);
    return {
      title: data.title ?? 'Unknown',
      url: `https://youtube.com/watch?v=${id}`,
      duration: data.lengthSeconds ?? 0,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      source: Source.YouTube,
    };
  }

  async getPlaylist(url: string): Promise<SearchResult[]> {
    const listId = url.match(/list=([a-zA-Z0-9_-]+)/)?.[1];
    if (!listId) throw new Error('Invalid playlist URL');

    const data = await api(`playlists/${listId}?page=1`);
    const videos: any[] = data.videos ?? [];
    return videos.slice(0, 50).map((v: any) => ({
      title: v.title ?? 'Unknown',
      url: `https://youtube.com/watch?v=${v.videoId}`,
      duration: v.lengthSeconds ?? 0,
      thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
      source: Source.YouTube,
    }));
  }

  async stream(url: string): Promise<Readable> {
    const id = extractVideoId(url);
    if (!id) throw new Error('Invalid YouTube URL');

    const data = await api(`videos/${id}`);
    const formats: any[] = data.adaptiveFormats ?? [];
    const audio = formats
      .filter((f: any) => f.type?.startsWith('audio/'))
      .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];

    if (!audio?.url) {
      log.error(`No audio stream for ${id}`);
      const empty = new Readable({ read() { this.push(null); } });
      (empty as any)._ytError = 'No audio stream available for this video.';
      return empty;
    }

    log.info(`Audio URL resolved (${audio.url.length} chars, ${audio.type})`);
    const ffmpegPath = (await import('ffmpeg-static')).default;
    const ffProc = spawn(ffmpegPath!, [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', audio.url,
      '-f', 'opus',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1',
    ]);

    ffProc.stderr.on('data', (d: Buffer) => {
      const line = d.toString().trim();
      if (line && !line.includes('ffmpeg version') && !line.includes('built with')
        && !line.includes('configuration') && !line.startsWith('lib')) {
        log.info(`[ffmpeg] ${line}`);
      }
    });
    ffProc.on('error', (e) => log.error(`ffmpeg error: ${e.message}`));
    ffProc.on('exit', (c) => log.info(`ffmpeg exited (${c})`));

    return ffProc.stdout;
  }
}
