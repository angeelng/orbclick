import { getSound, type SoundId, type SoundTone } from '../data/sounds';
import type { Game } from './game';

/**
 * Sonido del juego. Sintetiza los efectos de `data/sounds.ts` con la Web
 * Audio API: ni un archivo que descargar, y el volumen vive en un solo nodo.
 *
 * El contexto se crea perezosamente, en el primer efecto que se pide, porque
 * los navegadores no dejan sonar nada antes de que el jugador toque la
 * página. Si el audio no está disponible (contexto bloqueado, pestaña sin
 * permiso), `play` no hace nada: el juego nunca depende del sonido.
 */

export interface AudioSettings {
  readonly muted: boolean;
  /** Volumen general, de 0 a 1. */
  readonly volume: number;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { muted: false, volume: 0.6 };

const STORAGE_KEY = 'orbclick:audio';

/** Deja el volumen dentro de [0, 1]; un valor roto cae al de fábrica. */
export function clampVolume(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_AUDIO_SETTINGS.volume;
  return Math.min(1, Math.max(0, value));
}

/** Lee unos ajustes de origen desconocido (localStorage, otra versión). */
export function parseAudioSettings(raw: unknown): AudioSettings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_AUDIO_SETTINGS;
  const record = raw as Record<string, unknown>;
  return {
    muted: record['muted'] === true,
    volume: clampVolume(record['volume']),
  };
}

export interface AudioSystem {
  play(id: SoundId): void;
  getSettings(): AudioSettings;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  /** Avisa cuando cambian volumen o silencio, los toque quien los toque. */
  onChange(listener: () => void): void;
  /** Suelta el contexto; solo lo usan los tests y el cierre de la página. */
  dispose(): void;
}

function readStoredSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? DEFAULT_AUDIO_SETTINGS : parseAudioSettings(JSON.parse(raw));
  } catch {
    // Sin almacenamiento o con un JSON roto: valores de fábrica.
    return DEFAULT_AUDIO_SETTINGS;
  }
}

function writeStoredSettings(settings: AudioSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Que no se pueda guardar el volumen no es motivo para romper nada.
  }
}

type ContextConstructor = new () => AudioContext;

function audioContextConstructor(): ContextConstructor | null {
  const candidate =
    typeof AudioContext !== 'undefined'
      ? AudioContext
      : ((globalThis as { webkitAudioContext?: ContextConstructor }).webkitAudioContext ?? null);
  return candidate ?? null;
}

export function createAudio(): AudioSystem {
  let settings = readStoredSettings();
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  const lastPlayedAt = new Map<SoundId, number>();
  const listeners: (() => void)[] = [];

  const announce = (): void => {
    for (const listener of listeners) listener();
  };

  /** Crea el contexto a la primera, y lo despierta si el navegador lo durmió. */
  const ensureContext = (): AudioContext | null => {
    if (context === null) {
      const Constructor = audioContextConstructor();
      if (Constructor === null) return null;
      try {
        context = new Constructor();
        master = context.createGain();
        master.gain.value = settings.muted ? 0 : settings.volume;
        master.connect(context.destination);
      } catch {
        return null;
      }
    }
    if (context.state === 'suspended') void context.resume();
    return context;
  };

  const applyVolume = (): void => {
    if (master === null) return;
    master.gain.value = settings.muted ? 0 : settings.volume;
  };

  const playTone = (ctx: AudioContext, destination: GainNode, tone: SoundTone): void => {
    const startAt = ctx.currentTime + tone.startMs / 1000;
    const endAt = startAt + tone.durationMs / 1000;

    const oscillator = ctx.createOscillator();
    oscillator.type = tone.wave;
    oscillator.frequency.setValueAtTime(tone.from, startAt);
    if (tone.to !== tone.from) oscillator.frequency.exponentialRampToValueAtTime(tone.to, endAt);

    /*
     * Sobre corto de ataque y caída: sin él, arrancar y parar el oscilador
     * suena a chasquido, que es justo lo contrario de «se siente bien».
     */
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, startAt);
    envelope.gain.linearRampToValueAtTime(tone.gain, startAt + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, endAt);

    oscillator.connect(envelope);
    envelope.connect(destination);
    oscillator.start(startAt);
    oscillator.stop(endAt + 0.02);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
  };

  return {
    play(id) {
      if (settings.muted || settings.volume <= 0) return;
      const sound = getSound(id);
      const ctx = ensureContext();
      if (ctx === null || master === null) return;

      // Puerta por efecto: el clic se pide decenas de veces por segundo.
      const now = ctx.currentTime * 1000;
      const last = lastPlayedAt.get(id);
      if (last !== undefined && now - last < sound.minIntervalMs) return;
      lastPlayedAt.set(id, now);

      for (const tone of sound.tones) playTone(ctx, master, tone);
    },

    getSettings: () => settings,

    setVolume(volume) {
      settings = { ...settings, volume: clampVolume(volume) };
      applyVolume();
      writeStoredSettings(settings);
      announce();
    },

    setMuted(muted) {
      settings = { ...settings, muted };
      applyVolume();
      writeStoredSettings(settings);
      announce();
    },

    onChange(listener) {
      listeners.push(listener);
    },

    dispose() {
      void context?.close();
      context = null;
      master = null;
    },
  };
}

/**
 * Ata los eventos del juego a sus efectos. Vive aquí y no en la interfaz
 * porque el sonido es una reacción al estado, no a un botón concreto.
 */
export function connectAudio(game: Game, audio: AudioSystem): void {
  game.events.on('click:resolved', () => {
    audio.play('click');
  });
  game.events.on('wild:damaged', () => {
    audio.play('hit');
  });
  game.events.on('wild:defeated', () => {
    audio.play('hit');
  });
  game.events.on('wild:appeared', () => {
    audio.play('appear');
  });
  game.events.on('shop:purchased', () => {
    audio.play('buy');
  });
  game.events.on('shop:bought', () => {
    audio.play('buy');
  });
  game.events.on('orb:thrown', ({ captured }) => {
    audio.play(captured ? 'capture' : 'escape');
  });
  game.events.on('trainer:levelup', () => {
    audio.play('levelUp');
  });
  game.events.on('achievement:unlocked', () => {
    audio.play('achievement');
  });
  game.events.on('boss:mechanic', () => {
    audio.play('boss');
  });
  game.events.on('battle:ended', ({ outcome }) => {
    audio.play(outcome === 'won' ? 'victory' : 'defeat');
  });
}
