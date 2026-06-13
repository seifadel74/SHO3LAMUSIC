const { existsSync, chmodSync } = require('fs');
const { execSync } = require('child_process');

if (process.platform === 'win32') process.exit(0);
if (existsSync('yt-dlp')) process.exit(0);

console.log('Downloading yt-dlp...');
execSync('curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o yt-dlp', { stdio: 'inherit' });
chmodSync('yt-dlp', 0o755);
console.log('yt-dlp downloaded');
