import { Shoukaku, Connectors } from 'shoukaku';
import { Client } from 'discord.js';
import { logger } from '../core/Logger.js';

const LAVALINK_SERVER = process.env.LAVALINK_SERVER || 'http://localhost:2333';
const LAVALINK_PASSWORD = process.env.LAVALINK_PASSWORD || 'youshallnotpass';

let shoukaku: Shoukaku | null = null;

export function initLavalink(client: Client): Shoukaku {
  const nodes = [
    { name: 'Railway', url: LAVALINK_SERVER, auth: LAVALINK_PASSWORD },
  ];

  shoukaku = new Shoukaku(new Connectors.DiscordJS(client), nodes, {
    resume: true,
    resumeTimeout: 30,
    reconnectTries: 10,
    reconnectInterval: 5000,
    restTimeout: 15000,
  });

  shoukaku.on('ready', (name) => logger.info(`Lavalink node "${name}" ready`));
  shoukaku.on('error', (name, err) => logger.error(`Lavalink error on "${name}": ${err.message}`));
  shoukaku.on('close', (name, code, reason) =>
    logger.warn(`Lavalink "${name}" closed (${code}): ${reason}`),
  );
  shoukaku.on('debug', (name, info) => logger.info(`[LL ${name}] ${info}`));

  return shoukaku;
}

export function getShoukaku(): Shoukaku {
  if (!shoukaku) throw new Error('Lavalink not initialized');
  return shoukaku;
}
