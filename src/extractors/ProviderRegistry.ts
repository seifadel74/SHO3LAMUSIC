import { Source } from '../types.js';
import { IMusicProvider } from './IMusicProvider.js';
import { YouTubeExtractor } from './YouTubeExtractor.js';
import { SoundCloudExtractor } from './SoundCloudExtractor.js';
import { DirectProvider } from './DirectProvider.js';

const providers: IMusicProvider[] = [];

export function initProviders(): void {
  register(new YouTubeExtractor());
  register(new SoundCloudExtractor());
  register(new DirectProvider());
}

export function register(provider: IMusicProvider): void {
  providers.push(provider);
}

function firstEnabled(source: Source): IMusicProvider | undefined {
  for (const p of providers) {
    if (p.source === source && p.enabled) return p;
  }
  return undefined;
}

function detectSource(query: string): Source | null {
  // check validate() on all providers first
  for (const p of providers) {
    if (p.validate?.(query)) return p.source;
  }
  // fallback regex
  if (/soundcloud\.com/i.test(query)) return Source.SoundCloud;
  if (/youtube\.com|youtu\.be/i.test(query)) return Source.YouTube;
  if (/\.(mp3|ogg|wav|flac|m4a|aac|opus)(\?|$)/i.test(query)) return Source.Direct;
  return null;
}

export function resolveProvider(query: string): IMusicProvider {
  const source = detectSource(query);
  if (source) {
    const p = firstEnabled(source);
    if (p) return p;
  }
  // fallback to any YouTube provider
  const yt = firstEnabled(Source.YouTube);
  if (yt) return yt;
  throw new Error('No enabled provider for this source');
}

export function getProvider(source: Source): IMusicProvider {
  const p = firstEnabled(source);
  if (p) return p;
  throw new Error(`No enabled provider for source: ${source}`);
}

export function getEnabledProviders(): IMusicProvider[] {
  return providers.filter((p) => p.enabled);
}

export function providerHealth(): Record<string, boolean> {
  const report: Record<string, boolean> = {};
  for (const p of providers) {
    report[p.name] = p.enabled;
  }
  return report;
}
