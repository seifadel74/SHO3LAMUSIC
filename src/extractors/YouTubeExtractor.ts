import { Readable } from 'stream';
import { spawn } from 'child_process';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Source } from '../types.js';
import type { IMusicProvider, SearchResult } from './IMusicProvider.js';
import ytSearch from 'yt-search';

const BIN = 'yt-dlp';
const COOKIE_FILE = join(tmpdir(), 'yt-cookies.txt');

const CFG = {
  userAgent: process.env.YT_USER_AGENT
    || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  proxy: process.env.YT_PROXY || '',
  timeout: parseInt(process.env.YT_TIMEOUT || '20000', 10),
};

const log = {
  info: (msg: string) => console.log(`[${new Date().toISOString()}] [YT] ${msg}`),
  warn: (msg: string) => console.warn(`[${new Date().toISOString()}] [YT] ${msg}`),
  error: (msg: string) => console.error(`[${new Date().toISOString()}] [YT] ${msg}`),
};

// ── Smart cookie parser (JSON / Netscape / raw header) ──────────────────
function jsonToNetscape(json: any[]): string {
  return json
    .filter((c: any) => c.name && c.value)
    .map((c: any) => {
      const domain = c.domain || '.youtube.com';
      const includeSub = domain.startsWith('.') ? 'TRUE' : 'FALSE';
      return `${domain}\t${includeSub}\t${c.path || '/'}\t${c.secure ? 'TRUE' : 'FALSE'}\t${c.expirationDate ? Math.floor(c.expirationDate).toString() : '0'}\t${c.name}\t${c.value}`;
    })
    .join('\n');
}

function rawToNetscape(raw: string): string {
  // Extract all name=value pairs from any text
  const pairs: string[] = [];
  const regex = /([a-zA-Z0-9_\-]+)=([^;\s"'`]+)/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    pairs.push(match[1] + '\t' + match[2]);
  }
  if (pairs.length === 0) return raw;
  return pairs.map(p => `.youtube.com\tTRUE\t/\tFALSE\t0\t${p}`).join('\n');
}

function writeCookies(raw: string): boolean {
  // 1) Try JSON (EditThisCookie / Cookie-Editor)
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      writeFileSync(COOKIE_FILE, jsonToNetscape(parsed), 'utf-8');
      const count = parsed.filter((c: any) => c.name && c.value).length;
      log.info(`Converted JSON cookies (${count} cookies)`);
      return true;
    }
  } catch {}

  // 2) Try to validate as Netscape format
  const lines = raw.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
  const validNetscape = lines.filter(l => l.split('\t').length >= 7);
  if (validNetscape.length > 0) {
    writeFileSync(COOKIE_FILE, raw, 'utf-8');
    log.info(`Netscape cookies (${validNetscape.length} entries)`);
    return true;
  }

  // 3) Extract name=value pairs from raw text / header format
  const converted = rawToNetscape(raw);
  writeFileSync(COOKIE_FILE, converted, 'utf-8');
  const pairCount = (converted.match(/\n/g)?.length ?? 0) + 1;
  log.info(`Extracted ${pairCount} cookie pairs from raw input`);
  return true;
}

const hasCookies = (() => {
  if (process.env.YOUTUBE_COOKIES) {
    return writeCookies(process.env.YOUTUBE_COOKIES);
  }
  log.warn('No YOUTUBE_COOKIES set. YouTube playback may fail on datacenter IPs.');
  return false;
})();

function cookieFileValid(): boolean {
  if (!existsSync(COOKIE_FILE)) return false;
  const content = readFileSync(COOKIE_FILE, 'utf-8').trim();
  return content.length > 0 && content.includes('\t');
}

// ── Error classification ────────────────────────────────────────────────────
export enum YtStreamError {
  BotDetection = 'bot_detection',
  Http403 = 'http_403',
  Http429 = 'http_429',
  Unavailable = 'unavailable',
  Private = 'private',
  NoCookies = 'no_cookies',
  Unknown = 'unknown',
}

const ERR_MSGS: Record<YtStreamError, string> = {
  [YtStreamError.BotDetection]:
    'YouTube blocked this request. Your YOUTUBE_COOKIES may have expired — re-export them from your browser.',
  [YtStreamError.Http403]: 'Access forbidden. This video may be region-restricted.',
  [YtStreamError.Http429]: 'Too many requests. Please wait a moment and try again.',
  [YtStreamError.Unavailable]: 'This video is unavailable.',
  [YtStreamError.Private]: 'This video is private.',
  [YtStreamError.NoCookies]:
    'YouTube cookies are required. Export cookies from your browser using "Get cookies.txt" extension (Netscape format).',
  [YtStreamError.Unknown]: 'Unable to stream this YouTube video. Please try another link.',
};

function classifyError(stderr: string): YtStreamError {
  if (/does not look like a Netscape format/i.test(stderr)) return YtStreamError.NoCookies;
  if (/Sign in to confirm/i.test(stderr)) return YtStreamError.BotDetection;
  if (/HTTP Error 403/i.test(stderr)) return YtStreamError.Http403;
  if (/HTTP Error 429/i.test(stderr)) return YtStreamError.Http429;
  if (/Video unavailable/i.test(stderr)) return YtStreamError.Unavailable;
  if (/Private video/i.test(stderr)) return YtStreamError.Private;
  if (/Requested format is not available/i.test(stderr)) return YtStreamError.Unknown;
  return YtStreamError.Unknown;
}

// ── yt-dlp helpers ──────────────────────────────────────────────────────────
function ytSpawn(args: string[], timeout = CFG.timeout): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(BIN, args, { timeout });
    let stdout = '', stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', (e: Error) => reject({ type: YtStreamError.Unknown, msg: e.message, stderr, stdout }));
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else {
        const type = classifyError(stderr);
        reject({ type, msg: ERR_MSGS[type], stderr, stdout });
      }
    });
  });
}

function ytArgs(): string[] {
  const args = ['--no-warnings', '--js-runtimes', 'node'];
  if (cookieFileValid()) args.push('--cookies', COOKIE_FILE);
  args.push('--user-agent', CFG.userAgent);
  if (CFG.proxy) args.push('--proxy', CFG.proxy);
  return args;
}

// ── Invidious fallback ─────────────────────────────────────────────────────
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net', 'https://yewtu.be',
  'https://invidious.private.coffee', 'https://vid.puffyan.us',
  'https://inv.vern.cc', 'https://invidious.slipfox.xyz',
];

let invidiousInstances: string[] = [];
let cachedInvidious: string | null = null;

async function ensureInvidious(): Promise<void> {
  if (invidiousInstances.length > 0) return;
  const set = new Set(INVIDIOUS_INSTANCES);
  try {
    const res = await fetch('https://api.invidious.io/instances.json?sort_by=type,users', { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const apiData: any = await res.json();
      for (const entry of apiData) {
        const info = entry[1];
        if (info.type === 'https' && info.api && info.uri) set.add(info.uri.replace(/\/$/, ''));
      }
    }
  } catch {}
  invidiousInstances = [...set];
}

async function streamViaInvidious(url: string): Promise<Readable> {
  const id = url.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/)?.[1];
  if (!id) throw new Error('Invalid YouTube URL');
  await ensureInvidious();

  if (cachedInvidious) {
    invidiousInstances = [cachedInvidious, ...invidiousInstances.filter(i => i !== cachedInvidious)];
  }

  let lastErr = '';
  for (const inst of invidiousInstances) {
    try {
      log.info(`Trying Invidious via ${inst}`);
      const iUrl = `${inst}/watch?v=${id}`;
      const out = await ytSpawn(['--no-warnings', '-g', iUrl], 30000);
      const streamUrl = out.stdout.trim().split('\n').find(l => l.startsWith('http'));
      if (!streamUrl) continue;
      cachedInvidious = inst;
      log.info(`Invidious stream URL resolved`);

      const ffmpegPath = (await import('ffmpeg-static')).default;
      const ffProc = spawn(ffmpegPath!, [
        '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
        '-i', streamUrl, '-f', 'opus', '-ar', '48000', '-ac', '2', 'pipe:1',
      ]);
      ffProc.stderr.on('data', (d: Buffer) => {
        const line = d.toString().trim();
        if (line && !line.includes('ffmpeg version') && !line.includes('built with')
          && !line.includes('configuration') && !line.startsWith('lib')) log.info(`[ffmpeg] ${line}`);
      });
      ffProc.on('error', e => log.error(`ffmpeg error: ${e.message}`));
      ffProc.on('exit', c => log.info(`ffmpeg exited (${c})`));
      return ffProc.stdout;
    } catch (e: any) {
      lastErr = (e.stderr || e.msg || e.message || '').slice(0, 100);
      log.warn(`${inst}: ${lastErr}`);
    }
  }

  const empty = new Readable({ read() { this.push(null); } });
  (empty as any)._ytError = `YouTube playback failed: ${lastErr || 'All sources exhausted'}`;
  return empty;
}

// ── URL helpers ──────────────────────────────────────────────────────────────
const VIDEO_ID_RE = /(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/;
const PLAYLIST_ID_RE = /list=([a-zA-Z0-9_-]+)/;

function trackData(v: { title?: string; url: string; durationInSec?: number; thumbnail?: string }): SearchResult {
  return { title: v.title ?? 'Unknown', url: v.url, duration: v.durationInSec ?? 0, thumbnail: v.thumbnail ?? '', source: Source.YouTube };
}

// ── Provider class ───────────────────────────────────────────────────────────
export class YouTubeExtractor implements IMusicProvider {
  readonly name = 'YouTube';
  readonly enabled = true;
  readonly source = Source.YouTube;

  validate(url: string): boolean { return VIDEO_ID_RE.test(url); }

  async search(query: string): Promise<SearchResult[]> {
    const results = await ytSearch(query);
    return results.videos.slice(0, 5).map(v => trackData({ title: v.title, url: v.url, durationInSec: v.seconds, thumbnail: v.image }));
  }

  async getInfo(url: string): Promise<SearchResult> {
    const id = extractId(url);
    if (!id) throw new Error('Invalid YouTube URL');
    const data = await ytSearch({ videoId: id });
    return trackData({ title: data.title, url: `https://youtube.com/watch?v=${id}`, durationInSec: data.seconds, thumbnail: data.image });
  }

  async getPlaylist(url: string): Promise<SearchResult[]> {
    const id = url.match(PLAYLIST_ID_RE)?.[1];
    if (!id) throw new Error('Invalid playlist URL');
    const { stdout } = await ytSpawn([...ytArgs(), '--dump-json', '--flat-playlist', url], 30000);
    return stdout.trim().split('\n').slice(0, 50).map(line => {
      const v = JSON.parse(line);
      return trackData({ title: v.title, url: `https://youtube.com/watch?v=${v.id}`, durationInSec: v.duration ?? 0, thumbnail: v.thumbnail ?? '' });
    });
  }

  async stream(url: string): Promise<Readable> {
    const id = extractId(url);
    if (!id) throw new Error('Invalid YouTube URL');

    // Strategy 1: yt-dlp directly to YouTube with cookies
    if (cookieFileValid()) {
      try {
        log.info('Trying direct YouTube stream with cookies');
        const { stdout } = await ytSpawn([...ytArgs(), '-g', '-f', 'bestaudio', url]);
        const streamUrl = stdout.trim().split('\n').find(l => l.startsWith('http'));
        if (streamUrl) {
          log.info('Direct YouTube stream URL resolved');
          const ffmpegPath = (await import('ffmpeg-static')).default;
          const ffProc = spawn(ffmpegPath!, [
            '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
            '-i', streamUrl, '-f', 'opus', '-ar', '48000', '-ac', '2', 'pipe:1',
          ]);
          ffProc.stderr.on('data', (d: Buffer) => {
            const line = d.toString().trim();
            if (line && !line.includes('ffmpeg version') && !line.includes('built with')
              && !line.includes('configuration') && !line.startsWith('lib')) log.info(`[ffmpeg] ${line}`);
          });
          ffProc.on('error', e => log.error(`ffmpeg error: ${e.message}`));
          ffProc.on('exit', c => log.info(`ffmpeg exited (${c})`));
          return ffProc.stdout;
        }
      } catch (e: any) {
        log.warn(`Direct YouTube failed: ${e.msg || e.message}`);
      }
    }

    // Strategy 2: Fallback to Invidious
    log.info('Falling back to Invidious proxy');
    return streamViaInvidious(url);
  }
}

function extractId(url: string): string | null {
  return url.match(VIDEO_ID_RE)?.[1] ?? null;
}
