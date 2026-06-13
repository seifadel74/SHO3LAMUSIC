import { Source } from '../types.js';
import { IExtractor } from './IExtractor.js';
import { YouTubeExtractor } from './YouTubeExtractor.js';
import { SoundCloudExtractor } from './SoundCloudExtractor.js';

const extractors: Map<Source, IExtractor> = new Map();

export function initExtractors(): void {
  extractors.set(Source.YouTube, new YouTubeExtractor());
  extractors.set(Source.SoundCloud, new SoundCloudExtractor());
}

function detectSource(query: string): Source {
  if (/soundcloud\.com/i.test(query)) return Source.SoundCloud;
  return Source.YouTube;
}

export function getExtractor(query: string): IExtractor {
  const source = detectSource(query);
  const ext = extractors.get(source);
  if (!ext) throw new Error(`No extractor for ${source}`);
  return ext;
}

export function getExtractorForSource(source: Source): IExtractor {
  const ext = extractors.get(source);
  if (!ext) throw new Error(`No extractor for ${source}`);
  return ext;
}
