import { ES } from '../i18n/es';
import type { AudioSystem } from '../systems/audio';
import { element, setText } from './dom';

/**
 * Silencio y volumen en la barra superior: un botón que alterna el sonido y
 * un deslizador. Los ajustes los guarda el propio sistema de audio, así que
 * aquí solo se pinta lo que diga.
 */
export function mountAudioControls(host: HTMLElement, audio: AudioSystem): void {
  const group = element('div', { className: 'audio-controls' });

  const toggle = element('button', {
    className: 'button button--small audio-toggle',
    attrs: { type: 'button' },
  });
  const icon = element('span', { className: 'audio-icon', attrs: { 'aria-hidden': 'true' } });
  const label = element('span', { className: 'visually-hidden' });
  toggle.append(icon, label);

  const slider = element('input', {
    className: 'audio-slider',
    attrs: {
      type: 'range',
      min: '0',
      max: '100',
      step: '5',
      'aria-label': ES.audio.volume,
    },
  });

  const paint = (): void => {
    const { muted, volume } = audio.getSettings();
    setText(icon, muted || volume <= 0 ? ES.audio.iconMuted : ES.audio.iconOn);
    const text = muted ? ES.audio.unmute : ES.audio.mute;
    setText(label, text);
    toggle.title = text;
    toggle.setAttribute('aria-pressed', String(muted));
    group.classList.toggle('audio-controls--muted', muted);

    const percent = String(Math.round(volume * 100));
    if (slider.value !== percent) slider.value = percent;
    slider.setAttribute('aria-valuetext', ES.audio.volumeValue(percent));
    slider.disabled = muted;
  };

  toggle.addEventListener('click', () => {
    const next = !audio.getSettings().muted;
    audio.setMuted(next);
    paint();
    // Un pitido corto al volver confirma que el sonido está otra vez.
    if (!next) audio.play('click');
  });

  slider.addEventListener('input', () => {
    audio.setVolume(Number(slider.value) / 100);
    paint();
  });
  slider.addEventListener('change', () => {
    audio.play('click');
  });

  // El atajo de teclado también cambia el silencio: hay que repintar.
  audio.onChange(paint);

  group.append(toggle, slider);
  host.append(group);
  paint();
}
