import { Source } from '../types.js';
import { IMusicProvider } from './IMusicProvider.js';
import { YouTubeExtractor } from './YouTubeExtractor.js';
import { SoundCloudExtractor } from './SoundCloudExtractor.js';
import { DirectProvider } from './DirectProvider.js';

const providers: IMusicProvider[] = [];
const bySource = new Map<Source, IMusicProvider>();

export function initProviders(): void {
  register(new YouTubeExtractor());
  register(new SoundCloudExtractor());
  register(new DirectProvider());
}

export function register(provider: IMusicProvider): void {
  providers.push(provider);
  bySource.set(provider.source, provider);
}

function detectSource(query: string): Source | null {
  for (const p of providers) {
    if (p.validate?.(query)) return p.source;
  }
  if (/soundcloud\.com/i.test(query)) return Source.SoundCloud;
  if (/youtube\.com|youtu\.be/i.test(query)) return Source.YouTube;
  if (/\.(mp3|ogg|wav|flac|m4a|aac|opus)(\?|$)/i.test(query)) return Source.Direct;
  return null;
}

export function resolveProvider(query: string): IMusicProvider {
  const source = detectSource(query);
  if (source) {
    const p = bySource.get(source);
    if (p) return p;
  }
  return bySource.get(Source.YouTube)!;
}

export function getProvider(source: Source): IMusicProvider {
  const p = bySource.get(source);
  if (!p) throw new Error(`No provider registered for source: ${source}`);
  return p;
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
