import {
  AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  VoiceConnection,
  NoSubscriberBehavior,
  AudioResource,
} from '@discordjs/voice';
import { logger } from '../core/Logger.js';

export class Player {
  private player: AudioPlayer;
  private currentResource: AudioResource | null = null;
  private onFinish: (() => void) | null = null;
  private onError: ((err: Error) => void) | null = null;

  constructor() {
    this.player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
      },
    });

    this.player.on(AudioPlayerStatus.Idle, () => {
      this.currentResource = null;
      this.onFinish?.();
    });

    this.player.on('error', (err) => {
      logger.error('AudioPlayer error:', err.message);
      this.onError?.(err);
    });
  }

  setOnFinish(cb: (() => void) | null): void {
    this.onFinish = cb;
  }

  setOnError(cb: (err: Error) => void): void {
    this.onError = cb;
  }

  play(stream: import('stream').Readable, volume: number = 50): void {
    if (this.currentResource) {
      this.currentResource.playStream?.destroy();
    }
    const resource = createAudioResource(stream, {
      inlineVolume: true,
    });
    resource.volume?.setVolume(volume / 100);
    this.currentResource = resource;
    this.player.play(resource);
  }

  pause(): boolean {
    return this.player.pause();
  }

  unpause(): boolean {
    return this.player.unpause();
  }

  stop(): void {
    this.player.stop(true);
    if (this.currentResource) {
      this.currentResource.playStream?.destroy();
    }
    this.currentResource = null;
  }

  setVolume(volume: number): void {
    if (this.currentResource?.volume) {
      this.currentResource.volume.setVolume(volume / 100);
    }
  }

  get state() {
    return this.player.state.status;
  }

  subscribe(connection: VoiceConnection): void {
    connection.subscribe(this.player);
  }
}
