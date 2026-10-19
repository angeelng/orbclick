import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import {
  grantTrainerXp,
  isMaxLevel,
  isZoneUnlocked,
  levelProgress,
  xpForNextLevel,
} from '../src/core/progression';
import { createInitialState } from '../src/core/state';

describe('xpForNextLevel', () => {
  it('sigue la curva XP(n) = base · growth^(n-1)', () => {
    const { xpBase, xpGrowth } = BALANCE.trainer;
    expect(xpForNextLevel(1)).toBe(xpBase);
    expect(xpForNextLevel(2)).toBe(Math.round(xpBase * xpGrowth));
    expect(xpForNextLevel(3)).toBe(Math.round(xpBase * xpGrowth ** 2));
  });

  it('cada nivel pide más XP que el anterior', () => {
    for (let level = 1; level < BALANCE.trainer.maxLevel - 1; level += 1) {
      expect(xpForNextLevel(level + 1)).toBeGreaterThan(xpForNextLevel(level));
    }
  });

  /*
   * Guarda del ajuste de la fase 7: la XP total del MVP sale de simular la
   * curva con `npm run balance:curve` (unas tres horas y media de juego
   * activo). Si alguien mueve `xpBase` o `xpGrowth` sin querer, esto salta.
   */
  it('la XP total del MVP se queda en la banda ajustada en la fase 7', () => {
    let total = 0;
    for (let level = 1; level < BALANCE.trainer.maxLevel; level += 1) {
      total += xpForNextLevel(level);
    }
    expect(total).toBeGreaterThan(200_000);
    expect(total).toBeLessThan(350_000);
  });

  it('es infinita al nivel máximo: no hay nivel siguiente', () => {
    expect(xpForNextLevel(BALANCE.trainer.maxLevel)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('grantTrainerXp', () => {
  it('acumula XP sin subir de nivel si no llega', () => {
    const result = grantTrainerXp({ level: 1, xp: 0 }, 40);
    expect(result).toEqual({ trainer: { level: 1, xp: 40 }, levelsGained: 0 });
  });

  it('sube de nivel y conserva el resto', () => {
    const needed = xpForNextLevel(1);
    const result = grantTrainerXp({ level: 1, xp: needed - 10 }, 20);
    expect(result.trainer).toEqual({ level: 2, xp: 10 });
    expect(result.levelsGained).toBe(1);
  });

  it('resuelve varias subidas de golpe', () => {
    const result = grantTrainerXp({ level: 1, xp: 0 }, xpForNextLevel(1) + xpForNextLevel(2) + 10);
    expect(result.trainer).toEqual({ level: 3, xp: 10 });
    expect(result.levelsGained).toBe(2);
  });

  it('ignora cantidades no positivas', () => {
    const trainer = { level: 2, xp: 30 };
    expect(grantTrainerXp(trainer, 0).trainer).toBe(trainer);
    expect(grantTrainerXp(trainer, -50).trainer).toBe(trainer);
  });

  it('no pasa del nivel máximo y descarta la XP sobrante', () => {
    const result = grantTrainerXp({ level: 1, xp: 0 }, 1e12);
    expect(result.trainer).toEqual({ level: BALANCE.trainer.maxLevel, xp: 0 });
    expect(isMaxLevel(result.trainer)).toBe(true);
    expect(grantTrainerXp(result.trainer, 500).levelsGained).toBe(0);
  });

  it('no muta el entrenador que recibe', () => {
    const trainer = { level: 1, xp: 99 };
    grantTrainerXp(trainer, 10);
    expect(trainer).toEqual({ level: 1, xp: 99 });
  });
});

describe('levelProgress', () => {
  it('va de 0 a 1 dentro del nivel', () => {
    const needed = xpForNextLevel(1);
    expect(levelProgress({ level: 1, xp: 0 })).toBe(0);
    expect(levelProgress({ level: 1, xp: needed / 2 })).toBe(0.5);
    expect(levelProgress({ level: 1, xp: needed })).toBe(1);
  });

  it('está completo al nivel máximo', () => {
    expect(levelProgress({ level: BALANCE.trainer.maxLevel, xp: 0 })).toBe(1);
  });
});

describe('zonas desbloqueadas', () => {
  it('la Pradera está disponible desde el principio', () => {
    expect(isZoneUnlocked(createInitialState(0, 1), 'meadow')).toBe(true);
  });
});
