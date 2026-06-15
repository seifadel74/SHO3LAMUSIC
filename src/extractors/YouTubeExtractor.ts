import { Readable } from 'stream';
import { spawn } from 'child_process';
import { writeFileSync, existsSync } from 'fs';
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

// ── Cookies: mandatory for Railway. Without them every request gets bot_detection ──
const hasCookies = (() => {
  if (process.env.YOUTUBE_COOKIES) {
    writeFileSync(COOKIE_FILE, process.env.YOUTUBE_COOKIES, 'utf-8');
    log.info('Cookies loaded from YOUTUBE_COOKIES env');
    return true;
  }
  log.warn('No YOUTUBE_COOKIES set. YouTube playback will fail on datacenter IPs.');
  return false;
})();

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

export const YT_ERROR_MESSAGES: Record<YtStreamError, string> = {
  [YtStreamError.BotDetection]:
    'YouTube blocked this request. Your YOUTUBE_COOKIES may have expired — re-export them from your browser.',
  [YtStreamError.Http403]:
    'Access forbidden. This video may be region-restricted.',
  [YtStreamError.Http429]:
    'Too many requests. Please wait a moment and try again.',
  [YtStreamError.Unavailable]:
    'This video is unavailable.',
  [YtStreamError.Private]:
    'This video is private.',
  [YtStreamError.NoCookies]:
    'YouTube cookies are required and must be in Netscape format. Export cookies from your browser using "Get cookies.txt" extension.',
  [YtStreamError.Unknown]:
    'Unable to stream this YouTube video. Please try another link.',
};

function classifyError(stderr: string): YtStreamError {
  if (/does not look like a Netscape format/i.test(stderr)) return YtStreamError.NoCookies;
  if (/Sign in to confirm/i.test(stderr)) return YtStreamError.BotDetection;
  if (/HTTP Error 403/i.test(stderr)) return YtStreamError.Http403;
  if (/HTTP Error 429/i.test(stderr)) return YtStreamError.Http429;
  if (/Video unavailable/i.test(stderr)) return YtStreamError.Unavailable;
  if (/Private video/i.test(stderr)) return YtStreamError.Private;
  return YtStreamError.Unknown;
}

function userMessage(err: YtStreamError): string {
  return YT_ERROR_MESSAGES[err];
}

// ── Spawn wrapper ───────────────────────────────────────────────────────────
function ytSpawn(args: string[], timeout = CFG.timeout): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(BIN, args, { timeout });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', (e: Error) => reject({ type: YtStreamError.Unknown, msg: e.message, stderr, stdout }));
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else {
        const type = classifyError(stderr);
        reject({ type, msg: userMessage(type), stderr, stdout });
      }
    });
  });
}

function ytArgs(): string[] {
  const args: string[] = ['--no-warnings', '--js-runtimes', 'node'];
  if (existsSync(COOKIE_FILE)) args.push('--cookies', COOKIE_FILE);
  args.push('--user-agent', CFG.userAgent);
  if (CFG.proxy) args.push('--proxy', CFG.proxy);
  return args;
}

const VIDEO_ID_RE = /(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/;
const PLAYLIST_ID_RE = /list=([a-zA-Z0-9_-]+)/;

function trackFromData(v: { title?: string; url: string; durationInSec?: number; thumbnail?: string }): SearchResult {
  return {
    title: v.title ?? 'Unknown',
    url: v.url,
    duration: v.durationInSec ?? 0,
    thumbnail: v.thumbnail ?? '',
    source: Source.YouTube,
  };
}

function extractVideoId(url: string): string | null {
  return url.match(VIDEO_ID_RE)?.[1] ?? null;
}

export class YouTubeExtractor implements IMusicProvider {
  readonly name = 'YouTube';
  readonly enabled = hasCookies;
  readonly source = Source.YouTube;

  async search(query: string): Promise<SearchResult[]> {
    const results = await ytSearch(query);
    return results.videos.slice(0, 5).map((v) =>
      trackFromData({ title: v.title, url: v.url, durationInSec: v.seconds, thumbnail: v.image })
    );
  }

  validate(url: string): boolean {
    return VIDEO_ID_RE.test(url);
  }

  async getInfo(url: string): Promise<SearchResult> {
    const id = extractVideoId(url);
    if (!id) throw new Error('Invalid YouTube URL');

    const { stdout } = await ytSpawn([
      ...ytArgs(),
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
  }

  async getPlaylist(url: string): Promise<SearchResult[]> {
    const id = url.match(PLAYLIST_ID_RE)?.[1];
    if (!id) throw new Error('Invalid playlist URL');

    const { stdout } = await ytSpawn([
      ...ytArgs(),
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
  }

  async stream(url: string): Promise<Readable> {
    if (!this.validate(url)) throw new Error('Invalid YouTube URL');
    if (!hasCookies) {
      log.error('Cannot stream YouTube: no cookies configured');
      const empty = new Readable({ read() { this.push(null); } });
      (empty as any)._ytError = userMessage(YtStreamError.NoCookies);
      return empty;
    }

    const ffmpegPath = (await import('ffmpeg-static')).default;

    let streamUrl: string;
    try {
      const { stdout } = await ytSpawn([...ytArgs(), '-g', '-f', 'bestaudio', url]);
      const match = stdout.trim().split('\n').filter((l) => l.startsWith('http'));
      if (!match.length) throw new Error('No stream URL returned');
      streamUrl = match[0];
    } catch (err: any) {
      log.error(`stream failed for ${url}: ${err.msg || err.message}`);
      const empty = new Readable({ read() { this.push(null); } });
      (empty as any)._ytError = err.msg || userMessage(YtStreamError.Unknown);
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
