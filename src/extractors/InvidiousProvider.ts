import { Readable } from 'stream';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Source } from '../types.js';
import { IMusicProvider, SearchResult } from './IMusicProvider.js';
import ytSearch from 'yt-search';

const VIDEO_ID_RE = /(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/;

function extractVideoId(url: string): string | null {
  return url.match(VIDEO_ID_RE)?.[1] ?? null;
}

const log = {
  info: (msg: string) => console.log(`[INVIDIOUS] ${msg}`),
  warn: (msg: string) => console.warn(`[INVIDIOUS] ${msg}`),
  error: (msg: string) => console.error(`[INVIDIOUS] ${msg}`),
};

const BIN = 'yt-dlp';

const KNOWN_INSTANCES = [
  'https://inv.nadeko.net',
  'https://yewtu.be',
  'https://invidious.private.coffee',
  'https://vid.puffyan.us',
  'https://inv.vern.cc',
  'https://invidious.slipfox.xyz',
];

let workingInstance: string | null = null;

// ── yt-dlp via Invidious instance ──────────────────────────────────────────
function ytDLP(args: string[], timeout = 20000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(BIN, args, { timeout });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', (e: Error) => reject(`spawn error: ${e.message}`));
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(stderr || `exit code ${code}`);
    });
  });
}

function ytArgs(): string[] {
  const args: string[] = ['--no-warnings', '--js-runtimes', 'node'];
  const COOKIE_FILE = join(tmpdir(), 'yt-cookies.txt');
  if (existsSync(COOKIE_FILE)) args.push('--cookies', COOKIE_FILE);
  args.push('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  return args;
}

async function streamViaInvidious(url: string): Promise<Readable> {
  const id = extractVideoId(url);
  if (!id) throw new Error('Invalid YouTube URL');

  // Try instances until one works
  const instances = [...KNOWN_INSTANCES];
  // supplement from API
  try {
    const apiRes = await fetch('https://api.invidious.io/instances.json?sort_by=type,users', {
      signal: AbortSignal.timeout(8000),
    });
    if (apiRes.ok) {
      const apiData: any = await apiRes.json();
      for (const entry of apiData) {
        const info = entry[1];
        if (info.type === 'https' && info.api && info.uri) {
          const u = info.uri.replace(/\/$/, '');
          if (!instances.includes(u)) instances.push(u);
        }
      }
    }
  } catch {}

  // If we have a cached working instance, try it first
  if (workingInstance) {
    instances.unshift(workingInstance);
  }

  let lastErr = '';

  for (const inst of instances) {
    const invidiousUrl = `${inst}/watch?v=${id}`;
    try {
      log.info(`Trying yt-dlp via ${inst}`);
      const stdout = await ytDLP([
        ...ytArgs(),
        '-g', '-f', 'bestaudio',
        invidiousUrl,
      ], 25000);
      const streamUrl = stdout.trim().split('\n').find((l) => l.startsWith('http'));
      if (!streamUrl) throw new Error('No stream URL returned');
      workingInstance = inst;
      log.info(`Stream URL resolved (${streamUrl.length} chars)`);

      const ffmpegPath = (await import('ffmpeg-static')).default;
      const ffProc = spawn(ffmpegPath!, [
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-i', streamUrl,
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
    } catch (e: any) {
      lastErr = typeof e === 'string' ? e.slice(0, 120) : e.message?.slice(0, 120);
      log.warn(`${inst} failed: ${lastErr}`);
    }
  }

  log.error('All instances exhausted');
  const empty = new Readable({ read() { this.push(null); } });
  (empty as any)._ytError = `All YouTube sources failed: ${lastErr}`;
  return empty;
}

// ── Search / Info via yt-search ────────────────────────────────────────────

async function searchYt(query: string): Promise<SearchResult[]> {
  try {
    const results = await ytSearch(query);
    return results.videos.slice(0, 5).map((v) => ({
      title: v.title,
      url: v.url,
      duration: v.seconds,
      thumbnail: v.image,
      source: Source.YouTube,
    }));
  } catch {
    return [];
  }
}

export class InvidiousProvider implements IMusicProvider {
  readonly name = 'Invidious (YouTube Proxy)';
  readonly enabled = true;
  readonly source = Source.YouTube;

  validate(url: string): boolean {
    return VIDEO_ID_RE.test(url);
  }

  async search(query: string): Promise<SearchResult[]> {
    return searchYt(query);
  }

  async getInfo(url: string): Promise<SearchResult> {
    const id = extractVideoId(url);
    if (!id) throw new Error('Invalid YouTube URL');
    const data = await ytSearch({ videoId: id });
    return {
      title: data.title ?? 'Unknown',
      url: `https://youtube.com/watch?v=${id}`,
      duration: data.seconds ?? 0,
      thumbnail: data.image ?? '',
      source: Source.YouTube,
    };
  }

  async getPlaylist(url: string): Promise<SearchResult[]> {
    const listId = url.match(/list=([a-zA-Z0-9_-]+)/)?.[1];
    if (!listId) throw new Error('Invalid playlist URL');
    const data = await ytSearch({ listId });
    return data.videos.slice(0, 50).map((v) => ({
      title: v.title,
      url: v.url,
      duration: v.seconds,
      thumbnail: v.image,
      source: Source.YouTube,
    }));
  }

  async stream(url: string): Promise<Readable> {
    return streamViaInvidious(url);
  }
}
