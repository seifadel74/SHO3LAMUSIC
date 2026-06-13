import { Readable } from 'stream';
import { spawn, execSync } from 'child_process';
import { writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Source } from '../types.js';
import type { IExtractor, SearchResult } from './IExtractor.js';
import ytSearch from 'yt-search';

const COOKIE_FILE = join(tmpdir(), 'yt-cookies.txt');
const YT_DLP = existsSync('yt-dlp') ? './yt-dlp' : 'yt-dlp';

const FALLBACK_COOKIES = `# Netscape HTTP Cookie File
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
.youtube.com	TRUE	/	FALSE	1781393788	ST-xuwub9	session_logininfo=AFmmF2swRAIgAinudWoYeF-wFOjTWUhZtaLU969GStF3ryZqG2TbWYoCIGF1EjzXX1YNRJ03K-6tFHbeeAN1uhs2J97GraZKztHg:QUQ3MjNmeXpZdFdfX0VSdHgwaDhLa2dJQk1FdzJFMFZPSFd0WDZlbWJTMms4Q3FCLUdSSjhvdUFiU1liQTE5TUtucm01ME9tdUZqeGJRV1dmblRfcmIzQm1hS0RwOFAwcS12VDlya20ydXZCQU5oV3JZSHlqMVFJZlJCRUVrSl9yV2piY1BzUVEzTS1nZzdBYmUteGRaTDlKRDJ3QkZqWTBR
.youtube.com	TRUE	/	FALSE	1781393789	ST-3opvp5	session_logininfo=AFmmF2swRAIgAinudWoYeF-wFOjTWUhZtaLU969GStF3ryZqG2TbWYoCIGF1EjzXX1YNRJ03K-6tFHbeeAN1uhs2J97GraZKztHg:QUQ3MjNmeXpZdFdfX0VSdHgwaDhLa2dJQk1FdzJFMFZPSFd0WDZlbWJTMms4Q3FCLUdSSjhvdUFiU1liQTE5TUtucm01ME9tdUZqeGJRV1dmblRfcmIzQm1hS0RwOFAwcS12VDlya20ydXZCQU5oV3JZSHlqMVFJZlJCRUVrSl9yV2piY1BzUVEzTS1nZzdBYmUteGRaTDlKRDJ3QkZqWTBR
.youtube.com	TRUE	/	TRUE	1812929785	__Secure-1PSIDTS	sidts-CjUByojQU7i_tMM4eo1fDnq4nqTENfZy8NnkwEoLCFw5sbtIsPcpS9hMY8apls13M7NqTjJKURAA
.youtube.com	TRUE	/	TRUE	1812929785	__Secure-3PSIDTS	sidts-CjUByojQU7i_tMM4eo1fDnq4nqTENfZy8NnkwEoLCFw5sbtIsPcpS9hMY8apls13M7NqTjJKURAA
.youtube.com	TRUE	/	FALSE	1812929786	SIDCC	AKEyXzVo0u1Hlru4pyvM1lZcL6SNd6kuVqmwwaSrW8OigYSeGl4MnQx5cOFu8IujrvFxzXcyUNA
.youtube.com	TRUE	/	TRUE	1812929786	__Secure-1PSIDCC	AKEyXzWLps2EL5psQbBrvth5hijbGvNVtKPzJo3gEXUPRVcf_6coD2K-qqDiK8yiALzMmzJuj8U
.youtube.com	TRUE	/	TRUE	1812929786	__Secure-3PSIDCC	AKEyXzU1SxKbAs5LUs2ehfCpYEEDCo8ojB0SC0Jhqt7S6wr_8YdC1UpBi4jV7UWsFfm0tA-e9g
.youtube.com	TRUE	/	TRUE	1796945779	VISITOR_INFO1_LIVE	8fVLVENxV8s
.youtube.com	TRUE	/	TRUE	1796945779	VISITOR_PRIVACY_METADATA	CgJFRxIEGgAgWg==
.youtube.com	TRUE	/	TRUE	1796869534	__Secure-YNID	19.YT=at_aH11kyRCnHhygz4HwHy-cmagvJLKve9kB3pMv0R-m_Ob2KzXYHRLS1CjE6yddsZS1lHGMOVuqO98JO-LdIp2rlLb7ukahgLbkfisuW9IiU12C9Nf061QpENYr2DfPQ8oKA-401GjDTxMyJW8VSeOtJP9rd0aYP45fSlYEUUkgh0YSJvqWhr8WK_xwju_lAJxd72HJXUyvYxMNUnCvGKSEICARj0juqdm9aRuiyCAe_B5SfFopYAIfE1VMZaG1Bzn6CBHLLqLi8LbOJ62xOYbQN6W4F8Lrnf6z9AgvDIkCRYr65Xr5UwkZ59VirdcM448-unAxNukE81gGlxlzYA
.youtube.com	TRUE	/	TRUE	1796869534	__Secure-ROLLOUT_TOKEN	CPGF87n9mv_IEBDfhYbzs_uUAxjRsKL3lIOVAw==
.youtube.com	TRUE	/	TRUE	0	YSC	TDrBRnZ8Q2o`;

if (!existsSync(COOKIE_FILE)) {
  writeFileSync(COOKIE_FILE, process.env.YOUTUBE_COOKIES || FALLBACK_COOKIES, 'utf-8');
}

function trackFromData(v: { title?: string; url: string; durationInSec?: number; thumbnail?: string }): SearchResult {
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
      trackFromData({ title: v.title, url: v.url, durationInSec: v.seconds, thumbnail: v.image })
    );
  }

  async getInfo(url: string): Promise<SearchResult> {
    const id = url.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/)?.[1];
    if (!id) throw new Error('Invalid YouTube URL');
    const json = JSON.parse(
      execSync(
        `${YT_DLP} --dump-json --no-warnings --flat-playlist --cookies "${COOKIE_FILE}" "https://youtube.com/watch?v=${id}"`,
        { encoding: 'utf-8', timeout: 15000 }
      )
    );
    return trackFromData({
      title: json.title,
      url: `https://youtube.com/watch?v=${id}`,
      durationInSec: json.duration ?? 0,
      thumbnail: json.thumbnail ?? '',
    });
  }

  async getPlaylist(url: string): Promise<SearchResult[]> {
    const id = url.match(/list=([a-zA-Z0-9_-]+)/)?.[1];
    if (!id) throw new Error('Invalid playlist URL');
    const output = execSync(
      `${YT_DLP} --dump-json --no-warnings --flat-playlist --cookies "${COOKIE_FILE}" "${url}"`,
      { encoding: 'utf-8', timeout: 30000 }
    );
    return output
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
    const proc = spawn(YT_DLP, [
      '-f',
      'bestaudio[ext=m4a]/bestaudio',
      '-o',
      '-',
      '--cookies',
      COOKIE_FILE,
      '--no-warnings',
      url,
    ]);
    proc.on('error', () => proc.kill());
    return proc.stdout;
  }
}
