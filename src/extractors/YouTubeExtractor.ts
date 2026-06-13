import { Readable } from 'stream';
import { Source } from '../types.js';
import type { IExtractor, SearchResult } from './IExtractor.js';
import ytDlpRaw from 'yt-dlp-exec';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ytDlp = ytDlpRaw as typeof ytDlpRaw & { exec: (...args: any[]) => any };

const cookiesPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cookies.txt');
const cookies = existsSync(cookiesPath) ? { cookies: cookiesPath } : {};

const sharedFlags = {
  noPlaylist: true,
  noWarnings: true,
  extractorRetries: 3,
  retrySleep: 3,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  geoBypass: true,
  extractorArgs: 'youtube:player_client=android_creator,android;skip=webpage',
  ...cookies,
} as const;

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
    const { stdout } = await ytDlp.exec(`ytsearch5:${query}`, { ...sharedFlags, dumpJson: true });
    return stdout.trim().split('\n').filter(Boolean).map((l: string) => trackFromData(JSON.parse(l)));
  }

  async getInfo(url: string): Promise<SearchResult> {
    const data = await ytDlp(url, { ...sharedFlags, dumpJson: true });
    return trackFromData(data);
  }

  async getPlaylist(url: string): Promise<SearchResult[]> {
    const { stdout } = await ytDlp.exec(url, {
      ...sharedFlags,
      dumpJson: true,
      flatPlaylist: true,
      playlistEnd: 50,
    }, { timeout: 60000 });
    return stdout.trim().split('\n').filter(Boolean).map((l: string) => trackFromData(JSON.parse(l)));
  }

  async stream(url: string): Promise<Readable> {
    const sub = ytDlp.exec(url, {
      ...sharedFlags,
      format: 'bestaudio[ext=m4a]/bestaudio/best',
      output: '-',
      sponsorblockRemove: 'sponsor,selfpromo',
    }, { stdio: ['ignore', 'pipe', 'ignore'] });

    let stderr = '';
    sub.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    sub.on('close', (code: number | null) => {
      if (code !== 0 && sub.stdout && !sub.stdout.destroyed) {
        sub.stdout.destroy(new Error(`yt-dlp exited ${code}: ${stderr.trim().split('\n').pop()}`));
      }
    });
    sub.on('error', (err: Error) => {
      if (sub.stdout && !sub.stdout.destroyed) sub.stdout.destroy(err);
    });

    return sub.stdout!;
  }
}
