/**
 * Recetas de sonido del MVP (GDD · «cada clic se siente bien»): nada de
 * archivos de audio, solo osciladores descritos como datos. Cada efecto es
 * una lista de tonos con su onda, su barrido de frecuencia y su sobre de
 * volumen; quien los toca es `systems/audio.ts`.
 *
 * Los efectos son cortos a propósito: el juego es de clicar, y un sonido
 * largo se pisaría consigo mismo a los dos clics.
 */

export type SoundWave = 'sine' | 'square' | 'triangle' | 'sawtooth';

export interface SoundTone {
  readonly wave: SoundWave;
  /** Frecuencia inicial en Hz. */
  readonly from: number;
  /** Frecuencia final; igual que `from` si no hay barrido. */
  readonly to: number;
  /** Retardo respecto al inicio del efecto. */
  readonly startMs: number;
  readonly durationMs: number;
  /** Volumen del tono, de 0 a 1, antes del volumen general. */
  readonly gain: number;
}

export interface SoundDefinition {
  readonly id: SoundId;
  readonly tones: readonly SoundTone[];
  /**
   * Mínimo entre dos repeticiones del mismo efecto. El clic se dispara
   * muchísimas veces por segundo (a mano y desde el Rancho) y sin esta puerta
   * el audio se convierte en ruido.
   */
  readonly minIntervalMs: number;
}

export const SOUND_IDS = [
  'click',
  'buy',
  'capture',
  'escape',
  'appear',
  'hit',
  'levelUp',
  'achievement',
  'victory',
  'defeat',
  'boss',
] as const;

export type SoundId = (typeof SOUND_IDS)[number];

export const SOUNDS: Readonly<Record<SoundId, SoundDefinition>> = {
  /** El clic del objeto de la zona: un «tic» de madera, muy corto. */
  click: {
    id: 'click',
    minIntervalMs: 40,
    tones: [{ wave: 'triangle', from: 620, to: 880, startMs: 0, durationMs: 55, gain: 0.22 }],
  },
  /** Compra en la tienda: dos notas que suben, como una caja registradora. */
  buy: {
    id: 'buy',
    minIntervalMs: 60,
    tones: [
      { wave: 'square', from: 520, to: 520, startMs: 0, durationMs: 60, gain: 0.14 },
      { wave: 'square', from: 780, to: 780, startMs: 60, durationMs: 90, gain: 0.14 },
    ],
  },
  /** Captura conseguida: arpegio de tres notas hacia arriba. */
  capture: {
    id: 'capture',
    minIntervalMs: 120,
    tones: [
      { wave: 'sine', from: 660, to: 660, startMs: 0, durationMs: 110, gain: 0.26 },
      { wave: 'sine', from: 880, to: 880, startMs: 100, durationMs: 110, gain: 0.26 },
      { wave: 'sine', from: 1175, to: 1175, startMs: 200, durationMs: 180, gain: 0.26 },
    ],
  },
  /** Se escapa del orbe: la misma idea del revés. */
  escape: {
    id: 'escape',
    minIntervalMs: 120,
    tones: [{ wave: 'sawtooth', from: 440, to: 180, startMs: 0, durationMs: 260, gain: 0.16 }],
  },
  /** Aparece una salvaje: dos blips de aviso. */
  appear: {
    id: 'appear',
    minIntervalMs: 200,
    tones: [
      { wave: 'triangle', from: 740, to: 740, startMs: 0, durationMs: 70, gain: 0.18 },
      { wave: 'triangle', from: 990, to: 990, startMs: 90, durationMs: 90, gain: 0.18 },
    ],
  },
  /** Golpe a la salvaje o al enemigo del combate: seco y sordo. */
  hit: {
    id: 'hit',
    minIntervalMs: 50,
    tones: [{ wave: 'square', from: 240, to: 150, startMs: 0, durationMs: 70, gain: 0.16 }],
  },
  /** Sube el nivel de entrenador: tres notas con la última mantenida. */
  levelUp: {
    id: 'levelUp',
    minIntervalMs: 200,
    tones: [
      { wave: 'triangle', from: 523, to: 523, startMs: 0, durationMs: 110, gain: 0.24 },
      { wave: 'triangle', from: 659, to: 659, startMs: 110, durationMs: 110, gain: 0.24 },
      { wave: 'triangle', from: 784, to: 784, startMs: 220, durationMs: 260, gain: 0.26 },
    ],
  },
  /** Logro conseguido: cuatro notas brillantes. */
  achievement: {
    id: 'achievement',
    minIntervalMs: 200,
    tones: [
      { wave: 'sine', from: 784, to: 784, startMs: 0, durationMs: 90, gain: 0.22 },
      { wave: 'sine', from: 988, to: 988, startMs: 90, durationMs: 90, gain: 0.22 },
      { wave: 'sine', from: 1175, to: 1175, startMs: 180, durationMs: 90, gain: 0.22 },
      { wave: 'sine', from: 1568, to: 1568, startMs: 270, durationMs: 240, gain: 0.24 },
    ],
  },
  /** Victoria en combate: fanfarria corta. */
  victory: {
    id: 'victory',
    minIntervalMs: 300,
    tones: [
      { wave: 'square', from: 523, to: 523, startMs: 0, durationMs: 120, gain: 0.18 },
      { wave: 'square', from: 784, to: 784, startMs: 120, durationMs: 120, gain: 0.18 },
      { wave: 'square', from: 1046, to: 1046, startMs: 240, durationMs: 320, gain: 0.2 },
    ],
  },
  /** Derrota: dos notas que caen. */
  defeat: {
    id: 'defeat',
    minIntervalMs: 300,
    tones: [
      { wave: 'sawtooth', from: 392, to: 392, startMs: 0, durationMs: 160, gain: 0.16 },
      { wave: 'sawtooth', from: 262, to: 196, startMs: 160, durationMs: 420, gain: 0.16 },
    ],
  },
  /** Mecánica de jefe: un golpe grave que avisa de que viene algo. */
  boss: {
    id: 'boss',
    minIntervalMs: 250,
    tones: [
      { wave: 'square', from: 160, to: 110, startMs: 0, durationMs: 300, gain: 0.2 },
      { wave: 'triangle', from: 330, to: 220, startMs: 60, durationMs: 240, gain: 0.12 },
    ],
  },
};

export function getSound(id: SoundId): SoundDefinition {
  return SOUNDS[id];
}

/** Cuánto dura el efecto entero, para saber cuándo soltar los nodos. */
export function soundDurationMs(sound: SoundDefinition): number {
  return sound.tones.reduce((end, tone) => Math.max(end, tone.startMs + tone.durationMs), 0);
}
