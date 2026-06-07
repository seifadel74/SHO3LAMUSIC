# Discord Music Bot

## Prerequisites
- Node.js >= 22.12.0
- npm

## Setup

```bash
git clone <repo>
cd discord-music-bot
npm install
cp .env.example .env
# Edit .env with your bot token and client ID
```

## Commands

| Command | Description |
|---------|-------------|
| /play `<query\|url>` | Play from YouTube or SoundCloud |
| /skip | Skip current track |
| /stop | Stop & clear queue |
| /pause | Pause playback |
| /resume | Resume playback |
| /volume `<0-100>` | Set volume |
| /queue `[page]` | Show queue |
| /nowplaying | Current track info |
| /loop `<off\|track\|queue>` | Set loop mode |
| /shuffle | Shuffle queue |
| /remove `<position>` | Remove track |
| /jump `<position>` | Jump to track |

## Scripts

```bash
npm run register   # Register slash commands with Discord API
npm run dev        # Run with hot-reload (tsx watch)
npm run start      # Run in production
npm run build      # Compile to JS
```

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| DISCORD_TOKEN | Yes | Bot token from Discord Developer Portal |
| CLIENT_ID | Yes | Application ID from Discord Developer Portal |
| SOUNDCLOUD_CLIENT_ID | No | Auto-detected if omitted |
