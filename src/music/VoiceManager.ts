import {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';
import { Guild, ChannelType, VoiceChannel, StageChannel } from 'discord.js';
import { logger } from '../core/Logger.js';

export function connectToVoice(guild: Guild, voiceChannelId: string): VoiceConnection | null {
  const channel = guild.channels.cache.get(voiceChannelId);
  if (!channel || (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)) {
    return null;
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannelId,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      connection.destroy();
    }
  });

  return connection;
}

export function disconnectFromVoice(guildId: string): void {
  const connection = getVoiceConnection(guildId);
  if (connection) connection.destroy();
}

export function getConnection(guildId: string): VoiceConnection | null {
  return getVoiceConnection(guildId) ?? null;
}
