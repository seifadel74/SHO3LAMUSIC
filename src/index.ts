import { Client, GatewayIntentBits, Events } from 'discord.js';
import { config } from './config.js';
import { logger } from './core/Logger.js';
import { handleInteraction } from './commands/handler.js';
import { handleButtonInteraction } from './music/MusicService.js';
import { initLavalink } from './lavalink/Manager.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  logger.info(`Logged in as ${c.user.tag}`);
  initLavalink(client);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    await handleInteraction(interaction);
  } else if (interaction.isButton()) {
    await handleButtonInteraction(interaction);
  }
});

client.login(config.token);

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught: ${err.message}`);
});
process.on('unhandledRejection', (err: any) => {
  logger.error(`Unhandled rejection: ${err?.message || err}`);
});
