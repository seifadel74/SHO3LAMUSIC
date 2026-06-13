import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const ButtonId = {
  PlayPause: 'music_playpause',
  Skip: 'music_skip',
  Stop: 'music_stop',
  Loop: 'music_loop',
  Shuffle: 'music_shuffle',
  Suggest: 'music_suggest',
  Favorite: 'music_favorite',
} as const;

export function nowPlayingButtons(paused: boolean, loopMode: string) {
  const playPause = new ButtonBuilder()
    .setCustomId(ButtonId.PlayPause)
    .setEmoji(paused ? '▶️' : '⏸️')
    .setStyle(ButtonStyle.Primary);

  const skip = new ButtonBuilder()
    .setCustomId(ButtonId.Skip)
    .setEmoji('⏭️')
    .setStyle(ButtonStyle.Secondary);

  const stop = new ButtonBuilder()
    .setCustomId(ButtonId.Stop)
    .setEmoji('⏹️')
    .setStyle(ButtonStyle.Danger);

  const loopLabel = loopMode === 'none' ? '🔁' : loopMode === 'track' ? '🔂' : '🔁';
  const loop = new ButtonBuilder()
    .setCustomId(ButtonId.Loop)
    .setEmoji(loopLabel)
    .setStyle(loopMode === 'none' ? ButtonStyle.Secondary : ButtonStyle.Primary);

  const shuffle = new ButtonBuilder()
    .setCustomId(ButtonId.Shuffle)
    .setEmoji('🔀')
    .setStyle(ButtonStyle.Secondary);

  const suggest = new ButtonBuilder()
    .setCustomId(ButtonId.Suggest)
    .setLabel('Suggested')
    .setEmoji('💡')
    .setStyle(ButtonStyle.Secondary);

  const fav = new ButtonBuilder()
    .setCustomId(ButtonId.Favorite)
    .setEmoji('❤️')
    .setStyle(ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(playPause, skip, stop);
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(fav, loop, shuffle, suggest);
  return [row1, row2];
}
