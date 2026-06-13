import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Track, LoopMode } from '../types.js';
import { EMBED_COLORS, QUEUE_PAGE_SIZE } from '../core/constants.js';

export function nowPlayingEmbed(track: Track): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.primary)
    .setTitle('Now Playing')
    .setDescription(`[${track.title}](${track.url})`)
    .setThumbnail(track.thumbnail || null)
    .addFields(
      { name: 'Duration', value: formatDuration(track.duration), inline: true },
      { name: 'Source', value: track.source.toUpperCase(), inline: true },
      { name: 'Requested by', value: track.requestedBy, inline: true },
    );
}

export function queueEmbed(tracks: Track[], currentIndex: number, loopMode: LoopMode, page: number = 1): EmbedBuilder {
  const totalPages = Math.max(1, Math.ceil(tracks.length / QUEUE_PAGE_SIZE));
  const start = (page - 1) * QUEUE_PAGE_SIZE;
  const end = start + QUEUE_PAGE_SIZE;
  const pageTracks = tracks.slice(start, end);

  const description = pageTracks
    .map((t, i) => {
      const idx = start + i;
      if (idx < currentIndex) return `~~${idx + 1}. [${t.title}](${t.url}) — ${formatDuration(t.duration)}~~ ✅`;
      if (idx === currentIndex) return `**▶ ${idx + 1}. [${t.title}](${t.url}) — ${formatDuration(t.duration)}**`;
      return `${idx + 1}. [${t.title}](${t.url}) — ${formatDuration(t.duration)} [${t.requestedBy}]`;
    })
    .join('\n');

  const played = currentIndex > 0 ? `\n✅ Played: ${currentIndex} track${currentIndex > 1 ? 's' : ''}` : '';
  const upcoming = currentIndex >= 0 && currentIndex < tracks.length - 1 ? ` Upcoming: ${tracks.length - 1 - currentIndex}` : '';

  return new EmbedBuilder()
    .setColor(EMBED_COLORS.primary)
    .setTitle(`Queue (${tracks.length} tracks)`)
    .setDescription(description || 'Empty queue')
    .setFooter({ text: `Page ${page}/${totalPages} • Loop: ${loopMode.toUpperCase()} •` + played + upcoming });
}

export function addedToQueueEmbed(track: Track, position: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.success)
    .setDescription(`Added [${track.title}](${track.url}) — position #${position}`);
}

export function errorEmbed(msg: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.error)
    .setDescription(`Error: ${msg}`);
}

export function aboutEmbed() {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎵　SHO3LA MUSIC')
    .setDescription([
      '> *Your premier Discord music experience — crystal-clear audio, zero latency.*',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '**✨ Premium Features**',
      '',
      '　`/play`　　Unlimited songs, playlists & search',
      '　`/queue`　　Full queue control with jump & remove',
      '　`/favorite`　　Save & load your personal library',
      '　`/loop`　　Track, Queue, or Off — your call',
      '　`/shuffle`　　Mix it up instantly',
      '　`/mystats`　　Track your listening habits',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '🆘　**Need help?** — [Support Server](https://discord.gg/your)',
      '⭐　**Premium** — [Unlock exclusive features](https://your-premium-link.com)',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ].join('\n'))
    .setFooter({ text: 'SHO3LA MUSIC • Pure Audio • Made with ❤️' })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('Invite').setStyle(ButtonStyle.Link).setURL('https://discord.com/oauth2/authorize?client_id=1347225605372715049'),
        new ButtonBuilder().setLabel('Support').setStyle(ButtonStyle.Link).setURL('https://discord.gg/your'),
        new ButtonBuilder().setLabel('Premium').setStyle(ButtonStyle.Link).setURL('https://your-premium-link.com').setEmoji('⭐'),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('music_playpause').setEmoji('▶️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('music_favorite').setLabel('Favorites').setEmoji('❤️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('music_stats').setLabel('Stats').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
