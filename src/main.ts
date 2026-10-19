import './styles/base.css';
import './styles/layout.css';

import { LocalSaveRepository } from './persistence/localSaveRepository';
import { connectAudio, createAudio } from './systems/audio';
import { createLoop } from './systems/loop';
import { createGame } from './systems/game';
import { element, mustFind } from './ui/dom';
import { mountAchievementsPanel } from './ui/achievementsPanel';
import { mountAudioControls } from './ui/audioControls';
import { mountAnnouncer } from './ui/announcer';
import { mountMobileTabs } from './ui/mobileTabs';
import { mountShortcuts } from './ui/shortcuts';
import { mountOfflineSummary } from './ui/offlineSummary';
import { mountRanchPanel } from './ui/ranchPanel';
import { mountBattlePanel } from './ui/battlePanel';
import { mountEncounterPanel } from './ui/encounterPanel';
import { mountSaveMenu } from './ui/saveMenu';
import { mountThemeToggle } from './ui/themeToggle';
import { mountShopPanel } from './ui/shopPanel';
import { mountTopbar } from './ui/topbar';
import { mountZonePanel } from './ui/zonePanel';

/** Semilla inicial del PRNG: lo único que entra del exterior sin determinismo. */
function freshSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] ?? Date.now() >>> 0;
}

const clock = (): number => Date.now();

const repository = new LocalSaveRepository({ now: clock, fallbackSeed: freshSeed });
const game = createGame({ repository, clock, seed: freshSeed });

// El sonido reacciona a los eventos del juego; la interfaz solo lo ajusta.
const audio = createAudio();
connectAudio(game, audio);

const topbar = mustFind('topbar');
mountTopbar(topbar, game);
mountSaveMenu(topbar, game);
const topbarMenu = topbar.querySelector<HTMLElement>('.save-menu') ?? topbar;
const achievements = mountAchievementsPanel(topbarMenu, game);
mountAudioControls(topbarMenu, audio);
const theme = mountThemeToggle(topbarMenu);
const zoneColumn = mustFind('zone-column');
const ranchColumn = mustFind('ranch-column');
const shopColumn = mustFind('shop-column');
const zonePanel = mountZonePanel(zoneColumn, game);

/*
 * El lienzo se queda fijo arriba y lo que hay debajo —la salvaje de turno y el
 * combate con su jefe— se desplaza si no cabe. Sin esto, cuando coinciden una
 * aparición y un jefe a tiro, las tarjetas se salen de la columna.
 */
const zoneBody = element('div', { className: 'column-body' });
zoneColumn.append(zoneBody);
const encounterPanel = mountEncounterPanel(zoneBody, game);
const battlePanel = mountBattlePanel(zoneBody, game);
const ranchPanel = mountRanchPanel(ranchColumn, game);
mountOfflineSummary(document.body, game);
mountShopPanel(shopColumn, game);

// En móvil solo se ve una columna a la vez; las pestañas de abajo la eligen.
mountMobileTabs(mustFind('bottom-tabs'), game, {
  columns: { zone: zoneColumn, ranch: ranchColumn, shop: shopColumn },
});

// Teclado y lector de pantalla: el ratón no puede ser la única entrada.
mountShortcuts(topbarMenu, game, audio, {
  openAchievements: () => {
    achievements.open();
  },
  toggleTheme: () => {
    theme.toggle();
  },
  focusZone: () => {
    zonePanel.focus();
  },
});
mountAnnouncer(document.body, game);

const loop = createLoop({
  onTick: () => {
    game.tick();
  },
  onRender: (frameMs) => {
    const now = clock();
    zonePanel.render(frameMs, now);
    ranchPanel.render(frameMs);
    encounterPanel.refresh(now);
    battlePanel.refresh(now);
  },
});

// Guardar al salir o al pasar la pestaña a segundo plano (regla de arquitectura 5).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void game.save();
});
window.addEventListener('pagehide', () => {
  void game.save();
});

void game.load().then(() => {
  loop.start();
});
