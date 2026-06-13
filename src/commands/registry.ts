import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config } from '../config.js';

const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song, playlist, or search query')
    .addStringOption((o) => o.setName('query').setDescription('URL or search query').setRequired(true)),
  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current track'),
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playback and clear the queue'),
  new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause playback'),
  new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume playback'),
  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set volume (0–100)')
    .addIntegerOption((o) => o.setName('level').setDescription('Volume level').setRequired(true).setMinValue(0).setMaxValue(100)),
  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the music queue')
    .addIntegerOption((o) => o.setName('page').setDescription('Page number').setMinValue(1)),
  new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the currently playing track'),
  new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Set loop mode')
    .addStringOption((o) => o.setName('mode').setDescription('Loop mode').setRequired(true).addChoices(
      { name: 'None', value: 'none' },
      { name: 'Track', value: 'track' },
      { name: 'Queue', value: 'queue' },
    )),
  new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Shuffle the queue'),
  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a track from the queue')
    .addIntegerOption((o) => o.setName('position').setDescription('Track position').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder()
    .setName('jump')
    .setDescription('Jump to a track in the queue')
    .addIntegerOption((o) => o.setName('position').setDescription('Track position').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Show suggested tracks based on the current song'),
  new SlashCommandBuilder()
    .setName('favorite')
    .setDescription('Manage your favorite tracks')
    .addSubcommand((s) => s.setName('add').setDescription('Add the current track to favorites'))
    .addSubcommand((s) => s.setName('list').setDescription('Show your favorite tracks'))
    .addSubcommand((s) =>
      s.setName('remove').setDescription('Remove a track from favorites')
        .addIntegerOption((o) => o.setName('index').setDescription('Track number').setRequired(true).setMinValue(1)),
    ),
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show bot usage statistics'),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show a list of available commands'),
  new SlashCommandBuilder()
    .setName('mystats')
    .setDescription('Show your personal listening statistics'),
];

const rest = new REST({ version: '10' }).setToken(config.token);

async function register() {
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationCommands(config.clientId), { body: commands.map((c) => c.toJSON()) });
    console.log('Slash commands registered.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to register commands:', err);
    process.exit(1);
  }
}

register();
