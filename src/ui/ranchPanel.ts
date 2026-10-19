import { format } from '../core/economy';
import {
  activeSynergies,
  creaturesAtPost,
  creaturesInRanch,
  creaturesInReserve,
  isPostUnlocked,
  ranchProduction,
  ranchSlots,
  satietyFactor,
  skillAt,
  type RanchProduction,
} from '../core/ranch';
import type { CapturedCreature, GameState } from '../core/state';
import { creatureStats, isExhausted, isInTeam, teamCreatures, teamSlots } from '../core/combat';
import { ABILITY_KIND_NAMES } from '../data/combat';
import { POST_LIST, getPost, type PostId } from '../data/posts';
import { RARITY_NAMES, WORK_SKILL_NAMES, getSpecies, type WorkSkill } from '../data/species';
import { getTrait } from '../data/traits';
import { ES } from '../i18n/es';
import { TYPE_NAMES } from '../i18n/names';
import { creatureSpriteId } from '../render/creatureSprites';
import { createPixelCanvas } from '../render/pixel';
import { RANCH_CANVAS, createRanchScene } from '../render/ranchScene';
import type { Game } from '../systems/game';
import { element, setText } from './dom';
import { spriteCanvas } from './spriteCanvas';

export interface RanchPanel {
  render(frameMs: number): void;
  dispose(): void;
}

type RanchTab = 'posts' | 'creatures' | 'team';

/**
 * Columna del Rancho: el canvas con los puestos arriba y, debajo, dos
 * pestañas — qué produce cada puesto y la lista de criaturas con su ficha.
 */
export function mountRanchPanel(host: HTMLElement, game: Game): RanchPanel {
  const title = element('div', { className: 'column-title' });
  const counts = element('span', { className: 'column-count' });
  title.append(element('h2', { text: ES.ranch.title, attrs: { id: 'ranch-title' } }), counts);

  const stage = element('div', { className: 'stage stage--ranch' });
  const canvasElement = element('canvas', { className: 'stage-canvas' });
  stage.append(canvasElement);

  const tabs = element('div', { className: 'tabs', attrs: { role: 'tablist' } });
  const body = element('div', {
    className: 'ranch-body',
    attrs: { id: 'ranch-body', role: 'tabpanel', 'aria-label': ES.ranch.title },
  });
  const dialog = element('dialog', { className: 'dialog' });

  host.replaceChildren(title, stage, tabs, body, dialog);

  const canvas = createPixelCanvas(canvasElement, RANCH_CANVAS.width, RANCH_CANVAS.height);
  const scene = createRanchScene(canvas);

  let activeTab: RanchTab = 'posts';
  const tabButtons = new Map<RanchTab, HTMLButtonElement>();

  for (const tab of ['posts', 'creatures', 'team'] as const) {
    const button = element('button', {
      className: 'tab',
      text: ES.ranch.tabs[tab],
      attrs: { type: 'button', role: 'tab', 'aria-controls': 'ranch-body' },
    });
    button.addEventListener('click', () => {
      activeTab = tab;
      renderTabs();
      renderBody(game.getState());
    });
    tabButtons.set(tab, button);
    tabs.append(button);
  }

  const renderTabs = (): void => {
    for (const [tab, button] of tabButtons) {
      const selected = tab === activeTab;
      button.classList.toggle('tab--active', selected);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
  };

  // --- retratos y ficha -----------------------------------------------------

  const portrait = (creature: CapturedCreature, scale: number): HTMLCanvasElement =>
    spriteCanvas(creatureSpriteId(getSpecies(creature.speciesId), creature.shiny), scale);

  const skillsText = (skills: Readonly<Partial<Record<WorkSkill, number>>>): string =>
    Object.entries(skills)
      .map(([skill, value]) => `${WORK_SKILL_NAMES[skill as WorkSkill]} ${value}`)
      .join(' · ');

  const openSheet = (creature: CapturedCreature): void => {
    const state = game.getState();
    const species = getSpecies(creature.speciesId);
    const trait = getTrait(creature.traitId);

    const head = element('div', { className: 'sheet-head' });
    const column = element('div');
    column.append(
      element('h2', { className: 'dialog-title', text: species.name }),
      element('p', {
        className: 'dialog-hint',
        text: `${ES.creature.level(creature.level)} · ${RARITY_NAMES[species.rarity]} · ${TYPE_NAMES[species.type]}`,
      }),
    );
    if (creature.shiny) {
      column.append(element('span', { className: 'chip chip--shiny', text: ES.encounter.shiny }));
    }
    head.append(portrait(creature, 6), column);

    const facts = element('dl', { className: 'sheet-facts' });
    const addFact = (label: string, value: string): void => {
      const row = element('div');
      row.append(element('dt', { text: label }), element('dd', { text: value }));
      facts.append(row);
    };
    addFact(ES.creature.trait, `${trait.name} · ${trait.description}`);
    addFact(ES.creature.skills, skillsText(species.skills));
    addFact(ES.creature.passive, species.passive);
    addFact(
      ES.creature.active,
      `${species.ability.name} · ${ABILITY_KIND_NAMES[species.ability.kind]}`,
    );
    const stats = creatureStats(creature);
    addFact(
      ES.creature.stats,
      `${stats.hp} PV · ${stats.atk} ATQ · ${stats.def} DEF · ${stats.spd} VEL`,
    );
    addFact(
      ES.creature.satiety,
      `${Math.round(creature.satiety)} / 100${
        satietyFactor(creature.satiety) === 0
          ? ` · ${ES.ranch.starving}`
          : satietyFactor(creature.satiety) < 1
            ? ` · ${ES.ranch.hungry}`
            : ''
      }`,
    );

    // Puestos en los que esta criatura sirve de algo.
    const assign = element('div', { className: 'sheet-assign' });
    assign.append(element('span', { className: 'resource-label', text: ES.ranch.assign }));
    const options = element('div', { className: 'sheet-posts' });

    for (const post of POST_LIST) {
      const skill = skillAt(creature, post.id);
      if (skill === 0) continue;

      const unlocked = isPostUnlocked(state, post.id);
      const current = creature.postId === post.id && creature.location === 'ranch';
      const button = element('button', {
        className: `button button--small${current ? ' button--accent' : ''}`,
        text: `${post.name} ·${skill}`,
        attrs: { type: 'button' },
      });
      button.disabled = !unlocked;
      if (!unlocked) button.title = ES.ranch.locked(post.unlockLevel);
      button.addEventListener('click', () => {
        const result = game.assign(creature.uid, current ? null : post.id);
        if (!result.assigned && result.failure === 'ranch-full') {
          setText(message, ES.ranch.ranchFull);
          return;
        }
        dialog.close();
      });
      options.append(button);
    }
    assign.append(options);

    const message = element('p', { className: 'dialog-status' });

    const actions = element('div', { className: 'dialog-actions' });
    // Entrar o salir del equipo de combate.
    const inTeam = isInTeam(state, creature.uid);
    const team = element('button', {
      className: `button${inTeam ? '' : ' button--accent'}`,
      text: inTeam ? ES.team.remove : ES.team.add,
      attrs: { type: 'button' },
    });
    team.disabled = !inTeam && (teamSlots(state) === 0 || isExhausted(creature, Date.now()));
    team.addEventListener('click', () => {
      const result = inTeam ? game.removeFromTeam(creature.uid) : game.addToTeam(creature.uid);
      if (!result.changed && result.failure === 'team-full') {
        setText(message, ES.team.full);
        return;
      }
      dialog.close();
    });

    const move = element('button', {
      className: 'button',
      text: creature.location === 'ranch' ? ES.ranch.toReserve : ES.ranch.toRanch,
      attrs: { type: 'button' },
    });
    move.addEventListener('click', () => {
      const result =
        creature.location === 'ranch'
          ? game.sendToReserve(creature.uid)
          : game.assign(creature.uid, null);
      if (!result.assigned && result.failure === 'ranch-full') {
        setText(message, ES.ranch.ranchFull);
        return;
      }
      dialog.close();
    });
    const close = element('button', {
      className: 'button',
      text: ES.creature.close,
      attrs: { type: 'button' },
    });
    close.addEventListener('click', () => {
      dialog.close();
    });
    actions.append(team, move, close);

    dialog.replaceChildren(head, facts, assign, message, actions);
    dialog.showModal();
  };

  // --- pestaña de puestos ---------------------------------------------------

  const postValue = (postId: PostId, production: RanchProduction): string => {
    switch (postId) {
      case 'gather':
        return ES.ranch.cps(format(production.cps));
      case 'mine':
        return ES.ranch.mining(format(production.miningBonus * 100));
      case 'farm':
        return ES.ranch.berries(format(production.berriesPerMinute));
      case 'craft':
        return ES.ranch.orbsCraft(
          format(production.orbsPerMinute),
          format(production.orbDiscount * 100),
        );
      case 'explore':
        return ES.ranch.explore(format(production.spawnSpeedBonus * 100));
      case 'care':
        return ES.ranch.care(format(production.nurseryXpPerMinute));
    }
  };

  const renderPosts = (state: GameState): void => {
    const production = ranchProduction(state);
    const list = element('div', { className: 'post-list' });

    for (const post of POST_LIST) {
      const unlocked = isPostUnlocked(state, post.id);
      const workers = creaturesAtPost(state, post.id);
      const row = element('article', {
        className: `post-row${unlocked ? '' : ' post-row--locked'}`,
      });

      const head = element('div', { className: 'post-head' });
      head.append(
        element('h3', { className: 'post-name', text: post.name }),
        element('span', {
          className: 'post-count',
          text: unlocked ? ES.ranch.workers(workers.length) : ES.ranch.locked(post.unlockLevel),
        }),
      );

      const value = element('span', {
        className: 'post-value',
        text: unlocked && workers.length > 0 ? postValue(post.id, production) : post.output,
      });

      row.append(head, value);

      if (workers.length > 0) {
        const crew = element('div', { className: 'post-crew' });
        for (const worker of workers) {
          const button = element('button', {
            className: 'post-worker',
            attrs: { type: 'button', 'aria-label': getSpecies(worker.speciesId).name },
          });
          button.append(portrait(worker, 2));
          button.addEventListener('click', () => {
            openSheet(worker);
          });
          crew.append(button);
        }
        row.append(crew);
      }
      list.append(row);
    }

    // Sinergias activas, que el GDD cuenta una vez por par.
    const synergies = activeSynergies(state);
    const synergyBox = element('div', { className: 'synergies' });
    synergyBox.append(element('span', { className: 'resource-label', text: ES.ranch.synergies }));
    if (synergies.length === 0) {
      synergyBox.append(element('p', { className: 'column-hint', text: ES.ranch.noSynergies }));
    } else {
      const effectNames: Record<string, string> = {
        berries: 'bayas',
        mining: 'minería',
        cps: 'clics por segundo',
      };
      for (const synergy of synergies) {
        synergyBox.append(
          element('p', {
            className: 'synergy',
            text: ES.ranch.synergy(
              synergy.types.map((type) => TYPE_NAMES[type]).join(' + '),
              effectNames[synergy.effect] ?? synergy.effect,
              format(synergy.bonus * 100),
            ),
          }),
        );
      }
    }

    body.replaceChildren(list, synergyBox);
  };

  // --- pestaña de criaturas --------------------------------------------------

  const card = (creature: CapturedCreature): HTMLElement => {
    const species = getSpecies(creature.speciesId);
    const button = element('button', {
      className: `creature-card creature-card--${creature.location}`,
      attrs: { type: 'button', 'aria-label': `${species.name}, ficha` },
    });
    const post = creature.postId === null ? null : getPost(creature.postId);
    button.append(
      portrait(creature, 4),
      element('span', { className: 'creature-name', text: species.name }),
      element('span', {
        className: 'creature-sub',
        text: post === null ? ES.creature.level(creature.level) : post.name,
      }),
    );
    if (creature.shiny) {
      button.append(element('span', { className: 'creature-shiny', text: '★' }));
    }
    if (satietyFactor(creature.satiety) < 1) {
      button.append(
        element('span', {
          className: 'creature-warning',
          text: satietyFactor(creature.satiety) === 0 ? '✖' : '!',
        }),
      );
    }
    button.addEventListener('click', () => {
      openSheet(creature);
    });
    return button;
  };

  const renderCreatures = (state: GameState): void => {
    if (state.creatures.length === 0) {
      body.replaceChildren(
        element('div', { className: 'column-placeholder', text: ES.ranch.placeholder }),
      );
      return;
    }
    const grid = element('div', { className: 'creature-grid' });
    grid.append(...[...creaturesInRanch(state), ...creaturesInReserve(state)].map(card));
    body.replaceChildren(grid);
  };

  const renderTeam = (state: GameState): void => {
    const slots = teamSlots(state);
    const members = teamCreatures(state);

    if (slots === 0) {
      body.replaceChildren(
        element('div', { className: 'column-placeholder', text: ES.team.locked }),
      );
      return;
    }

    const head = element('div', { className: 'column-title' });
    head.append(
      element('h3', { className: 'post-name', text: ES.team.title }),
      element('span', {
        className: 'column-count',
        text: ES.team.slots(members.length, slots),
      }),
    );

    const grid = element('div', { className: 'creature-grid' });
    if (members.length === 0) {
      grid.append(element('div', { className: 'column-placeholder', text: ES.team.empty }));
    } else {
      grid.append(...members.map(card));
    }

    body.replaceChildren(
      head,
      grid,
      element('p', { className: 'column-hint', text: ES.team.note }),
    );
  };

  const renderBody = (state: GameState): void => {
    if (activeTab === 'posts') renderPosts(state);
    else if (activeTab === 'team') renderTeam(state);
    else renderCreatures(state);
  };

  /** Repintar la lista entera en cada tick sería un desperdicio. */
  let signature = '';

  const render = (state: GameState): void => {
    setText(
      counts,
      `${ES.ranch.slots(creaturesInRanch(state).length, ranchSlots(state))} · ${ES.ranch.reserve(
        creaturesInReserve(state).length,
      )}`,
    );

    const next = [
      state.trainer.level,
      state.creatures
        .map(
          (creature) =>
            `${creature.uid}:${creature.location}:${creature.postId ?? '-'}:${creature.level}:${
              satietyFactor(creature.satiety) === 1 ? 'ok' : 'low'
            }`,
        )
        .join(','),
      Object.entries(state.postUpgrades).join(','),
      state.team.join(','),
      activeTab,
    ].join('|');
    if (next === signature) return;
    signature = next;
    renderBody(state);
  };

  game.events.on('state:changed', ({ state }) => {
    render(state);
  });

  renderTabs();
  render(game.getState());

  return {
    render(frameMs) {
      scene.render(frameMs, game.getState());
    },
    dispose() {
      scene.dispose();
    },
  };
}
