import { describe, expect, it } from 'vitest';
import {
  achievementGlobalBonus,
  achievementProgress,
  isAchievementMet,
  isAchievementUnlocked,
  refreshAchievements,
  unlockedAchievements,
} from '../src/core/achievements';
import { clickBonuses, coinsPerClick } from '../src/core/economy';
import { tick } from '../src/core/engine';
import { createRng } from '../src/core/rng';
import { createInitialState, type CapturedCreature, type GameState } from '../src/core/state';
import {
  ACHIEVEMENT_IDS,
  ACHIEVEMENT_LIST,
  achievementsOfGroup,
  getAchievement,
} from '../src/data/achievements';
import { BALANCE } from '../src/data/balance';
import type { PostId } from '../src/data/posts';
import type { SpeciesId } from '../src/data/species';

const NOW = 1_000_000;

function freshState(): GameState {
  return createInitialState(NOW, 7);
}

function creature(uid: number, speciesId: SpeciesId, extra: Partial<CapturedCreature> = {}) {
  return {
    uid,
    speciesId,
    level: 1,
    xp: 0,
    traitId: 'hardworking' as const,
    shiny: false,
    satiety: 100,
    location: 'ranch' as const,
    exhaustedUntil: 0,
    postId: null,
    capturedAt: NOW,
    ...extra,
  };
}

describe('catálogo de logros', () => {
  it('tiene cerca de los 25 del GDD y ningún id repetido', () => {
    expect(ACHIEVEMENT_LIST.length).toBeGreaterThanOrEqual(25);
    expect(new Set(ACHIEVEMENT_IDS).size).toBe(ACHIEVEMENT_IDS.length);
  });

  it('reparte todos los logros entre los grupos de la interfaz', () => {
    const grouped = (['click', 'capture', 'ranch', 'combat', 'progress'] as const).flatMap(
      (group) => achievementsOfGroup(group),
    );
    expect(grouped).toHaveLength(ACHIEVEMENT_LIST.length);
  });
});

describe('requisitos', () => {
  it('cuenta los contadores de la partida', () => {
    const state: GameState = {
      ...freshState(),
      stats: { ...freshState().stats, totalClicks: 120 },
    };
    expect(achievementProgress(state, getAchievement('clicks-100'))).toEqual({
      current: 120,
      target: 100,
    });
    expect(isAchievementMet(state, getAchievement('clicks-100'))).toBe(true);
    expect(isAchievementMet(state, getAchievement('clicks-1000'))).toBe(false);
  });

  it('mira el nivel de entrenador', () => {
    const state: GameState = { ...freshState(), trainer: { level: 10, xp: 0 } };
    expect(isAchievementMet(state, getAchievement('level-10'))).toBe(true);
    expect(isAchievementMet(state, getAchievement('level-15'))).toBe(false);
  });

  it('mira los jefes vencidos', () => {
    const state: GameState = {
      ...freshState(),
      bosses: { meadow: { defeated: true, availableAt: 0 } },
    };
    expect(isAchievementMet(state, getAchievement('boss-meadow'))).toBe(true);
    expect(isAchievementMet(state, getAchievement('boss-cave'))).toBe(false);
  });

  it('cuenta las especies distintas de la colección, no los ejemplares', () => {
    const state: GameState = {
      ...freshState(),
      creatures: [creature(1, 'brotillo'), creature(2, 'brotillo'), creature(3, 'pelusin')],
    };
    expect(achievementProgress(state, getAchievement('roster-meadow'))).toEqual({
      current: 2,
      target: 4,
    });
  });

  it('reconoce la primera variocolor', () => {
    const shiny: GameState = {
      ...freshState(),
      creatures: [creature(1, 'goton', { shiny: true })],
    };
    expect(isAchievementMet(shiny, getAchievement('first-shiny'))).toBe(true);
    expect(isAchievementMet(freshState(), getAchievement('first-shiny'))).toBe(false);
  });

  it('exige que los seis puestos tengan a alguien a la vez', () => {
    const posts: readonly PostId[] = ['gather', 'farm', 'mine', 'craft', 'explore', 'care'];
    const state: GameState = {
      ...freshState(),
      creatures: posts.map((postId, index) => creature(index + 1, 'brotillo', { postId })),
    };
    expect(isAchievementMet(state, getAchievement('posts-all'))).toBe(true);

    const shortOne: GameState = { ...state, creatures: state.creatures.slice(1) };
    expect(achievementProgress(shortOne, getAchievement('posts-all')).current).toBe(5);
  });

  it('cuenta las plazas de Rancho y las bayas guardadas', () => {
    const state: GameState = { ...freshState(), extraRanchSlots: 4, berries: 100.9 };
    expect(isAchievementMet(state, getAchievement('ranch-slots-8'))).toBe(true);
    expect(achievementProgress(state, getAchievement('berries-100')).current).toBe(100);
  });

  it('mira el nivel de la criatura más veterana', () => {
    const state: GameState = {
      ...freshState(),
      creatures: [creature(1, 'brotillo', { level: 4 }), creature(2, 'pelusin', { level: 11 })],
    };
    expect(isAchievementMet(state, getAchievement('creature-level-10'))).toBe(true);
  });
});

describe('refreshAchievements', () => {
  it('no toca el estado si no hay nada nuevo', () => {
    const state = freshState();
    const result = refreshAchievements(state);
    expect(result.state).toBe(state);
    expect(result.unlocked).toEqual([]);
  });

  it('apunta los logros cumplidos y no los repite', () => {
    const state: GameState = { ...freshState(), stats: { ...freshState().stats, totalClicks: 1 } };
    const first = refreshAchievements(state);
    expect(first.unlocked).toEqual(['first-click']);
    expect(first.state.achievements).toEqual(['first-click']);

    const second = refreshAchievements(first.state);
    expect(second.unlocked).toEqual([]);
    expect(second.state).toBe(first.state);
  });

  it('un logro conseguido no se pierde al deshacer la condición', () => {
    const withBerries: GameState = { ...freshState(), berries: 150 };
    const unlocked = refreshAchievements(withBerries).state;
    expect(isAchievementUnlocked(unlocked, 'berries-100')).toBe(true);

    const spent = refreshAchievements({ ...unlocked, berries: 0 }).state;
    expect(isAchievementUnlocked(spent, 'berries-100')).toBe(true);
  });
});

describe('bonus global', () => {
  it('suma un +1 % por logro y entra en las monedas por clic', () => {
    const base = freshState();
    expect(achievementGlobalBonus(base)).toBe(0);

    const withThree: GameState = {
      ...base,
      achievements: ['first-click', 'clicks-100', 'level-5'],
    };
    expect(achievementGlobalBonus(withThree)).toBeCloseTo(3 * BALANCE.achievements.globalBonus);
    expect(clickBonuses(withThree).global).toBeCloseTo(0.03);
    expect(coinsPerClick(withThree)).toBeCloseTo(coinsPerClick(base) * 1.03);
    expect(unlockedAchievements(withThree)).toHaveLength(3);
  });
});

describe('tick', () => {
  it('concede los logros cumplidos y los anuncia una sola vez', () => {
    const state: GameState = {
      ...freshState(),
      stats: { ...freshState().stats, totalClicks: 1, totalCaptures: 1 },
    };
    const first = tick(state, NOW + 100, createRng(1));
    expect(first.unlockedAchievementIds).toEqual(['first-click', 'first-capture']);

    const second = tick(first.state, NOW + 200, createRng(1));
    expect(second.unlockedAchievementIds).toEqual([]);
    expect(second.state.achievements).toEqual(['first-click', 'first-capture']);
  });
});
