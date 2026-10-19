import { ZONE_LIST } from '../data/zones';
import { ES } from '../i18n/es';
import type { AudioSystem } from '../systems/audio';
import type { Game } from '../systems/game';
import { element } from './dom';

/**
 * Teclado del juego y su chuleta. El ratón no puede ser la única manera de
 * jugar: con el tabulador se llega a todo y con estas teclas se hace lo
 * corriente sin soltar las manos del teclado.
 *
 * Nada se dispara mientras se escribe en un campo (el código de la partida) ni
 * con un modificador pulsado, que ahí manda el navegador.
 */
export interface ShortcutTargets {
  readonly openAchievements: () => void;
  readonly toggleTheme: () => void;
  /** Lleva el foco al objeto clicable para poder darle con Espacio. */
  readonly focusZone: () => void;
}

interface ShortcutEntry {
  readonly keys: string;
  readonly description: string;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  );
}

/** Diálogo con la lista de teclas; se abre con «?» o desde el botón. */
function createHelpDialog(entries: readonly ShortcutEntry[]): HTMLDialogElement {
  const dialog = element('dialog', {
    className: 'dialog',
    attrs: { 'aria-label': ES.shortcuts.title },
  });
  const list = element('dl', { className: 'shortcut-list' });

  for (const entry of entries) {
    const row = element('div', { className: 'shortcut-row' });
    const keys = element('dt');
    keys.append(element('kbd', { text: entry.keys }));
    row.append(keys, element('dd', { text: entry.description }));
    list.append(row);
  }

  const actions = element('div', { className: 'dialog-actions' });
  const close = element('button', {
    className: 'button',
    text: ES.shortcuts.close,
    attrs: { type: 'button' },
  });
  close.addEventListener('click', () => {
    dialog.close();
  });
  actions.append(close);

  dialog.append(
    element('h2', { className: 'dialog-title', text: ES.shortcuts.title }),
    element('p', { className: 'dialog-hint', text: ES.shortcuts.hint }),
    list,
    actions,
  );
  return dialog;
}

export function mountShortcuts(
  host: HTMLElement,
  game: Game,
  audio: AudioSystem,
  targets: ShortcutTargets,
): void {
  const entries: readonly ShortcutEntry[] = [
    { keys: 'Espacio', description: ES.shortcuts.click },
    { keys: 'Z', description: ES.shortcuts.focusZone },
    { keys: '1 · 2 · 3', description: ES.shortcuts.zones },
    { keys: 'L', description: ES.shortcuts.achievements },
    { keys: 'M', description: ES.shortcuts.mute },
    { keys: 'T', description: ES.shortcuts.theme },
    { keys: '?', description: ES.shortcuts.help },
  ];

  const dialog = createHelpDialog(entries);
  const button = element('button', {
    className: 'button button--small',
    text: ES.shortcuts.open,
    attrs: { type: 'button', 'aria-label': ES.shortcuts.title },
  });
  button.addEventListener('click', () => {
    dialog.showModal();
  });
  host.append(button, dialog);

  const travelTo = (index: number): void => {
    const zone = ZONE_LIST[index];
    if (zone !== undefined) game.travelTo(zone.id);
  };

  window.addEventListener('keydown', (event) => {
    if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;

    switch (event.key) {
      case '1':
      case '2':
      case '3':
        travelTo(Number(event.key) - 1);
        break;
      case 'l':
      case 'L':
        targets.openAchievements();
        break;
      case 'm':
      case 'M':
        audio.setMuted(!audio.getSettings().muted);
        break;
      case 't':
      case 'T':
        targets.toggleTheme();
        break;
      case 'z':
      case 'Z':
        targets.focusZone();
        break;
      case '?':
        if (dialog.open) dialog.close();
        else dialog.showModal();
        break;
      default:
        return;
    }
    event.preventDefault();
  });
}
