# Discord Music Bot — PROJECT_MAP

## [TECH_STACK]
| Layer | Package | Version | Notes |
|-------|---------|---------|-------|
| Runtime | Node.js | >=22.12.0 | Required by discord.js v14.26.4 |
| Language | TypeScript | ~5.7 | Strict mode |
| Discord API | discord.js | ^14.26.4 | Slash commands, Gateway intents |
| Voice API | @discordjs/voice | ^0.19.2 | Audio player, voice connections |
| Opus Codec | @discordjs/opus | ^0.4.0 | Opus encoding (best perf) |
| FFmpeg | ffmpeg-static | ^5.3.0 | Bundles ffmpeg 6.1.1, transcoding fallback |
| YouTube | youtubei.js | ^17.0.1 | InnerTube API, search + stream |
| SoundCloud | soundcloud-downloader | latest | SCDL API v2 wrapper, search + stream |
| Encryption | sodium-native | ^3.3.0 | Optional, only if AES-256-GCM unavailable |

## [SYSTEM_FLOW]
```
User (/play query/url)
  → InteractionHandler.parse(interaction)
    → CommandRouter.route('play')
      → MusicService.handlePlay(guildId, query, member)
        → VoiceManager.join(channel) [@discordjs/voice]
          → QueueManager.enqueue(query)
            → ExtractorRouter.resolve(query)
              ├─ YouTubeExtractor.search/stream [youtubei.js]
              └─ SoundCloudExtractor.search/stream [scdl]
            → Track[]{title, url, duration, thumbnail, source}
          → if nothing playing: Player.play(track)
            → AudioPlayer.subscribe(stream → FFmpegOpus → OpusEncoder)
              → VoiceConnection.dispatchAudio()
```

### User Journey (Commands)
| Command | Flow |
|---------|------|
| `/play <query>` | Search YT+SC → resolve best match → add to queue → play if idle |
| `/skip` | Stop current → play next in queue → if none, idle |
| `/stop` | Clear queue → stop player → disconnect voice |
| `/queue` | Paginated embed of queued tracks (max 10/page) |
| `/nowplaying` | Embed with progress bar, title, requester |
| `/pause` | AudioPlayer.pause() |
| `/resume` | AudioPlayer.unpause() |
| `/volume <0-100>` | Resource.volume.setVolume(vol/100) |
| `/loop [off\|one\|all]` | Set loopMode → affects next-track logic |
| `/shuffle` | Fisher-Yates shuffle on queue[1..n] |
| `/remove <pos>` | Splice from queue |
| `/jump <pos>` | Set currentIndex → play immediately |

## [ARCHITECTURE]
```
src/
├── index.ts                 # Entry: init client, register commands, login
├── config.ts                # Env vars (TOKEN, CLIENT_ID, YT cookies, SC ID)
├── types.ts                 # Shared: Track, QueueState, LoopMode, ExtractorResult
├── core/
│   ├── Logger.ts            # Async logger (error|warn|info|debug) — writes to stdout + optional file
│   └── constants.ts         # EMBED_COLORS, TIMEOUTS, MAX_QUEUE_SIZE, etc.
├── commands/
│   ├── registry.ts          # Slash command builder definitions + deploy
│   └── handler.ts           # Interaction routing: commandName → music method
├── music/
│   ├── MusicService.ts      # Facade over all music operations (entry point for handlers)
│   ├── QueueManager.ts      # Map<guildId, Queue> — create, destroy, get
│   ├── Queue.ts             # Circular queue: tracks[], index, loopMode, add/remove/skip/shuffle
│   ├── Player.ts            # Wraps AudioPlayer: play/pause/resume/stop/volume + event wiring
│   └── VoiceManager.ts      # Join/leave voice channels, connection lifecycle
├── extractors/
│   ├── ExtractorRouter.ts   # URL pattern matching → delegates to correct extractor
│   ├── IExtractor.ts        # Interface: resolve(query): Promise<Track[]>, stream(track): Readable
│   ├── YouTubeExtractor.ts  # youtubei.js Innertube session — search, getInfo, stream (opus direct)
│   └── SoundCloudExtractor.ts # scdl — search, getInfo, stream audio
└── utils/
    ├── embed.ts             # Queue embed, nowplaying embed builders
    └── validation.ts        # URL validation, query sanitisation
```

### Key Design Decisions
- **Single-file commands** (`commands/handler.ts`): all 12 commands handled by MusicService. No micro-files per command.
- **In-memory state**: `Map<Snowflake, GuildQueue>` — no database needed at this scope.
- **Audio pipeline**: youtubei.js can extract direct Opus streams (webm/opus) where available → skip FFmpeg → lower CPU. FFmpeg fallback for incompatible formats.
- **SoundCloud**: scdl returns audio stream directly, requires client_id from env.
- **LoopMode enum**: `NONE | TRACK | QUEUE` — drives next-track logic in Queue.

## [ORPHANS & PENDING]
- SoundCloud client_id extraction strategy (hardcoded vs dynamic fetch)
- Error recovery on YouTube streaming failures (rate limits, bot detection)
- Voice reconnection on server move
- Queue persistence (future: optional Redis/JSON file)
- Dockerfile for deployment
- `.env.example` documentation
