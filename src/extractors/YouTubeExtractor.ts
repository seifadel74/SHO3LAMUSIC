import { spawn } from 'child_process';
import { Readable } from 'stream';
import { Source } from '../types.js';
import type { IExtractor, SearchResult } from './IExtractor.js';

function execYtDlp(args: string[], timeout = 20000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { proc.kill(); reject(new Error('yt-dlp timed out')); }, timeout);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`yt-dlp exited ${code}: ${stderr.trim().split('\n').pop()}`));
    });
    proc.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(new Error('yt-dlp not found. Install from https://github.com/yt-dlp/yt-dlp'));
      } else {
        reject(err);
      }
    });
  });
}

import { writeFileSync } from 'fs';
import { join } from 'path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

const COOKIE_PATH = join('/tmp', 'youtube_cookies.txt');
const cookieFlags: string[] = process.env.YOUTUBE_COOKIES
  ? (writeFileSync(COOKIE_PATH, process.env.YOUTUBE_COOKIES), ['--cookies', COOKIE_PATH])
  : [];

const baseFlags = [
  '--no-playlist', '--no-warnings',
  '--extractor-retries', '3',
  '--user-agent', UA,
  ...cookieFlags,
];

export class YouTubeExtractor implements IExtractor {
  readonly source = Source.YouTube;

  async search(query: string): Promise<SearchResult[]> {
    const { stdout } = await execYtDlp([
      `ytsearch5:${query}`,
      '--dump-json',
      '--flat-playlist',
      ...baseFlags,
    ]);
    return stdout.trim().split('\n').filter(Boolean).map((line) => {
      const data = JSON.parse(line);
      return {
        title: data.title ?? 'Unknown',
        url: data.webpage_url ?? `https://youtube.com/watch?v=${data.id}`,
        duration: data.duration ?? 0,
        thumbnail: data.thumbnail ?? '',
        source: Source.YouTube,
      };
    });
  }

  async getInfo(url: string): Promise<SearchResult> {
    const { stdout } = await execYtDlp([
      url,
      '--dump-json',
      ...baseFlags,
    ]);
    const data = JSON.parse(stdout);
    return {
      title: data.title ?? 'Unknown',
      url: data.webpage_url ?? url,
      duration: data.duration ?? 0,
      thumbnail: data.thumbnail ?? '',
      source: Source.YouTube,
    };
  }

  async stream(url: string): Promise<Readable> {
    const { stdout } = await execYtDlp([
      url, '-f', 'bestaudio[ext=m4a]/bestaudio/best', '--get-url',
      ...baseFlags,
    ], 30000);
    const streamUrl = stdout.trim();
    if (!streamUrl) throw new Error('Could not extract stream URL');

    const res = await fetch(streamUrl, { headers: { 'User-Agent': UA } });
    if (!res.ok || !res.body) throw new Error(`Stream HTTP ${res.status}`);
    return Readable.fromWeb(res.body as any);
  }
}
