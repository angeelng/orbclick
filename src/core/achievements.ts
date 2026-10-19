import {
  ACHIEVEMENT_LIST,
  type AchievementDefinition,
  type AchievementId,
  type AchievementRequirement,
} from '../data/achievements';
import { BALANCE } from '../data/balance';
import type { PostId } from '../data/posts';
import type { SpeciesId } from '../data/species';
import { isBossDefeated } from './progression';
import { activeSynergies, creaturesAtPost, ranchSlots } from './ranch';
import type { GameState } from './state';

/**
 * Logros: qué se ha cumplido y cuánto suma. Evalúa los requisitos
 * declarativos de `data/achievements.ts`; es puro, como todo `core/`.
 *
 * Una vez conseguido, un logro no se pierde nunca: se apunta en
 * `state.achievements` y de ahí sale el bonus, así que deshacer la condición
 * (sacar a una criatura de su puesto, gastarse las bayas) no lo quita.
 */

export interface AchievementProgress {
  /** Lo conseguido hasta ahora, en las unidades del requisito. */
  readonly current: number;
  /** Lo que hay que alcanzar; en los logros de sí o no, 1. */
  readonly target: number;
}

/** Cuántas especies distintas de una lista hay ya en la colección. */
function speciesOwned(state: GameState, speciesIds: readonly SpeciesId[]): number {
  const owned = new Set<SpeciesId>(state.creatures.map((creature) => creature.speciesId));
  return speciesIds.filter((speciesId) => owned.has(speciesId)).length;
}

/** Puestos de la lista que tienen a alguien trabajando ahora mismo. */
function postsStaffed(state: GameState, postIds: readonly PostId[]): number {
  return postIds.filter((postId) => creaturesAtPost(state, postId).length > 0).length;
}

/** Progreso de un requisito, en bruto, para poder pintar una barra. */
export function requirementProgress(
  state: GameState,
  requirement: AchievementRequirement,
): AchievementProgress {
  switch (requirement.kind) {
    case 'stat':
      return { current: state.stats[requirement.stat], target: requirement.amount };
    case 'level':
      return { current: state.trainer.level, target: requirement.level };
    case 'boss':
      return { current: isBossDefeated(state, requirement.zoneId) ? 1 : 0, target: 1 };
    case 'species':
      return {
        current: speciesOwned(state, requirement.speciesIds),
        target: requirement.speciesIds.length,
      };
    case 'shiny':
      return { current: state.creatures.some((creature) => creature.shiny) ? 1 : 0, target: 1 };
    case 'creatureLevel': {
      const best = state.creatures.reduce((max, creature) => Math.max(max, creature.level), 0);
      return { current: best, target: requirement.level };
    }
    case 'postsStaffed':
      return {
        current: postsStaffed(state, requirement.postIds),
        target: requirement.postIds.length,
      };
    case 'synergies':
      return { current: activeSynergies(state).length, target: requirement.count };
    case 'ranchSlots':
      return { current: ranchSlots(state), target: requirement.slots };
    case 'berries':
      return { current: Math.floor(state.berries), target: requirement.amount };
  }
}

export function achievementProgress(
  state: GameState,
  achievement: AchievementDefinition,
): AchievementProgress {
  return requirementProgress(state, achievement.requirement);
}

/** ¿Se cumple ahora mismo la condición, esté apuntado o no? */
export function isAchievementMet(state: GameState, achievement: AchievementDefinition): boolean {
  const { current, target } = achievementProgress(state, achievement);
  return current >= target;
}

export function isAchievementUnlocked(state: GameState, id: AchievementId): boolean {
  return state.achievements.includes(id);
}

export function unlockedAchievements(state: GameState): readonly AchievementDefinition[] {
  return ACHIEVEMENT_LIST.filter((achievement) => isAchievementUnlocked(state, achievement.id));
}

/** Bonus global acumulado: +1 % por logro conseguido (GDD). */
export function achievementGlobalBonus(state: GameState): number {
  return state.achievements.length * BALANCE.achievements.globalBonus;
}

export interface AchievementCheck {
  readonly state: GameState;
  /** Logros conseguidos justo ahora, en el orden de la lista. */
  readonly unlocked: readonly AchievementId[];
}

/**
 * Apunta los logros que acaban de cumplirse. Se llama en cada tick: son
 * veintiocho comprobaciones baratas y así da igual qué acción los dispare.
 */
export function refreshAchievements(state: GameState): AchievementCheck {
  const unlocked = ACHIEVEMENT_LIST.filter(
    (achievement) =>
      !isAchievementUnlocked(state, achievement.id) && isAchievementMet(state, achievement),
  ).map((achievement) => achievement.id);

  if (unlocked.length === 0) return { state, unlocked };
  return { state: { ...state, achievements: [...state.achievements, ...unlocked] }, unlocked };
}
