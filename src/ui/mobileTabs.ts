import { ES } from '../i18n/es';
import type { Game } from '../systems/game';
import { element } from './dom';

/**
 * Pestañas inferiores de móvil (GDD · Layout): por debajo de 1024 px las tres
 * columnas no caben una al lado de otra, así que se enseña solo la elegida y
 * se cambia con una barra fija abajo. En escritorio la barra no existe y las
 * tres tarjetas vuelven a verse a la vez.
 *
 * La pestaña que no se está mirando puede avisar con un punto: una salvaje que
 * aparece mientras estás en la tienda, por ejemplo.
 */
export const MOBILE_TAB_IDS = ['zone', 'ranch', 'shop'] as const;

export type MobileTabId = (typeof MOBILE_TAB_IDS)[number];

const STORAGE_KEY = 'orbclick:tab';
const MOBILE_QUERY = '(max-width: 1023px)';

function storedTab(): MobileTabId {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return (MOBILE_TAB_IDS as readonly string[]).includes(value ?? '')
      ? (value as MobileTabId)
      : 'zone';
  } catch {
    return 'zone';
  }
}

export interface MobileTabsOptions {
  /** Columna de cada sección, tal como está en el documento. */
  readonly columns: Readonly<Record<MobileTabId, HTMLElement>>;
}

export function mountMobileTabs(host: HTMLElement, game: Game, options: MobileTabsOptions): void {
  const { columns } = options;
  let active = storedTab();

  const media = window.matchMedia(MOBILE_QUERY);
  const buttons = new Map<MobileTabId, HTMLButtonElement>();

  const paint = (): void => {
    for (const id of MOBILE_TAB_IDS) {
      const button = buttons.get(id);
      const column = columns[id];
      const selected = id === active;

      column.classList.toggle('column--active', selected);
      if (button === undefined) continue;
      button.classList.toggle('bottom-tab--active', selected);
      button.setAttribute('aria-selected', String(selected));
      // Solo la pestaña activa queda en el recorrido del tabulador (patrón ARIA).
      button.tabIndex = selected ? 0 : -1;
      if (selected) button.classList.remove('bottom-tab--alert');
    }
  };

  const select = (id: MobileTabId): void => {
    active = id;
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Sin almacenamiento la pestaña dura lo que la visita: no es grave.
    }
    paint();
  };

  for (const id of MOBILE_TAB_IDS) {
    const button = element('button', {
      className: 'bottom-tab',
      attrs: { type: 'button', role: 'tab', 'aria-controls': `${id}-column` },
    });
    button.append(
      element('span', { className: 'bottom-tab-label', text: ES.tabs[id] }),
      element('span', { className: 'bottom-tab-dot', attrs: { 'aria-hidden': 'true' } }),
    );
    button.addEventListener('click', () => {
      select(id);
    });
    buttons.set(id, button);
    host.append(button);
  }

  host.setAttribute('role', 'tablist');

  /** Marca una sección que pide atención mientras se mira otra. */
  const alert = (id: MobileTabId): void => {
    if (!media.matches || id === active) return;
    buttons.get(id)?.classList.add('bottom-tab--alert');
  };

  game.events.on('wild:appeared', () => {
    alert('zone');
  });
  game.events.on('battle:started', () => {
    alert('zone');
  });
  game.events.on('zone:unlocked', () => {
    alert('zone');
  });
  game.events.on('orb:thrown', ({ captured }) => {
    if (captured) alert('ranch');
  });

  media.addEventListener('change', paint);
  paint();
}
