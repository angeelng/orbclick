import { describe, expect, it } from 'vitest';
import { DEFAULT_AUDIO_SETTINGS, clampVolume, parseAudioSettings } from '../src/systems/audio';
import { SOUNDS, SOUND_IDS, getSound, soundDurationMs } from '../src/data/sounds';

describe('recetas de sonido', () => {
  it('define un efecto por cada id, con su mismo id dentro', () => {
    for (const id of SOUND_IDS) {
      expect(getSound(id).id).toBe(id);
    }
    expect(Object.keys(SOUNDS)).toHaveLength(SOUND_IDS.length);
  });

  it('cubre lo que pide el GDD: clic, captura y victoria', () => {
    expect(SOUND_IDS).toContain('click');
    expect(SOUND_IDS).toContain('capture');
    expect(SOUND_IDS).toContain('victory');
  });

  it('usa tonos audibles, cortos y con volumen dentro de rango', () => {
    for (const id of SOUND_IDS) {
      const sound = getSound(id);
      expect(sound.tones.length).toBeGreaterThan(0);
      expect(sound.minIntervalMs).toBeGreaterThan(0);
      for (const tone of sound.tones) {
        expect(tone.from).toBeGreaterThan(20);
        expect(tone.to).toBeGreaterThan(20);
        expect(tone.gain).toBeGreaterThan(0);
        expect(tone.gain).toBeLessThanOrEqual(1);
        expect(tone.durationMs).toBeGreaterThan(0);
      }
      // Ningún efecto se alarga más de lo que tarda el jugador en volver a clicar.
      expect(soundDurationMs(sound)).toBeLessThanOrEqual(1000);
    }
  });

  it('mide la duración por el tono que acaba más tarde', () => {
    expect(
      soundDurationMs({
        id: 'click',
        minIntervalMs: 10,
        tones: [
          { wave: 'sine', from: 100, to: 100, startMs: 0, durationMs: 50, gain: 0.1 },
          { wave: 'sine', from: 100, to: 100, startMs: 200, durationMs: 90, gain: 0.1 },
        ],
      }),
    ).toBe(290);
  });

  it('el clic se puede repetir mucho más rápido que una fanfarria', () => {
    expect(getSound('click').minIntervalMs).toBeLessThan(getSound('victory').minIntervalMs);
  });
});

describe('ajustes de volumen', () => {
  it('recorta el volumen a [0, 1]', () => {
    expect(clampVolume(0.5)).toBe(0.5);
    expect(clampVolume(-2)).toBe(0);
    expect(clampVolume(7)).toBe(1);
  });

  it('un valor que no es un número cae al de fábrica', () => {
    expect(clampVolume('alto')).toBe(DEFAULT_AUDIO_SETTINGS.volume);
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_AUDIO_SETTINGS.volume);
    expect(clampVolume(undefined)).toBe(DEFAULT_AUDIO_SETTINGS.volume);
  });

  it('lee unos ajustes guardados y descarta la basura', () => {
    expect(parseAudioSettings({ muted: true, volume: 0.25 })).toEqual({
      muted: true,
      volume: 0.25,
    });
    expect(parseAudioSettings({ muted: 'sí', volume: null })).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(parseAudioSettings(null)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(parseAudioSettings('{}')).toEqual(DEFAULT_AUDIO_SETTINGS);
  });
});
