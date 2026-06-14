import { Readable } from 'stream';
import { spawn } from 'child_process';
import { Source } from '../types.js';
import { IMusicProvider, SearchResult } from './IMusicProvider.js';

const AUDIO_EXTS = /\.(mp3|ogg|wav|flac|m4a|aac|opus)(\?|$)/i;
const M3U8 = /\.m3u8(\?|$)/i;

const log = {
  info: (msg: string) => console.log(`[DIRECT] ${msg}`),
  error: (msg: string) => console.error(`[DIRECT] ${msg}`),
};

export class DirectProvider implements IMusicProvider {
  readonly name = 'Direct URL';
  readonly enabled = true;
  readonly source = Source.Direct;

  validate(url: string): boolean {
    try {
      const u = new URL(url);
      return AUDIO_EXTS.test(u.pathname) || M3U8.test(url);
    } catch {
      return false;
    }
  }

  async search(_query: string): Promise<SearchResult[]> {
    return [];
  }

  async getInfo(url: string): Promise<SearchResult> {
    const name = url.split('/').pop()?.split('?')[0] ?? url;
    return {
      title: name.replace(/\.\w+$/, ''),
      url,
      duration: 0,
      thumbnail: '',
      source: Source.Direct,
    };
  }

  async stream(url: string): Promise<Readable> {
    const ffmpegPath = (await import('ffmpeg-static')).default;
    log.info(`Streaming direct URL: ${url}`);
    const ffProc = spawn(ffmpegPath!, [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', url,
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
