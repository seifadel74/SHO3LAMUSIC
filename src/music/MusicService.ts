import {
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  Snowflake,
  ButtonInteraction,
  TextChannel,
  NewsChannel,
  ThreadChannel,
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
import { getExtractor, initExtractors } from '../extractors/ExtractorRouter.js';
import { Track } from '../types.js';
import { isValidUrl } from '../utils/validation.js';
import { logger } from '../core/Logger.js';
import { nowPlayingButtons } from '../interactions/buttons.js';

const players = new Map<Snowflake, Player>();
const idleTimers = new Map<Snowflake, NodeJS.Timeout>();

let initialized = false;

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

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
  const query = interaction.options.getString('query', true);
  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;
  if (!voiceChannel) {
    await interaction.reply({ content: 'Join a voice channel first.', flags: MessageFlags.Ephemeral });
    return;
  }

  const guildId = interaction.guildId!;
  clearIdleTimer(guildId);
  const queue = getQueue(guildId);

  connectToVoice(interaction.guild!, voiceChannel.id);

  const extractor = getExtractor(query);
  const result = isValidUrl(query)
    ? await extractor.getInfo(query)
    : (await extractor.search(query))[0];

  if (!result) {
    await interaction.reply({ content: 'No results found.', flags: MessageFlags.Ephemeral });
    return;
  }

  const track: Track = {
    ...result,
    stream: async () => extractor.stream(result.url),
    requestedBy: interaction.user.tag,
  };

  const pos = addTrackAndSave(queue, track);
  await interaction.reply({ content: `Added **${track.title}** — position #${pos}` });

  if (queue.tracks.length === 1) {
    queue.currentIndex = 0;
    await playCurrent(interaction, guildId);
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
  if (!interaction.guildId) { await interaction.deferUpdate(); return; }
  await interaction.deferUpdate();
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
  }
}
