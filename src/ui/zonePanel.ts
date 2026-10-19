import { createRng } from '../core/rng';
import { clickDamage, coinsPerClick, format } from '../core/economy';
import { isZoneUnlocked, zoneBlock } from '../core/progression';
import { ranchProduction } from '../core/ranch';
import type { GameState, WildEncounter } from '../core/state';
import { BALANCE } from '../data/balance';
import { getBoss } from '../data/bosses';
import {
  ZONE_LIST,
  ZONE_NAMES,
  getZone,
  zoneUnlockedByBossOf,
  type ZoneDefinition,
  type ZoneId,
} from '../data/zones';
import { getAchievement } from '../data/achievements';
import { getSpecies } from '../data/species';
import { ES } from '../i18n/es';
import { registerCreatureSprites } from '../render/creatureSprites';
import { createPixelCanvas } from '../render/pixel';
import { ZONE_CAMERA, createZoneScene, type ZoneScene } from '../render/zoneScene';
import type { Game } from '../systems/game';
import { element, setText } from './dom';

export interface ZonePanel {
  /** Lo llama el bucle en cada fotograma. */
  render(frameMs: number, now: number): void;
  /** Lleva el foco al objeto clicable, para jugar con el teclado. */
  focus(): void;
  dispose(): void;
}

/**
 * Columna de la zona activa: canvas con el objeto clicable y el feedback del
 * clic (número flotante + partículas). El panel no toca el estado: solo
 * despacha `game.click()` y pinta lo que el juego le cuenta.
 */
export function mountZonePanel(host: HTMLElement, game: Game): ZonePanel {
  let zone = getZone(game.getState().activeZoneId);

  const heading = element('h2', { attrs: { id: 'zone-title' } });
  const title = element('div', { className: 'column-title' });
  title.append(heading);

  /*
   * Pestañas de zona: una por zona del MVP, siempre las tres a la vista para
   * que se vea lo que queda por delante. Las que aún no están abiertas se
   * quedan deshabilitadas y dicen qué les falta.
   */
  const tabs = element('div', { className: 'zone-tabs', attrs: { role: 'tablist' } });
  const tabButtons = new Map<ZoneId, HTMLButtonElement>();
  for (const definition of ZONE_LIST) {
    const tab = element('button', {
      className: 'zone-tab',
      text: definition.name,
      attrs: { type: 'button', role: 'tab' },
    });
    tab.addEventListener('click', () => {
      game.travelTo(definition.id);
    });
    tabButtons.set(definition.id, tab);
    tabs.append(tab);
  }

  const stage = element('div', { className: 'stage' });
  const canvasElement = element('canvas', {
    className: 'stage-canvas',
    attrs: { role: 'button', tabindex: '0' },
  });
  const overlay = element('div', { className: 'stage-overlay' });
  stage.append(canvasElement, overlay);

  const hint = element('p', { className: 'column-hint' });
  host.replaceChildren(title, tabs, stage, hint);

  registerCreatureSprites();
  const canvas = createPixelCanvas(canvasElement, ZONE_CAMERA.width, ZONE_CAMERA.height);
  const rng = createRng(game.getState().rngSeed);
  const scene: ZoneScene = createZoneScene(canvas, zone, rng);

  /** Nombre del jefe que guarda la puerta de una zona todavía cerrada. */
  const gatekeeperName = (definition: ZoneDefinition): string => {
    const previous = definition.requiresBossOf;
    return previous === null ? '' : getSpecies(getBoss(previous).speciesId).name;
  };

  /** Cabecera, pestañas y textos de la zona activa. */
  const renderZone = (state: GameState): void => {
    zone = getZone(state.activeZoneId);
    scene.setZone(zone);

    setText(heading, `${ES.zone.title} · ${zone.name}`);
    setText(hint, zone.clickHint);
    canvasElement.setAttribute('aria-label', ES.zone.clickableLabel(zone.clickableName));

    for (const definition of ZONE_LIST) {
      const tab = tabButtons.get(definition.id);
      if (tab === undefined) continue;
      const active = definition.id === state.activeZoneId;
      const open = isZoneUnlocked(state, definition.id);

      tab.classList.toggle('zone-tab--active', active);
      tab.classList.toggle('zone-tab--locked', !open);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      // En combate no se viaja: la salvaje y el equipo están a medias.
      tab.disabled = !open || active || state.battle !== null;
      tab.title = open
        ? ES.zone.travel(definition.name)
        : zoneBlock(state, definition.id) === 'level'
          ? ES.zone.needsLevel(definition.unlockLevel)
          : ES.zone.needsBoss(gatekeeperName(definition));
    }
  };

  /** Coloca un texto flotante en el overlay usando coordenadas lógicas. */
  const floatText = (logicalX: number, logicalY: number, text: string, variant = ''): void => {
    const canvasRect = canvasElement.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const node = element('span', {
      className: `floating-text ${variant}`.trim(),
      text,
    });
    node.style.left = `${canvasRect.left - stageRect.left + (logicalX / canvas.width) * canvasRect.width}px`;
    node.style.top = `${canvasRect.top - stageRect.top + (logicalY / canvas.height) * canvasRect.height}px`;
    node.style.setProperty('--float-ms', `${BALANCE.feedback.floatingTextMs}ms`);
    node.addEventListener('animationend', () => {
      node.remove();
    });
    overlay.append(node);
  };

  /**
   * Cartel sobre la zona: lo que pasa con la salvaje se anuncia aquí arriba,
   * en grande y con la tipografía del juego, en vez de en una línea pequeña
   * debajo del canvas.
   */
  const banner = (text: string, variant = ''): void => {
    const node = element('div', { className: `zone-banner ${variant}`.trim(), text });
    node.style.setProperty('--banner-ms', `${BALANCE.feedback.bannerMs}ms`);
    node.addEventListener('animationend', () => {
      node.remove();
    });
    // Solo un cartel a la vez: el último manda.
    overlay.querySelector('.zone-banner')?.remove();
    overlay.append(node);
  };

  const handleClick = (logicalX: number, logicalY: number): void => {
    // La salvaje tiene prioridad: está delante del árbol.
    if (scene.hitTestWild(logicalX, logicalY)) {
      // En combate, el clic va contra el enemigo y carga las habilidades.
      if (game.getState().battle !== null) game.hitEnemy();
      else game.hitWild();
      return;
    }
    if (!scene.hitTest(logicalX, logicalY)) return;
    game.click(logicalX, logicalY);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const point = canvas.toLogical(event.clientX, event.clientY);
    handleClick(point.x, point.y);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleClick(scene.center.x, scene.center.y);
  };

  canvasElement.addEventListener('pointerdown', onPointerDown);
  canvasElement.addEventListener('keydown', onKeyDown);

  const offZone = game.events.on('state:changed', ({ state }) => {
    renderZone(state);
  });

  const offUnlocked = game.events.on('zone:unlocked', ({ state, zoneId }) => {
    renderZone(state);
    banner(ES.zone.unlocked(ZONE_NAMES[zoneId]), 'zone-banner--good');
  });

  const offBossChallenged = game.events.on('boss:challenged', ({ speciesId }) => {
    banner(ES.encounter.appeared(getSpecies(speciesId).name));
  });

  const offBossDefeated = game.events.on('boss:defeated', ({ zoneId, speciesId }) => {
    const name = getSpecies(speciesId).name;
    const next = zoneUnlockedByBossOf(zoneId);
    banner(
      next === null ? ES.boss.wonLast(name) : ES.boss.won(name, next.name),
      'zone-banner--good',
    );
  });

  // Rebrote, escudo y oleada se anuncian en el cartel: pasan sin avisar.
  const offBossMechanic = game.events.on('boss:mechanic', ({ mechanic }) => {
    banner(ES.boss.mechanic[mechanic], 'zone-banner--bad');
  });

  // Un logro se canta en el cartel: es lo que mira el jugador al clicar.
  const offAchievement = game.events.on('achievement:unlocked', ({ achievementId }) => {
    banner(ES.achievements.unlocked(getAchievement(achievementId).name), 'zone-banner--good');
  });

  const offClick = game.events.on('click:resolved', ({ coinsGained, xpGained, x, y }) => {
    scene.punch(x, y);
    floatText(x, y - 6, `+${format(coinsGained)}`);
    floatText(x + 10, y + 4, `+${format(xpGained)} XP`, 'floating-text--xp');
  });

  const offLevelUp = game.events.on('trainer:levelup', ({ level }) => {
    floatText(
      scene.center.x,
      scene.center.y - 28,
      ES.feedback.levelUp(level),
      'floating-text--level',
    );
  });

  const offThrown = game.events.on('orb:thrown', ({ orbId, captured, fled, speciesId }) => {
    scene.playOrbThrow(orbId, captured, fled);
    if (speciesId === null) return;
    const name = getSpecies(speciesId).name;
    if (captured) banner(ES.encounter.captured(name), 'zone-banner--good');
    else banner(fled ? ES.encounter.fled(name) : ES.encounter.escaped(name), 'zone-banner--bad');
  });

  const offAppeared = game.events.on('wild:appeared', ({ state }) => {
    if (state.encounter === null) return;
    banner(ES.encounter.appeared(getSpecies(state.encounter.speciesId).name));
  });

  const offFled = game.events.on('wild:fled', ({ speciesId }) => {
    if (speciesId === null) return;
    banner(ES.encounter.fled(getSpecies(speciesId).name), 'zone-banner--bad');
  });

  // Clic sobre quien ya cayó en combate: lo que falta es lanzarle el orbe.
  const offNeedsOrb = game.events.on('wild:needsOrb', ({ speciesId }) => {
    if (speciesId === null) return;
    banner(ES.encounter.readyForOrb(getSpecies(speciesId).name), 'zone-banner--coins');
  });

  // Clic sobre una rara sin equipo: el cartel explica por qué no le pasa nada.
  const offNeedsTeam = game.events.on('wild:needsTeam', ({ speciesId }) => {
    if (speciesId === null) return;
    banner(ES.battle.needsBattle(getSpecies(speciesId).name), 'zone-banner--bad');
  });

  const offDefeated = game.events.on('wild:defeated', ({ coinsGained, xpGained, speciesId }) => {
    const center = scene.wildCenter ?? scene.center;
    floatText(center.x, center.y - 20, `+${format(coinsGained)}`);
    floatText(center.x + 12, center.y - 6, `+${format(xpGained)} XP`, 'floating-text--xp');
    if (speciesId !== null) {
      banner(
        ES.encounter.defeated(getSpecies(speciesId).name, format(coinsGained)),
        'zone-banner--coins',
      );
    }
  });

  const offDamaged = game.events.on('wild:damaged', ({ state, xpGained }) => {
    const center = scene.wildCenter;
    if (center === null) return;
    floatText(center.x, center.y - 10, `−${format(clickDamage(state))}`, 'floating-text--damage');
    if (xpGained > 0) {
      floatText(center.x + 12, center.y + 2, `+${format(xpGained)} XP`, 'floating-text--xp');
    }
  });

  /*
   * Clics automáticos: el Campo de recolección pega al árbol por su cuenta.
   * El estado ya cobra las monedas tick a tick; esto es solo el eco visual,
   * así que se recalcula al cambiar el estado y no en cada fotograma.
   */
  let autoCps = 0;
  let autoCoins = 0;
  let autoAccumulator = 0;
  let sinceLastText = 0;

  const offProduction = game.events.on('state:changed', ({ state }) => {
    autoCps = ranchProduction(state).cps;
    autoCoins = coinsPerClick(state);
  });

  const autoClicks = (frameMs: number): void => {
    if (autoCps <= 0) {
      autoAccumulator = 0;
      return;
    }
    const rate = Math.min(autoCps, BALANCE.feedback.autoClickMaxPerSecond);
    const interval = 1000 / rate;
    autoAccumulator += frameMs;
    sinceLastText += frameMs;

    // El tope del bucle evita una avalancha al volver de una pestaña parada.
    let remaining = Math.ceil(BALANCE.feedback.autoClickMaxPerSecond);
    while (autoAccumulator >= interval && remaining > 0) {
      autoAccumulator -= interval;
      remaining -= 1;

      const x = scene.center.x + rng.int(-8, 8);
      const y = scene.center.y + rng.int(-6, 6);
      scene.punch(x, y);

      const textInterval = 1000 / BALANCE.feedback.autoClickTextMaxPerSecond;
      if (sinceLastText >= textInterval) {
        sinceLastText = 0;
        floatText(x, y - 6, `+${format(autoCoins)}`, 'floating-text--auto');
      }
    }
  };

  // La captura reparte la XP de la rareza: conviene que se vea.
  const offCaptured = game.events.on('orb:thrown', ({ captured, xpGained }) => {
    if (!captured || xpGained <= 0) return;
    const center = scene.wildCenter ?? scene.center;
    floatText(center.x, center.y - 14, `+${format(xpGained)} XP`, 'floating-text--xp');
  });

  /**
   * Quién se pinta en el lienzo. Un jefe no es una aparición de la zona, así
   * que mientras se pelea con él se le presta el hueco de la salvaje: así
   * sale en escena con su barra y el clic le llega como a cualquier rival.
   */
  const canvasEncounter = (state: GameState): WildEncounter | null => {
    const { battle } = state;
    if (battle === null || battle.kind !== 'boss') return state.encounter;
    return {
      speciesId: battle.enemySpeciesId,
      hp: battle.enemyHp,
      maxHp: battle.enemyMaxHp,
      shiny: battle.enemyShiny,
      appearedAt: battle.startedAt,
      fleesAt: battle.endsAt,
    };
  };

  renderZone(game.getState());

  return {
    focus() {
      canvasElement.focus();
    },
    render(frameMs, now) {
      scene.setEncounter(canvasEncounter(game.getState()), now);
      autoClicks(frameMs);
      scene.render(frameMs);
    },
    dispose() {
      offClick();
      offLevelUp();
      offDamaged();
      offDefeated();
      offThrown();
      offCaptured();
      offProduction();
      offAppeared();
      offFled();
      offNeedsTeam();
      offNeedsOrb();
      offZone();
      offUnlocked();
      offBossChallenged();
      offBossDefeated();
      offBossMechanic();
      offAchievement();
      canvasElement.removeEventListener('pointerdown', onPointerDown);
      canvasElement.removeEventListener('keydown', onKeyDown);
      scene.dispose();
    },
  };
}
