import { Guild, ChannelType } from 'discord.js';
import { logger } from '../core/Logger.js';
import { getShoukaku } from '../lavalink/Manager.js';
import { Player } from './Player.js';

const players = new Map<string, Player>();

export async function connectToVoice(guild: Guild, voiceChannelId: string): Promise<Player | null> {
  const channel = guild.channels.cache.get(voiceChannelId);
  if (!channel || (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)) {
    return null;
  }

  try {
    const shoukaku = getShoukaku();
    const sPlayer = await shoukaku.joinVoiceChannel({
      guildId: guild.id,
      channelId: voiceChannelId,
      shardId: 0,
    });

    const botPlayer = new Player();
    botPlayer.bindPlayer(sPlayer);
    players.set(guild.id, botPlayer);
    logger.info(`Connected Lavalink for guild ${guild.id}`);
    return botPlayer;
  } catch (err: any) {
    logger.error(`Failed to connect Lavalink: ${err.message}`);
    return null;
  }
}

export function disconnectFromVoice(guildId: string): void {
  const shoukaku = getShoukaku();
  shoukaku.leaveVoiceChannel(guildId);
  players.delete(guildId);
}

export function getPlayer(guildId: string): Player | undefined {
  return players.get(guildId);
}
