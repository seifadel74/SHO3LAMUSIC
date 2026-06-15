import 'dotenv/config';

export const config = {
  token: process.env.DISCORD_TOKEN ?? '',
  clientId: process.env.CLIENT_ID ?? '',
  soundcloudClientId: process.env.SOUNDCLOUD_CLIENT_ID ?? '',
  lavalinkServer: process.env.LAVALINK_SERVER ?? 'http://localhost:2333',
  lavalinkPassword: process.env.LAVALINK_PASSWORD ?? 'youshallnotpass',
};
