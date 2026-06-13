import {
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  Snowflake,
  ButtonInteraction,
  TextChannel,
  NewsChannel,
  ThreadChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { Player } from './Player.js';
import { connectToVoice, disconnectFromVoice, getConnection } from './VoiceManager.js';
import {
  getQueue,
  deleteQueue,
  addTrackAndSave,
  removeTrackAndSave,
  skipTrackAndSave,
  clearQueueAndSave,
  jumpTo,
  shuffleQueue,
  setNowPlayingMessage,
  deleteNowPlayingMessage,
  initQueues,
} from './QueueManager.js';
import { getExtractor, initExtractors, getExtractorForSource } from '../extractors/ExtractorRouter.js';
import { Track, Source } from '../types.js';
import { isValidUrl } from '../utils/validation.js';
import { logger } from '../core/Logger.js';
import { nowPlayingButtons } from '../interactions/buttons.js';
import { formatDuration } from '../utils/embed.js';
import { addFavorite, removeFavorite, getUserFavorites, loadFavorites } from './FavStore.js';
import { trackPlayed, getStats, loadStats } from './StatsStore.js';
import { trackPlayedByUser, loadUserStats, getUserStats } from './UserStatsStore.js';

const players = new Map<Snowflake, Player>();
const idleTimers = new Map<Snowflake, NodeJS.Timeout>();
const suggestions = new Map<Snowflake, Track[]>();

let initialized = false;

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const SUGGESTIONS_COUNT = 5;

function clearIdleTimer(guildId: Snowflake) {
  const timer = idleTimers.get(guildId);
  if (timer) {
    clearTimeout(timer);
    idleTimers.delete(guildId);
  }
}

function startIdleTimer(guildId: Snowflake) {
  clearIdleTimer(guildId);
  idleTimers.set(guildId, setTimeout(() => {
    idleTimers.delete(guildId);
    disconnectFromVoice(guildId);
    deleteQueue(guildId);
    deleteNowPlayingMessage(guildId);
  }, IDLE_TIMEOUT_MS));
}

function ensureInit() {
  if (!initialized) {
    initExtractors();
    initQueues();
    loadFavorites();
    loadStats();
    loadUserStats();
    initialized = true;
  }
}

function getPlayer(guildId: Snowflake): Player {
  let player = players.get(guildId);
  if (!player) {
    player = new Player();
    players.set(guildId, player);
  }
  return player;
}

async function updateNowPlaying(guildId: Snowflake) {
  const queue = getQueue(guildId);
  const track = queue.tracks[queue.currentIndex];
  if (!track) return;

  const { nowPlayingEmbed } = await import('../utils/embed.js');
  const embed = nowPlayingEmbed(track);
  const paused = getPlayer(guildId).state === 'paused';
  const buttons = nowPlayingButtons(paused, queue.loopMode);

  const { getNowPlayingMessage } = await import('./QueueManager.js');
  const msg = getNowPlayingMessage(guildId);
  if (msg) {
    try { await msg.edit({ embeds: [embed], components: buttons }); } catch {}
  }
}

async function getSendChannel(_interaction: ChatInputCommandInteraction | null, guildId: Snowflake): Promise<TextChannel | NewsChannel | ThreadChannel | null> {
  if (_interaction?.channel) return _interaction.channel as TextChannel | NewsChannel | ThreadChannel;
  const { getNowPlayingMessage } = await import('./QueueManager.js');
  const msg = getNowPlayingMessage(guildId);
  return msg?.channel as TextChannel | NewsChannel | ThreadChannel ?? null;
}

export async function handleSuggest(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const queue = getQueue(guildId);
  const track = queue.tracks[queue.currentIndex];
  if (!track) {
    await interaction.reply({ content: 'Nothing is playing to base suggestions on.', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply();

  const extractor = getExtractorForSource(Source.YouTube);
  const results = await extractor.search(track.title);
  if (!results.length) {
    await interaction.editReply({ content: 'No suggestions found.' }).catch(() => {});
    return;
  }

  const tracks: Track[] = results.map((r) => ({
    ...r,
    stream: () => extractor.stream(r.url),
    requestedBy: '✨ Suggestion',
  }));
  suggestions.set(guildId, tracks);

  const buttons = tracks.map((_, i) =>
    new ButtonBuilder().setCustomId(`suggest_${i}`).setLabel(`${i + 1}`).setStyle(ButtonStyle.Secondary),
  );

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('suggest_all').setLabel('➕ Add All').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('suggest_dismiss').setLabel('❌ Dismiss').setStyle(ButtonStyle.Danger),
    ),
  );

  const list = tracks.map((t, i) => `${i + 1}. [${t.title}](${t.url}) — ${formatDuration(t.duration)}`).join('\n');
  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(`✨ Suggestions based on *${track.title}*`)
    .setDescription(list);

  await interaction.editReply({ embeds: [embed], components: rows }).catch(() => {});
}

async function setUpNextTrack(guildId: Snowflake) {
  const queue = getQueue(guildId);
  const next = skipTrackAndSave(queue);
  if (next) {
    clearIdleTimer(guildId);
    await playTrackInternal(guildId, next);
  } else {
    startIdleTimer(guildId);
  }
}

async function playTrackInternal(guildId: Snowflake, track: Track): Promise<void> {
  const queue = getQueue(guildId);
  const player = getPlayer(guildId);
  const connection = getConnection(guildId);
  if (!connection) return;

  trackPlayed(track.duration, track.requestedBy);
  trackPlayedByUser(track.requestedBy, track.title, track.url, track.duration);

  const onTrackEnd = () => setUpNextTrack(guildId);
  player.setOnFinish(onTrackEnd);
  player.setOnError(onTrackEnd);

  try {
    const stream = await track.stream();
    player.subscribe(connection);
    player.play(stream, queue.volume);

    const { nowPlayingEmbed } = await import('../utils/embed.js');
    const embed = nowPlayingEmbed(track);
    const buttons = nowPlayingButtons(false, queue.loopMode);
    const channel = await getSendChannel(null, guildId);
    if (channel) {
      const msg = await channel.send({ embeds: [embed], components: buttons });
      setNowPlayingMessage(guildId, msg);
    }
  } catch (err) {
    logger.error('Playback error:', err);
    await setUpNextTrack(guildId);
  }
}

async function playCurrent(interaction: ChatInputCommandInteraction, guildId: Snowflake): Promise<void> {
  const queue = getQueue(guildId);
  if (queue.currentIndex < 0 || queue.currentIndex >= queue.tracks.length) return;

  const track = queue.tracks[queue.currentIndex];
  const player = getPlayer(guildId);
  const connection = getConnection(guildId);
  if (!connection) return;

  trackPlayed(track.duration, track.requestedBy);
  trackPlayedByUser(track.requestedBy, track.title, track.url, track.duration);

  const onTrackEnd = () => setUpNextTrack(guildId);
  player.setOnFinish(onTrackEnd);
  player.setOnError(onTrackEnd);

  try {
    const stream = await track.stream();
    player.subscribe(connection);
    player.play(stream, queue.volume);

    const { nowPlayingEmbed } = await import('../utils/embed.js');
    const embed = nowPlayingEmbed(track);
    const buttons = nowPlayingButtons(false, queue.loopMode);
    const channel = interaction.channel as TextChannel | NewsChannel | ThreadChannel;
    if (channel?.send) {
      const msg = await channel.send({ embeds: [embed], components: buttons });
      setNowPlayingMessage(guildId, msg);
    }
  } catch (err) {
    logger.error('Playback error:', err);
    await setUpNextTrack(guildId);
  }
}

// --- Slash command handlers ---

export async function handlePlay(interaction: ChatInputCommandInteraction): Promise<void> {
  ensureInit();

  try {
    const query = interaction.options.getString('query', true);
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      await interaction.reply({ content: 'Join a voice channel first.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }

    const guildId = interaction.guildId!;
    clearIdleTimer(guildId);
    const queue = getQueue(guildId);

    await interaction.deferReply().catch(() => {});

    connectToVoice(interaction.guild!, voiceChannel.id);

    const extractor = getExtractor(query);
    const isPlaylist = isValidUrl(query) && /[?&]list=/.test(query);

    if (isPlaylist && extractor.getPlaylist) {
      const results = await extractor.getPlaylist(query);
      if (!results.length) {
        await interaction.editReply({ content: 'No videos found in playlist.' }).catch(() => {});
        return;
      }

      const wasEmpty = queue.tracks.length === 0;
      for (const r of results) {
        addTrackAndSave(queue, {
          ...r,
          stream: () => extractor.stream(r.url),
          requestedBy: interaction.user.tag,
        });
      }
      await interaction.editReply({ content: `Added **${results.length}** tracks from playlist.` }).catch(() => {});

      if (wasEmpty) {
        queue.currentIndex = 0;
        await playCurrent(interaction, guildId);
      }
      return;
    }

    const result = isValidUrl(query)
      ? await extractor.getInfo(query)
      : (await extractor.search(query))[0];

    if (!result) {
      await interaction.editReply({ content: 'No results found.' }).catch(() => {});
      return;
    }

    const track: Track = {
      ...result,
      stream: () => extractor.stream(result.url),
      requestedBy: interaction.user.tag,
    };

    const pos = addTrackAndSave(queue, track);
    await interaction.editReply({ content: `Added **${track.title}** — position #${pos}` }).catch(() => {});

    if (queue.tracks.length === 1) {
      queue.currentIndex = 0;
      await playCurrent(interaction, guildId);
    }
  } catch (err) {
    logger.error('handlePlay error:', err);
  }
}

export async function handleSkip(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  clearIdleTimer(guildId);
  const player = getPlayer(guildId);
  player.setOnFinish(null);
  player.setOnError(null);
  player.stop();
  await setUpNextTrack(guildId);
  await interaction.reply({ content: 'Skipped.' });
}

export async function handleStop(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  clearIdleTimer(guildId);
  const p = getPlayer(guildId);
  p.setOnFinish(null);
  p.setOnError(null);
  p.stop();
  clearQueueAndSave(getQueue(guildId));
  disconnectFromVoice(guildId);
  deleteQueue(guildId);
  const msg = await import('./QueueManager.js').then(m => m.getNowPlayingMessage(guildId));
  if (msg) { try { await msg.delete(); } catch {} }
  deleteNowPlayingMessage(guildId);
  await interaction.reply({ content: 'Stopped and cleared queue.' });
}

export async function handlePause(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  getPlayer(guildId).pause();
  await interaction.reply({ content: 'Paused.' });
  await updateNowPlaying(guildId);
}

export async function handleResume(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  getPlayer(guildId).unpause();
  await interaction.reply({ content: 'Resumed.' });
  await updateNowPlaying(guildId);
}

export async function handleVolume(interaction: ChatInputCommandInteraction): Promise<void> {
  const volume = interaction.options.getInteger('level', true);
  if (volume < 0 || volume > 100) {
    await interaction.reply({ content: 'Volume must be 0–100.', flags: MessageFlags.Ephemeral });
    return;
  }
  const guildId = interaction.guildId!;
  const queue = getQueue(guildId);
  queue.volume = volume;
  getPlayer(guildId).setVolume(volume);
  await interaction.reply({ content: `Volume set to ${volume}.` });
}

export async function handleFavorite(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const sub = interaction.options.getSubcommand();

  if (sub === 'add') {
    const queue = getQueue(guildId);
    const track = queue.tracks[queue.currentIndex];
    if (!track) {
      await interaction.reply({ content: 'Nothing is playing.', flags: MessageFlags.Ephemeral });
      return;
    }
    const count = addFavorite(interaction.user.id, track);
    await interaction.reply({ content: `Added **${track.title}** to favorites (${count} total).` });
  } else if (sub === 'remove') {
    const index = interaction.options.getInteger('index', true) - 1;
    const removed = removeFavorite(interaction.user.id, index);
    if (!removed) {
      await interaction.reply({ content: 'Invalid index.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ content: `Removed **${removed.title}** from favorites.` });
  } else if (sub === 'list') {
    const favs = getUserFavorites(interaction.user.id);
    if (!favs.length) {
      await interaction.reply({ content: 'You have no favorites yet.', flags: MessageFlags.Ephemeral });
      return;
    }
    const list = favs.map((t, i) => `${i + 1}. [${t.title}](${t.url}) — ${formatDuration(t.duration)}`).join('\n');
    const { EmbedBuilder } = await import('discord.js');
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(`🎵 ${interaction.user.username}'s Favorites (${favs.length})`)
      .setDescription(list);
    await interaction.reply({ embeds: [embed] });
  }
}

export async function handleStats(interaction: ChatInputCommandInteraction): Promise<void> {
  const s = getStats();
  const hours = Math.floor(s.totalDuration / 3600);
  const mins = Math.floor((s.totalDuration % 3600) / 60);
  const topUser = Object.entries(s.userRequests).sort((a, b) => b[1] - a[1])[0];
  const { EmbedBuilder } = await import('discord.js');
  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('📊 Bot Stats')
    .addFields(
      { name: 'Tracks Played', value: String(s.totalTracks), inline: true },
      { name: 'Total Listening Time', value: `${hours}h ${mins}m`, inline: true },
      { name: 'Top Requester', value: topUser ? `<@${topUser[0]}> (${topUser[1]} tracks)` : 'N/A', inline: false },
    );
  await interaction.reply({ embeds: [embed] });
}

export async function handleQueue(interaction: ChatInputCommandInteraction): Promise<void> {
  const queue = getQueue(interaction.guildId!);
  const page = interaction.options.getInteger('page') ?? 1;
  const { queueEmbed } = await import('../utils/embed.js');
  await interaction.reply({ embeds: [queueEmbed(queue.tracks, queue.currentIndex, queue.loopMode, page)] });
}

export async function handleNowPlaying(interaction: ChatInputCommandInteraction): Promise<void> {
  const queue = getQueue(interaction.guildId!);
  const track = queue.tracks[queue.currentIndex];
  if (!track) {
    await interaction.reply({ content: 'Nothing is playing.', flags: MessageFlags.Ephemeral });
    return;
  }
  const { nowPlayingEmbed } = await import('../utils/embed.js');
  await interaction.reply({ embeds: [nowPlayingEmbed(track)] });
}

export async function handleLoop(interaction: ChatInputCommandInteraction): Promise<void> {
  const mode = interaction.options.getString('mode', true) as 'none' | 'track' | 'queue';
  const queue = getQueue(interaction.guildId!);
  queue.loopMode = mode;
  await interaction.reply({ content: `Loop set to **${mode}**.` });
  await updateNowPlaying(interaction.guildId!);
}

export async function handleShuffle(interaction: ChatInputCommandInteraction): Promise<void> {
  const queue = getQueue(interaction.guildId!);
  shuffleQueue(queue);
  await interaction.reply({ content: 'Queue shuffled.' });
}

export async function handleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  const position = interaction.options.getInteger('position', true);
  const queue = getQueue(interaction.guildId!);
  const removed = removeTrackAndSave(queue, position - 1);
  if (!removed) {
    await interaction.reply({ content: 'Invalid position.', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({ content: `Removed **${removed.title}**.` });
}

export async function handleJump(interaction: ChatInputCommandInteraction): Promise<void> {
  const position = interaction.options.getInteger('position', true);
  const queue = getQueue(interaction.guildId!);
  const track = jumpTo(queue, position - 1);
  if (!track) {
    await interaction.reply({ content: 'Invalid position.', flags: MessageFlags.Ephemeral });
    return;
  }
  const p2 = getPlayer(interaction.guildId!);
  p2.setOnFinish(null);
  p2.setOnError(null);
  p2.stop();
  await playCurrent(interaction, interaction.guildId!);
  await interaction.reply({ content: `Jumped to **${track.title}**.` });
}

// --- Button Handler ---

export async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guildId) { try { await interaction.deferUpdate(); } catch {} return; }
  try { await interaction.deferUpdate(); } catch { return; }
  const guildId = interaction.guildId;
  const queue = getQueue(guildId);
  const player = getPlayer(guildId);
  const conn = getConnection(guildId);

  switch (interaction.customId) {
    case 'music_playpause': {
      if (player.state === 'paused') {
        player.unpause();
      } else {
        player.pause();
      }
      await updateNowPlaying(guildId);
      break;
    }
    case 'music_skip': {
      player.setOnFinish(null);
      player.setOnError(null);
      player.stop();
      const next = skipTrackAndSave(queue);
      if (next) {
        clearIdleTimer(guildId);
        const stream = await next.stream();
        player.subscribe(conn!);
        player.play(stream, queue.volume);
        player.setOnFinish(() => setUpNextTrack(guildId));
        const { nowPlayingEmbed } = await import('../utils/embed.js');
        const msg = await import('./QueueManager.js').then(m => m.getNowPlayingMessage(guildId));
        if (msg) {
          try { await msg.edit({ embeds: [nowPlayingEmbed(next)], components: nowPlayingButtons(false, queue.loopMode) }); } catch {}
        }
      } else {
        startIdleTimer(guildId);
      }
      break;
    }
    case 'music_stop': {
      clearIdleTimer(guildId);
      player.setOnFinish(null);
      player.setOnError(null);
      player.stop();
      clearQueueAndSave(queue);
      disconnectFromVoice(guildId);
      deleteQueue(guildId);
      const msg = await import('./QueueManager.js').then(m => m.getNowPlayingMessage(guildId));
      if (msg) { try { await msg.delete(); } catch {} }
      deleteNowPlayingMessage(guildId);
      break;
    }
    case 'music_loop': {
      const modes: Array<'none' | 'track' | 'queue'> = ['none', 'track', 'queue'];
      const idx = modes.indexOf(queue.loopMode);
      queue.loopMode = modes[(idx + 1) % modes.length];
      await updateNowPlaying(guildId);
      break;
    }
    case 'music_shuffle': {
      shuffleQueue(queue);
      break;
    }
    case 'music_favorite': {
      const curTrack = queue.tracks[queue.currentIndex];
      if (curTrack) {
        addFavorite(interaction.user.id, curTrack);
        try { await interaction.editReply({ content: `❤️ Added **${curTrack.title}** to your favorites.` }); } catch {}
      }
      break;
    }
    case 'music_suggest': {
      const cur = queue.tracks[queue.currentIndex];
      if (!cur) break;
      const ext = getExtractorForSource(Source.YouTube);
      const res = await ext.search(cur.title);
      if (!res.length) break;
      const sugTracks: Track[] = res.map((r) => ({ ...r, stream: () => ext.stream(r.url), requestedBy: '💡 Suggested' }));
      suggestions.set(guildId, sugTracks);
      const btns = sugTracks.map((_, i) =>
        new ButtonBuilder().setCustomId(`suggest_${i}`).setLabel(`${i + 1}`).setStyle(ButtonStyle.Secondary),
      );
      const rows: ActionRowBuilder<ButtonBuilder>[] = [];
      for (let i = 0; i < btns.length; i += 5) rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(btns.slice(i, i + 5)));
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('suggest_all').setLabel('➕ Add All').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('suggest_dismiss').setLabel('❌ Dismiss').setStyle(ButtonStyle.Danger),
      ));
      const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle(`💡 Suggested based on *${cur.title}*`)
        .setDescription(sugTracks.map((t, i) => `${i + 1}. [${t.title}](${t.url})`).join('\n'));
      const ch = interaction.channel as TextChannel | NewsChannel | ThreadChannel;
      if (ch?.send) ch.send({ embeds: [embed], components: rows }).catch(() => {});
      break;
    }
    case 'suggest_all': {
      const all = suggestions.get(guildId);
      if (!all) break;
      suggestions.delete(guildId);
      const wasEmpty = queue.tracks.length === 0;
      for (const t of all) addTrackAndSave(queue, t);
      clearIdleTimer(guildId);
      if (wasEmpty && queue.tracks.length > 0) {
        queue.currentIndex = 0;
        await playTrackInternal(guildId, queue.tracks[0]);
      }
      try { await interaction.editReply({ content: `Added all ${all.length} suggestions.` }); } catch {}
      break;
    }
    case 'suggest_dismiss': {
      suggestions.delete(guildId);
      try { await interaction.editReply({ content: 'Suggestions dismissed.' }); } catch {}
      break;
    }
    default: {
      const match = interaction.customId.match(/^suggest_(\d+)$/);
      if (match) {
        const idx = parseInt(match[1]);
        const list = suggestions.get(guildId);
        if (!list || !list[idx]) break;
        suggestions.delete(guildId);
        const track = list[idx];
        const wasEmpty = queue.tracks.length === 0;
        addTrackAndSave(queue, track);
        clearIdleTimer(guildId);
        if (wasEmpty) {
          queue.currentIndex = 0;
          await playTrackInternal(guildId, track);
        }
        try { await interaction.editReply({ content: `Added **${track.title}**.` }); } catch {}
      }
      break;
    }
  }
}

export async function handleHelp(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle('🎵 Music Bot Commands')
    .setColor(0x5865F2)
    .addFields(
      { name: '▶️ Playback', value: [
        '`/play <query>` - Play a song, playlist, or search',
        '`/skip` - Skip the current track',
        '`/stop` - Stop playback and clear queue',
        '`/pause` - Pause playback',
        '`/resume` - Resume playback',
        '`/volume <0-100>` - Set volume',
        '`/loop <none|track|queue>` - Set loop mode',
        '`/shuffle` - Shuffle the queue',
        '`/nowplaying` - Show current track',
      ].join('\n') },
      { name: '📋 Queue', value: [
        '`/queue` - Show the queue',
        '`/remove <position>` - Remove a track',
        '`/jump <position>` - Jump to a track',
        '`/suggest` - Get suggestions for current track',
      ].join('\n') },
      { name: '❤️ Favorites', value: [
        '`/favorite add` - Add current track to favorites',
        '`/favorite list` - Show your favorites',
        '`/favorite remove <index>` - Remove a favorite',
      ].join('\n') },
      { name: '📊 Other', value: [
        '`/stats` - Show bot statistics',
        '`/mystats` - Show your personal statistics',
        '`/help` - Show this message',
      ].join('\n') },
    )
    .setFooter({ text: 'Buttons in the player also control playback' });

  await interaction.reply({ embeds: [embed] });
}

export async function handleMyStats(interaction: ChatInputCommandInteraction): Promise<void> {
  const stats = getUserStats(interaction.user.id);
  if (!stats || stats.totalTracks === 0) {
    await interaction.reply({ content: 'You haven\'t listened to any tracks yet!', flags: MessageFlags.Ephemeral });
    return;
  }

  const topTracks = Object.entries(stats.trackCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const recent = stats.lastPlayed.slice(0, 5);

  const embed = new EmbedBuilder()
    .setTitle('Your Music Stats')
    .setColor(0x5865F2)
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      { name: '📊 Overview', value: [
        `**Tracks played:** ${stats.totalTracks}`,
        `**Total time:** ${formatDuration(stats.totalDuration)}`,
      ].join('\n') },
      { name: '🔥 Most Played', value: topTracks.length
        ? topTracks.map(([url, count], i) => `**${i + 1}.** [${stats.lastPlayed.find(t => t.url === url)?.title ?? url}](${url}) — ${count} play${count > 1 ? 's' : ''}`).join('\n')
        : 'No data yet',
      },
      { name: '⏪ Recent Tracks', value: recent.length
        ? recent.map((t, i) => `**${i + 1}.** [${t.title}](${t.url})`).join('\n')
        : 'No data yet',
      },
    );

  await interaction.reply({ embeds: [embed] });
}
