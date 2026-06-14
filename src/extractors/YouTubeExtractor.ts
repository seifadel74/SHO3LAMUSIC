import { Readable } from 'stream';
import { spawn } from 'child_process';
import { writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Source } from '../types.js';
import type { IExtractor, SearchResult } from './IExtractor.js';
import ytSearch from 'yt-search';

// Use the system yt-dlp binary installed at build time (see Dockerfile)
const BIN = 'yt-dlp';
const COOKIE_FILE = join(tmpdir(), 'yt-cookies.txt');

// ── Configuration from environment ──────────────────────────────────────────
const CFG = {
  userAgent: process.env.YT_USER_AGENT
    || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  clients: (process.env.YT_CLIENTS || 'web,mweb,ios,android,tv_embedded').split(','),
  retryDelay: parseInt(process.env.YT_RETRY_DELAY || '1000', 10),
  retryMax: parseInt(process.env.YT_RETRY_MAX || '3', 10),
  timeout: parseInt(process.env.YT_TIMEOUT || '20000', 10),
  cookieFile: process.env.YT_COOKIE_FILE || COOKIE_FILE,
};

// ── Logger with timestamps ──────────────────────────────────────────────────
const log = {
  info: (msg: string) => console.log(`[${new Date().toISOString()}] [YT] ${msg}`),
  warn: (msg: string) => console.warn(`[${new Date().toISOString()}] [YT] ${msg}`),
  error: (msg: string) => console.error(`[${new Date().toISOString()}] [YT] ${msg}`),
};

// ── Cookie file setup (optional – runs once at module load) ──────────────────
if (!existsSync(CFG.cookieFile)) {
  if (process.env.YOUTUBE_COOKIES) {
    writeFileSync(CFG.cookieFile, process.env.YOUTUBE_COOKIES, 'utf-8');
    log.info('Cookie file written from YOUTUBE_COOKIES env');
  }
  // If no cookies source is available we continue without – yt-dlp degrades gracefully
}

// ── Error classification ────────────────────────────────────────────────────
enum YtErrorType {
  BotDetection = 'bot_detection',
  Http403 = 'http_403',
  Http429 = 'http_429',
  Unavailable = 'unavailable',
  Private = 'private',
  Unknown = 'unknown',
}

class YtError extends Error {
  type: YtErrorType;
  stdout: string;
  stderr: string;
  exitCode: number | null;

  constructor(msg: string, stderr: string, exitCode: number | null, stdout = '') {
    super(msg);
    this.stderr = stderr;
    this.stdout = stdout;
    this.exitCode = exitCode;
    this.type = classifyError(stderr);
  }

  get isTransient(): boolean {
    return this.type === YtErrorType.BotDetection
      || this.type === YtErrorType.Http403
      || this.type === YtErrorType.Http429;
  }

  get userMessage(): string {
    switch (this.type) {
      case YtErrorType.BotDetection:
        return 'YouTube is blocking server requests. Try again later or update cookies.';
      case YtErrorType.Http403:
        return 'Access forbidden. This video may be restricted.';
      case YtErrorType.Http429:
        return 'Too many requests. Please wait a moment and try again.';
      case YtErrorType.Unavailable:
        return 'This video is unavailable.';
      case YtErrorType.Private:
        return 'This video is private.';
      default:
        return 'Unable to stream this YouTube video. Please try another link.';
    }
  }
}

function classifyError(stderr: string): YtErrorType {
  if (/Sign in to confirm/i.test(stderr)) return YtErrorType.BotDetection;
  if (/HTTP Error 403/i.test(stderr)) return YtErrorType.Http403;
  if (/HTTP Error 429/i.test(stderr)) return YtErrorType.Http429;
  if (/Video unavailable/i.test(stderr)) return YtErrorType.Unavailable;
  if (/Private video/i.test(stderr)) return YtErrorType.Private;
  return YtErrorType.Unknown;
}

// ── Spawn wrapper – collects stdout/stderr, never blocks the event loop ─────
function ytSpawn(args: string[], timeout = CFG.timeout): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(BIN, args, { timeout });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', (e: Error) => reject(new YtError(e.message, stderr, null, stdout)));
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new YtError(`exit code ${code}`, stderr, code, stdout));
    });
  });
}

// ── Build yt-dlp argument array ────────────────────────────────────────────
function ytArgs(client?: string): string[] {
  const args: string[] = ['--no-warnings', '--js-runtimes', 'node'];
  if (existsSync(CFG.cookieFile)) {
    args.push('--cookies', CFG.cookieFile);
  }
  args.push('--user-agent', CFG.userAgent);
  if (client) {
    args.push('--extractor-args', `youtube:player_client=${client}`);
  }
  return args;
}

// ── Search result helper ────────────────────────────────────────────────────
function trackFromData(v: { title?: string; url: string; durationInSec?: number; thumbnail?: string }): SearchResult {
  return {
    title: v.title ?? 'Unknown',
    url: v.url,
    duration: v.durationInSec ?? 0,
    thumbnail: v.thumbnail ?? '',
    source: Source.YouTube,
  };
}

// ── Extractors ──────────────────────────────────────────────────────────────
const VIDEO_ID_RE = /(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/;
const PLAYLIST_ID_RE = /list=([a-zA-Z0-9_-]+)/;

function extractVideoId(url: string): string | null {
  return url.match(VIDEO_ID_RE)?.[1] ?? null;
}

// ── Retry with exponential backoff across multiple clients ───────────────────
async function runWithFallback<T>(fn: (client: string) => Promise<T>): Promise<T> {
  let lastError: Error | null = null;
  for (const client of CFG.clients) {
    for (let attempt = 0; attempt < CFG.retryMax; attempt++) {
      try {
        return await fn(client);
      } catch (err) {
        lastError = err as Error;
        const ytErr = err as YtError;
        if (!ytErr.isTransient) throw err;
        if (attempt < CFG.retryMax - 1) {
          const delay = CFG.retryDelay * Math.pow(2, attempt);
          log.warn(`${client} attempt ${attempt + 1} failed (${ytErr.type}), retrying in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    log.warn(`${client} exhausted, trying next client`);
  }
  throw lastError ?? new Error('All clients failed');
}

// ── ──── EXTRACTOR ──────────────────────────────────────────────────────────

export class YouTubeExtractor implements IExtractor {
  readonly source = Source.YouTube;

  // Search uses yt-search (client-side, no yt-dlp needed)
  async search(query: string): Promise<SearchResult[]> {
    const results = await ytSearch(query);
    return results.videos.slice(0, 5).map((v) =>
      trackFromData({ title: v.title, url: v.url, durationInSec: v.seconds, thumbnail: v.image })
    );
  }

  validate(url: string): boolean {
    return VIDEO_ID_RE.test(url);
  }

  // ── Fetch video metadata ──────────────────────────────────────────────────
  async getInfo(url: string): Promise<SearchResult> {
    const id = extractVideoId(url);
    if (!id) throw new Error('Invalid YouTube URL');

    return runWithFallback(async (client) => {
      const { stdout } = await ytSpawn([
        ...ytArgs(client),
        '--dump-json', '--flat-playlist',
        `https://youtube.com/watch?v=${id}`,
      ]);
      const json = JSON.parse(stdout);
      return trackFromData({
        title: json.title,
        url: `https://youtube.com/watch?v=${id}`,
        durationInSec: json.duration ?? 0,
        thumbnail: json.thumbnail ?? '',
      });
    });
  }

  // ── Fetch playlist tracks ─────────────────────────────────────────────────
  async getPlaylist(url: string): Promise<SearchResult[]> {
    const id = url.match(PLAYLIST_ID_RE)?.[1];
    if (!id) throw new Error('Invalid playlist URL');

    return runWithFallback(async (client) => {
      const { stdout } = await ytSpawn([
        ...ytArgs(client),
        '--dump-json', '--flat-playlist',
        url,
      ], 30000);
      return stdout
        .trim()
        .split('\n')
        .slice(0, 50)
        .map((line) => {
          const v = JSON.parse(line);
          return trackFromData({
            title: v.title,
            url: `https://youtube.com/watch?v=${v.id}`,
            durationInSec: v.duration ?? 0,
            thumbnail: v.thumbnail ?? '',
          });
        });
    });
  }

  // ── Stream audio ──────────────────────────────────────────────────────────
  async stream(url: string): Promise<Readable> {
    if (!this.validate(url)) throw new Error('Invalid YouTube URL');

    const ffmpegPath = (await import('ffmpeg-static')).default;

    let streamUrl: string;
    try {
      streamUrl = await runWithFallback(async (client) => {
        const { stdout } = await ytSpawn([
          ...ytArgs(client),
          '-g', '-f', 'bestaudio',
          url,
        ]);
        const match = stdout.trim().split('\n').filter((l) => l.startsWith('http'));
        if (!match.length) throw new Error('No stream URL returned');
        return match[0];
      });
    } catch (err) {
      const ytErr = err as YtError;
      log.error(`stream failed for ${url}: ${ytErr.userMessage}`);
      const empty = new Readable({ read() { this.push(null); } });
      (empty as any)._ytError = ytErr.userMessage;
      return empty;
    }

    log.info(`Stream URL resolved (${streamUrl.length} chars)`);
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
  }
}
