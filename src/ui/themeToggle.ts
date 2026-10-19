import { ES } from '../i18n/es';
import { element, setText } from './dom';

const STORAGE_KEY = 'orbclick:theme';

type Theme = 'light' | 'dark';

/** Lo que haya elegido el jugador manda sobre la preferencia del sistema. */
function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function currentTheme(): Theme {
  return storedTheme() ?? (systemPrefersDark() ? 'dark' : 'light');
}

function apply(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Conmutador claro / oscuro. La dirección visual es pastel claro, pero la
 * paleta tiene su variante oscura y conviene poder usarla.
 */
export interface ThemeToggle {
  toggle(): void;
}

export function mountThemeToggle(host: HTMLElement): ThemeToggle {
  let theme = currentTheme();
  apply(theme);

  const button = element('button', {
    className: 'button button--small theme-toggle',
    attrs: { type: 'button' },
  });
  const dot = element('span', { className: 'theme-dot' });
  const label = element('span');
  button.append(dot, label);

  const paint = (): void => {
    setText(label, theme === 'dark' ? ES.theme.light : ES.theme.dark);
    button.setAttribute('aria-label', theme === 'dark' ? ES.theme.light : ES.theme.dark);
  };

  const toggle = (): void => {
    theme = theme === 'dark' ? 'light' : 'dark';
    apply(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Sin almacenamiento el tema dura lo que la pestaña: no es grave.
    }
    paint();
  };

  button.addEventListener('click', toggle);

  paint();
  host.append(button);

  return { toggle };
}
