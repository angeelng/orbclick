import {
  achievementGlobalBonus,
  achievementProgress,
  isAchievementUnlocked,
} from '../core/achievements';
import { format } from '../core/economy';
import type { GameState } from '../core/state';
import {
  ACHIEVEMENT_GROUPS,
  ACHIEVEMENT_LIST,
  achievementsOfGroup,
  type AchievementDefinition,
} from '../data/achievements';
import { ES } from '../i18n/es';
import type { Game } from '../systems/game';
import { element, setStyle, setText } from './dom';

/**
 * Logros: una pastilla en la barra superior con el recuento y el bonus, y un
 * `<dialog>` con la lista por grupos. Las tarjetas se construyen una vez y
 * después solo se reescriben la barra y el texto de progreso, que es lo único
 * que cambia.
 */
interface AchievementCard {
  readonly root: HTMLElement;
  readonly state: HTMLElement;
  readonly fill: HTMLElement;
}

export interface AchievementsPanel {
  /** Abre el diálogo; lo usan el botón y el atajo de teclado. */
  open(): void;
}

export function mountAchievementsPanel(host: HTMLElement, game: Game): AchievementsPanel {
  const button = element('button', {
    className: 'button button--small achievements-button',
    attrs: { type: 'button' },
  });
  const buttonLabel = element('span', { text: ES.achievements.open });
  const buttonCount = element('span', { className: 'achievements-count' });
  button.append(buttonLabel, buttonCount);

  const dialog = element('dialog', {
    className: 'dialog dialog--wide',
    attrs: { 'aria-label': ES.achievements.title },
  });
  const head = element('div', { className: 'dialog-head' });
  const title = element('h2', { className: 'dialog-title', text: ES.achievements.title });
  const bonus = element('span', { className: 'chip chip--done' });
  head.append(title, bonus);

  const hint = element('p', { className: 'dialog-hint', text: ES.achievements.bonusHint });
  const groups = element('div', { className: 'achievement-groups' });
  const actions = element('div', { className: 'dialog-actions' });
  const close = element('button', {
    className: 'button',
    text: ES.achievements.close,
    attrs: { type: 'button' },
  });
  close.addEventListener('click', () => {
    dialog.close();
  });
  actions.append(close);
  dialog.append(head, hint, groups, actions);

  const cards = new Map<string, AchievementCard>();

  const createCard = (achievement: AchievementDefinition): AchievementCard => {
    const root = element('article', { className: 'achievement' });
    const top = element('div', { className: 'achievement-head' });
    const state = element('span', { className: 'achievement-state' });
    top.append(element('h4', { className: 'achievement-name', text: achievement.name }), state);

    const track = element('div', { className: 'track track--achievement' });
    const fill = element('i');
    track.append(fill);

    root.append(
      top,
      element('p', { className: 'achievement-desc', text: achievement.description }),
      track,
    );
    return { root, state, fill };
  };

  for (const group of ACHIEVEMENT_GROUPS) {
    const section = element('section', { className: 'achievement-group' });
    section.append(
      element('h3', { className: 'achievement-group-title', text: ES.achievements.groups[group] }),
    );
    const list = element('div', { className: 'achievement-list' });
    for (const achievement of achievementsOfGroup(group)) {
      const card = createCard(achievement);
      cards.set(achievement.id, card);
      list.append(card.root);
    }
    section.append(list);
    groups.append(section);
  }

  const render = (state: GameState): void => {
    const done = state.achievements.length;
    setText(buttonCount, ES.achievements.summary(done, ACHIEVEMENT_LIST.length));
    button.setAttribute(
      'aria-label',
      `${ES.achievements.title}: ${ES.achievements.summary(done, ACHIEVEMENT_LIST.length)}`,
    );
    setText(bonus, ES.achievements.bonus(format(achievementGlobalBonus(state) * 100)));

    // La lista solo se repinta con el diálogo abierto: fuera no se ve.
    if (!dialog.open) return;
    for (const achievement of ACHIEVEMENT_LIST) {
      const card = cards.get(achievement.id);
      if (card === undefined) continue;
      const unlocked = isAchievementUnlocked(state, achievement.id);
      const { current, target } = achievementProgress(state, achievement);
      const ratio = unlocked ? 1 : Math.min(1, target <= 0 ? 1 : current / target);

      card.root.classList.toggle('achievement--done', unlocked);
      setText(
        card.state,
        unlocked
          ? ES.achievements.done
          : ES.achievements.progress(format(Math.min(current, target)), format(target)),
      );
      setStyle(card.fill, 'width', `${Math.round(ratio * 100)}%`);
    }
  };

  const open = (): void => {
    if (!dialog.open) dialog.showModal();
    render(game.getState());
  };

  button.addEventListener('click', open);

  game.events.on('state:changed', ({ state }) => {
    render(state);
  });

  host.append(button, dialog);
  render(game.getState());

  return { open };
}
