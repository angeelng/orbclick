import { describe, expect, it } from 'vitest';
import { applyClick, tick } from '../src/core/engine';
import { createRng } from '../src/core/rng';
import { coinsPerClick, xpPerClick } from '../src/core/economy';
import { xpForNextLevel } from '../src/core/progression';
import { createInitialState } from '../src/core/state';
import { BALANCE } from '../src/data/balance';

const initial = createInitialState(1_000, 42);

describe('applyClick', () => {
  it('da monedas y XP, y cuenta el clic', () => {
    const result = applyClick(initial, 2_000);
    expect(result.coinsGained).toBe(coinsPerClick(initial));
    expect(result.xpGained).toBe(xpPerClick(initial));
    expect(result.state.coins).toBe(initial.coins + result.coinsGained);
    expect(result.state.stats.totalClicks).toBe(1);
    expect(result.state.stats.totalCoinsEarned).toBe(result.coinsGained);
  });

  it('adelanta el reloj de la partida', () => {
    expect(applyClick(initial, 5_000).state.lastSeenAt).toBe(5_000);
  });

  it('no muta el estado anterior', () => {
    const snapshot = structuredClone(initial);
    applyClick(initial, 2_000);
    expect(initial).toEqual(snapshot);
  });

  it('avisa de la subida de nivel al acumular XP suficiente', () => {
    let state = createInitialState(0, 1);
    let levelUps = 0;
    const clicksNeeded = xpForNextLevel(1) / BALANCE.click.baseXp;
    for (let i = 0; i < clicksNeeded; i += 1) {
      const result = applyClick(state, i);
      state = result.state;
      levelUps += result.levelsGained;
    }
    expect(levelUps).toBe(1);
    expect(state.trainer.level).toBe(2);
  });

  it('es determinista: mismo estado y mismo instante, mismo resultado', () => {
    expect(applyClick(initial, 2_000).state).toEqual(applyClick(initial, 2_000).state);
  });
});

describe('tick', () => {
  it('adelanta lastSeenAt', () => {
    expect(tick(initial, 4_000, createRng(1)).state.lastSeenAt).toBe(4_000);
  });

  it('devuelve el mismo objeto si no pasa nada', () => {
    expect(tick(initial, initial.lastSeenAt, createRng(1)).state).toBe(initial);
    expect(tick(initial, initial.lastSeenAt - 500, createRng(1)).state).toBe(initial);
  });
});

describe('createInitialState', () => {
  it('arranca en la Pradera, a nivel 1 y sin monedas', () => {
    const state = createInitialState(123, 7);
    expect(state).toMatchObject({
      coins: 0,
      trainer: { level: 1, xp: 0 },
      activeZoneId: 'meadow',
      unlockedZoneIds: ['meadow'],
      createdAt: 123,
      lastSeenAt: 123,
      rngSeed: 7,
    });
  });
});
