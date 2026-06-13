import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import {
  handlePlay,
  handleSkip,
  handleStop,
  handlePause,
  handleResume,
  handleVolume,
  handleQueue,
  handleNowPlaying,
  handleLoop,
  handleShuffle,
  handleRemove,
  handleJump,
  handleSuggest,
  handleFavorite,
  handleStats,
  handleHelp,
  handleMyStats,
} from '../music/MusicService.js';
import { logger } from '../core/Logger.js';

const handlers: Record<string, (i: ChatInputCommandInteraction) => Promise<void>> = {
  play: handlePlay,
  skip: handleSkip,
  stop: handleStop,
  pause: handlePause,
  resume: handleResume,
  volume: handleVolume,
  queue: handleQueue,
  nowplaying: handleNowPlaying,
  loop: handleLoop,
  shuffle: handleShuffle,
  remove: handleRemove,
  jump: handleJump,
  suggest: handleSuggest,
  favorite: handleFavorite,
  stats: handleStats,
  help: handleHelp,
  mystats: handleMyStats,
};

export async function handleInteraction(interaction: ChatInputCommandInteraction): Promise<void> {
  const handler = handlers[interaction.commandName];
  if (!handler) {
    await interaction.reply({ content: 'Unknown command.', flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    await handler(interaction);
  } catch (err) {
    logger.error(`Command ${interaction.commandName}:`, err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content: `Error: ${msg}` });
    } else {
      await interaction.reply({ content: `Error: ${msg}`, flags: MessageFlags.Ephemeral });
    }
  }
}
