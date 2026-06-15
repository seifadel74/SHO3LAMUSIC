import { Player as ShoukakuPlayer } from 'shoukaku';
import { logger } from '../core/Logger.js';

export class Player {
  private sPlayer: ShoukakuPlayer | null = null;
  private _paused = false;
  private onFinish: (() => void) | null = null;
  private onError: ((err: Error) => void) | null = null;
  private _volume = 50;
  private finishHandler: ((reason: any) => void) | null = null;
  private errorHandler: ((reason: any) => void) | null = null;

  bindPlayer(sPlayer: ShoukakuPlayer): void {
    this.sPlayer = sPlayer;
    this._paused = false;

    if (this.finishHandler) this.sPlayer.off('end', this.finishHandler);
    if (this.errorHandler) this.sPlayer.off('exception', this.errorHandler);

    this.finishHandler = (reason) => {
      logger.info(`Lavalink -> Ended (${reason.reason || reason})`);
      this.sPlayer = null;
      this._paused = false;
      this.onFinish?.();
    };
    this.errorHandler = (reason) => {
      logger.error(`Lavalink error: ${reason.exception?.message || reason}`);
      this.onError?.(new Error(reason.exception?.message || 'Unknown error'));
    };

    sPlayer.on('end', this.finishHandler);
    sPlayer.on('exception', this.errorHandler);
  }

  setOnFinish(cb: (() => void) | null): void {
    this.onFinish = cb;
  }

  setOnError(cb: ((err: Error) => void) | null): void {
    this.onError = cb;
  }

  get state(): string {
    if (!this.sPlayer) return 'idle';
    if (this._paused) return 'paused';
    if (this.sPlayer.paused) return 'paused';
    return 'playing';
  }

  get volume(): number {
    return this._volume;
  }

  async playTrack(encoded: string): Promise<void> {
    if (!this.sPlayer) {
      logger.error('No shoukaku player to play on');
      return;
    }
    await this.sPlayer.playTrack({ track: { encoded } });
  }

  stop(): void {
    if (this.sPlayer) {
      this.sPlayer.stopTrack();
    }
    this.sPlayer = null;
    this._paused = false;
  }

  pause(): boolean {
    if (!this.sPlayer) return false;
    this._paused = true;
    this.sPlayer.setPaused(true);
    return true;
  }

  resume(): boolean {
    if (!this.sPlayer) return false;
    this._paused = false;
    this.sPlayer.setPaused(false);
    return true;
  }

  setVolume(volume: number): void {
    this._volume = volume;
    if (this.sPlayer) {
      this.sPlayer.setGlobalVolume(volume);
    }
  }
}
