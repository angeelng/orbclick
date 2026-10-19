import type { GameState } from '../core/state';

/** Sube con cada cambio de `GameState` que rompa partidas guardadas. */
export const SAVE_VERSION = 8;

export interface SaveFile {
  readonly version: number;
  readonly savedAt: number;
  readonly state: GameState;
}

export interface SaveRepository {
  load(): Promise<SaveFile | null>;
  save(data: SaveFile): Promise<void>;
  clear(): Promise<void>;
}

export function toSaveFile(state: GameState, savedAt: number): SaveFile {
  return { version: SAVE_VERSION, savedAt, state };
}
