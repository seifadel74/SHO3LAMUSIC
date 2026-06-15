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

// Curated list of known-working instances (removed dead ones)
const KNOWN_INSTANCES = [
  'https://inv.nadeko.net',
  'https://yewtu.be',
  'https://invidious.private.coffee',
  'https://vid.puffyan.us',
  'https://inv.vern.cc',
  'https://invidious.slipfox.xyz',
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json',
};

let cachedInstance: string | null = null;

async function findInstance(path: string): Promise<{ instance: string; data: any }> {
  // Try cached instance first
  if (cachedInstance) {
    try {
      const url = `${cachedInstance}/api/v1/${path}`;
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
      if (res.ok && (res.headers.get('content-type') || '').includes('json')) {
        log.info(`Using cached instance: ${cachedInstance}`);
        return { instance: cachedInstance, data: await res.json() };
      }
    } catch { /* fall through */ }
  }

  // Build instance list: known instances + API supplement
  const urls = new Set(KNOWN_INSTANCES);
  try {
    const apiRes = await fetch('https://api.invidious.io/instances.json?sort_by=type,users', {
      signal: AbortSignal.timeout(8000),
    });
    if (apiRes.ok) {
      const apiData: any = await apiRes.json();
      for (const entry of apiData) {
        const info = entry[1];
        if (info.type === 'https' && info.api && info.uri) {
          urls.add(info.uri.replace(/\/$/, ''));
        }
      }
    }
  } catch { /* ignore */ }

  const instances = [...urls];
  log.info(`Trying ${instances.length} instances for /api/v1/${path.split('?')[0]}`);

  for (const inst of instances) {
    try {
      const url = `${inst}/api/v1/${path}`;
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
      if (res.ok && (res.headers.get('content-type') || '').includes('json')) {
        cachedInstance = inst;
        log.info(`Using instance: ${inst}`);
        return { instance: inst, data: await res.json() };
      }
      if (res.ok) {
        const text = await res.text();
        log.warn(`${inst}: non-JSON (${text.slice(0, 60).replace(/\n/g, ' ')})`);
      } else {
        log.warn(`${inst}: HTTP ${res.status}`);
      }
    } catch (e: any) {
      log.warn(`${inst}: ${e?.cause?.code || e?.message || 'error'}`);
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
    const { data } = await findInstance(`search?q=${encodeURIComponent(query)}&type=video`);
    return (data ?? []).slice(0, 5).map(trackFromVideo);
  }

  async getInfo(url: string): Promise<SearchResult> {
    const id = extractVideoId(url);
    if (!id) throw new Error('Invalid YouTube URL');
    const { data } = await findInstance(`videos/${id}`);
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

    const { data } = await findInstance(`playlists/${listId}?page=1`);
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

    const { data } = await findInstance(`videos/${id}`);
    const formats: any[] = data.adaptiveFormats ?? [];
    const audio = formats
      .filter((f: any) => f.type?.startsWith('audio/'))
      .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];

    if (!audio?.url) {
      log.error(`No audio URL for ${id}`);
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
