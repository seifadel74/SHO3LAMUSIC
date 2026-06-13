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

const baseFlags = [
  '--no-playlist',
  '--no-warnings',
  '--extractor-retries', '3',
  '--retry-sleep', '3',
  '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  '--geo-bypass',
];

function trackFromData(data: any): SearchResult {
  return {
    title: data.title ?? 'Unknown',
    url: data.webpage_url ?? `https://youtube.com/watch?v=${data.id}`,
    duration: data.duration ?? 0,
    thumbnail: data.thumbnail ?? '',
    source: Source.YouTube,
  };
}

export class YouTubeExtractor implements IExtractor {
  readonly source = Source.YouTube;

  async search(query: string): Promise<SearchResult[]> {
    const { stdout } = await execYtDlp([
      `ytsearch5:${query}`,
      '--dump-json',
      ...baseFlags,
    ]);
    return stdout.trim().split('\n').filter(Boolean).map(trackFromData);
  }

  async getInfo(url: string): Promise<SearchResult> {
    const { stdout } = await execYtDlp([
      url, '--dump-json',
      ...baseFlags,
    ]);
    return trackFromData(JSON.parse(stdout));
  }

  async getPlaylist(url: string): Promise<SearchResult[]> {
    const { stdout } = await execYtDlp([
      url, '--dump-json',
      '--flat-playlist',
      '--playlist-end', '50',
      ...baseFlags,
    ], 60000);
    return stdout.trim().split('\n').filter(Boolean).map(trackFromData);
  }

  async stream(url: string): Promise<Readable> {
    const proc = spawn('yt-dlp', [
      url, '-f', 'bestaudio[ext=m4a]/bestaudio/best',
      '-o', '-',
      '--sponsorblock-remove', 'sponsor,selfpromo',
      ...baseFlags,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    const stream = proc.stdout.on('close', () => proc.kill());

    proc.on('close', (code) => {
      if (code !== 0 && !stream.destroyed) {
        stream.destroy(new Error(`yt-dlp exited ${code}: ${stderr.trim().split('\n').pop()}`));
      }
    });

    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (!stream.destroyed) stream.destroy(err);
    });

    return stream;
  }
}
