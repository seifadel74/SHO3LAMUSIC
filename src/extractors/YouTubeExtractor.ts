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

import { existsSync } from 'fs';

const cookieFlags: string[] = existsSync('cookies.txt') ? ['--cookies', 'cookies.txt'] : [];

export class YouTubeExtractor implements IExtractor {
  readonly source = Source.YouTube;

  async search(query: string): Promise<SearchResult[]> {
    const { stdout } = await execYtDlp([
      `ytsearch5:${query}`,
      '--dump-json',
      '--no-playlist',
      '--flat-playlist',
      '--no-warnings',
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
      '--no-playlist',
      '--no-warnings',
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
      ...cookieFlags, url, '-f', 'bestaudio', '--get-url', '--no-playlist', '--no-warnings',
    ], 30000);
    const streamUrl = stdout.trim();
    if (!streamUrl) throw new Error('Could not extract stream URL');

    const res = await fetch(streamUrl);
    if (!res.ok || !res.body) throw new Error(`Stream HTTP ${res.status}`);
    return Readable.fromWeb(res.body as any);
  }
}
