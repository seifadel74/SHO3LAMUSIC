import { Readable } from 'stream';
import { Source } from '../types.js';
import type { IExtractor, SearchResult } from './IExtractor.js';
import ytdl from '@distube/ytdl-core';
import ytSearch from 'yt-search';

const FALLBACK_COOKIES = `# Netscape HTTP Cookie File
# https://curl.haxx.se/rfc/cookie_spec.html
# This is a generated file! Do not edit.

.youtube.com	TRUE	/	TRUE	1815602770	LOGIN_INFO	AFmmF2swRAIgAinudWoYeF-wFOjTWUhZtaLU969GStF3ryZqG2TbWYoCIGF1EjzXX1YNRJ03K-6tFHbeeAN1uhs2J97GraZKztHg:QUQ3MjNmeXpZdFdfX0VSdHgwaDhLa2dJQk1FdzJFMFZPSFd0WDZlbWJTMms4Q3FCLUdSSjhvdUFiU1liQTE5TUtucm01ME9tdUZqeGJRV1dmblRfcmIzQm1hS0RwOFAwcS12VDlya20ydXZCQU5oV3JZSHlqMVFJZlJCRUVrSl9yV2piY1BzUVEzTS1nZzdBYmUteGRaTDlKRDJ3QkZqWTBR
.youtube.com	TRUE	/	TRUE	1815953783	PREF	f6=40000000&tz=Africa.Cairo&f7=100
.youtube.com	TRUE	/	FALSE	1815871193	SID	g.a000_Ahe9TRNNQBnh-hpfDkDoYz4MlePH8p8V-TPPpRWuRgfC9cLTln4CGPu6pN2skBV938mugACgYKAXUSARESFQHGX2MiN8p7d1tnq9Xu3BO6eVawdRoVAUF8yKoBOikfzO9NGgOpLmQPJO0A0076
.youtube.com	TRUE	/	TRUE	1815871193	__Secure-1PSID	g.a000_Ahe9TRNNQBnh-hpfDkDoYz4MlePH8p8V-TPPpRWuRgfC9cLDDl9V-IWDKTfIzCweJpXIAACgYKAYkSARESFQHGX2MiUlMKR7j7Y-k-oDb-UnmtQBoVAUF8yKrHo7ICXzLl4n50Tkfldegy0076
.youtube.com	TRUE	/	TRUE	1815871193	__Secure-3PSID	g.a000_Ahe9TRNNQBnh-hpfDkDoYz4MlePH8p8V-TPPpRWuRgfC9cLENnr1XIBdtbn8nvCZsq81AACgYKASASARESFQHGX2MiSyg26Jo2pUS4INpYJQPXVhoVAUF8yKpW-sIkuXZ7C1SuJEWYrtE20076
.youtube.com	TRUE	/	FALSE	1815871193	HSID	AxOa9NHuEcT3e2HOL
.youtube.com	TRUE	/	TRUE	1815871193	SSID	Aia8GePKgZqAdDN_3
.youtube.com	TRUE	/	FALSE	1815871193	APISID	wjNmlgYTAbyBClCf/AJHAS4MpMuJbR72yQ
.youtube.com	TRUE	/	TRUE	1815871193	SAPISID	8vJi7--M1FaT8Cx8/AVwHKT_OeAvMvNUs1
.youtube.com	TRUE	/	TRUE	1815871193	__Secure-1PAPISID	8vJi7--M1FaT8Cx8/AVwHKT_OeAvMvNUs1
.youtube.com	TRUE	/	TRUE	1815871193	__Secure-3PAPISID	8vJi7--M1FaT8Cx8/AVwHKT_OeAvMvNUs1
.youtube.com	TRUE	/	FALSE	1781393788	ST-xuwub9	session_logininfo=AFmmF2swRAIgAinudWoYeF-wFOjTWUhZtaLU969GStF3ryZqG2TbWYoCIGF1EjzXX1YNRJ03K-6tFHbeeAN1uhs2J97GraZKztHg%3AQUQ3MjNmeXpZdFdfX0VSdHgwaDhLa2dJQk1FdzJFMFZPSFd0WDZlbWJTMms4Q3FCLUdSSjhvdUFiU1liQTE5TUtucm01ME9tdUZqeGJRV1dmblRfcmIzQm1hS0RwOFAwcS12VDlya20ydXZCQU5oV3JZSHlqMVFJZlJCRUVrSl9yV2piY1BzUVEzTS1nZzdBYmUteGRaTDlKRDJ3QkZqWTBR
.youtube.com	TRUE	/	FALSE	1781393789	ST-3opvp5	session_logininfo=AFmmF2swRAIgAinudWoYeF-wFOjTWUhZtaLU969GStF3ryZqG2TbWYoCIGF1EjzXX1YNRJ03K-6tFHbeeAN1uhs2J97GraZKztHg%3AQUQ3MjNmeXpZdFdfX0VSdHgwaDhLa2dJQk1FdzJFMFZPSFd0WDZlbWJTMms4Q3FCLUdSSjhvdUFiU1liQTE5TUtucm01ME9tdUZqeGJRV1dmblRfcmIzQm1hS0RwOFAwcS12VDlya20ydXZCQU5oV3JZSHlqMVFJZlJCRUVrSl9yV2piY1BzUVEzTS1nZzdBYmUteGRaTDlKRDJ3QkZqWTBR
.youtube.com	TRUE	/	TRUE	1812929785	__Secure-1PSIDTS	sidts-CjUByojQU7i_tMM4eo1fDnq4nqTENfZy8NnkwEoLCFw5sbtIsPcpS9hMY8apls13M7NqTjJKURAA
.youtube.com	TRUE	/	TRUE	1812929785	__Secure-3PSIDTS	sidts-CjUByojQU7i_tMM4eo1fDnq4nqTENfZy8NnkwEoLCFw5sbtIsPcpS9hMY8apls13M7NqTjJKURAA
.youtube.com	TRUE	/	FALSE	1812929786	SIDCC	AKEyXzVo0u1Hlru4pyvM1lZcL6SNd6kuVqmwwaSrW8OigYSeGl4MnQx5cOFu8IujrvFxzXcyUNA
.youtube.com	TRUE	/	TRUE	1812929786	__Secure-1PSIDCC	AKEyXzWLps2EL5psQbBrvth5hijbGvNVtKPzJo3gEXUPRVcf_6coD2K-qqDiK8yiALzMmzJuj8U
.youtube.com	TRUE	/	TRUE	1812929786	__Secure-3PSIDCC	AKEyXzU1SxKbAs5LUs2ehfCpYEEDCo8ojB0SC0Jhqt7S6wr_8YdC1UpBi4jV7UWsFfm0tA-e9g
.youtube.com	TRUE	/	TRUE	1796945779	VISITOR_INFO1_LIVE	8fVLVENxV8s
.youtube.com	TRUE	/	TRUE	1796945779	VISITOR_PRIVACY_METADATA	CgJFRxIEGgAgWg%3D%3D
.youtube.com	TRUE	/	TRUE	1796869534	__Secure-YNID	19.YT=at_aH11kyRCnHhygz4HwHy-cmagvJLKve9kB3pMv0R-m_Ob2KzXYHRLS1CjE6yddsZS1lHGMOVuqO98JO-LdIp2rlLb7ukahgLbkfisuW9IiU12C9Nf061QpENYr2DfPQ8oKA-401GjDTxMyJW8VSeOtJP9rd0aYP45fSlYEUUkgh0YSJvqWhr8WK_xwju_lAJxd72HJXUyvYxMNUnCvGKSEICARj0juqdm9aRuiyCAe_B5SfFopYAIfE1VMZaG1Bzn6CBHLLqLi8LbOJ62xOYbQN6W4F8Lrnf6z9AgvDIkCRYr65Xr5UwkZ59VirdcM448-unAxNukE81gGlxlzYA
.youtube.com	TRUE	/	TRUE	1796869534	__Secure-ROLLOUT_TOKEN	CPGF87n9mv_IEBDfhYbzs_uUAxjRsKL3lIOVAw%3D%3D
.youtube.com	TRUE	/	TRUE	0	YSC	TDrBRnZ8Q2o`;

const raw = process.env.YOUTUBE_COOKIES || FALLBACK_COOKIES;
let agent: ReturnType<typeof ytdl.createAgent> | undefined;

function tryCreateAgent(): typeof agent {
  if (!raw) return;
  const parts = raw.includes('#') ? raw.split(/\r?\n/).filter((l) => !l.startsWith('#') && l.includes('\t')) : raw.split(';');
  const cookies: { name: string; value: string }[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const fields = trimmed.split('\t');
    let name: string, value: string;
    if (fields.length >= 7) {
      // Netscape cookie file format: domain  flag  path  secure  expiry  name  value
      name = fields[5]?.trim();
      value = fields[6]?.trim();
    } else {
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      name = trimmed.slice(0, eq).trim();
      value = trimmed.slice(eq + 1).trim();
    }
    if (!name || !value) continue;
    try { value = decodeURIComponent(value); } catch { /* keep as-is */ }
    // Skip cookies with invalid characters in value
    if (/[\x00-\x1f\x7f"(),\\<>@;:{}\[\]\?]/.test(value)) continue;
    cookies.push({ name, value });
  }

  if (!cookies.length) return;
  try {
    return ytdl.createAgent(cookies);
  } catch {
    return;
  }
}

agent = tryCreateAgent();

const requestOptions: ytdl.downloadOptions = agent ? { agent } : {};

function retry<T>(fn: () => Promise<T>, n = 3): Promise<T> {
  return fn().catch((err) => {
    if (n <= 1) throw err;
    return new Promise<T>((r) => setTimeout(() => r(retry(fn, n - 1)), 2000));
  });
}

function trackFromData(v: {
  title?: string;
  url: string;
  durationInSec?: number;
  thumbnail?: string;
}): SearchResult {
  return {
    title: v.title ?? 'Unknown',
    url: v.url,
    duration: v.durationInSec ?? 0,
    thumbnail: v.thumbnail ?? '',
    source: Source.YouTube,
  };
}

export class YouTubeExtractor implements IExtractor {
  readonly source = Source.YouTube;

  async search(query: string): Promise<SearchResult[]> {
    const results = await ytSearch(query);
    return results.videos.slice(0, 5).map((v) =>
      trackFromData({
        title: v.title,
        url: v.url,
        durationInSec: v.seconds,
        thumbnail: v.image,
      })
    );
  }

  async getInfo(url: string): Promise<SearchResult> {
    const id = ytdl.getVideoID(url);
    const data = await ytSearch({ videoId: id });
    return trackFromData({
      title: data.title,
      url: data.url,
      durationInSec: data.seconds,
      thumbnail: data.image,
    });
  }

  async getPlaylist(url: string): Promise<SearchResult[]> {
    const id = url.match(/list=([a-zA-Z0-9_-]+)/)?.[1];
    if (!id) throw new Error('Invalid playlist URL');
    const data = await ytSearch({ listId: id });
    return (data.videos ?? []).map((v) =>
      trackFromData({
        title: v.title,
        url: v.url,
        durationInSec: v.seconds,
        thumbnail: v.image,
      })
    );
  }

  async stream(url: string): Promise<Readable> {
    const opts: ytdl.downloadOptions = { ...requestOptions };
    const info = await retry(() => ytdl.getInfo(url, opts));
    const audio = ytdl.filterFormats(info.formats, 'audioonly');
    if (!audio.length) throw new Error('No audio stream found');
    const format = ytdl.chooseFormat(audio, { quality: 'highestaudio' });
    return ytdl.downloadFromInfo(info, { ...opts, format }) as Readable;
  }
}
