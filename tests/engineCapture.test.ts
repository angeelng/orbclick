import { describe, expect, it } from 'vitest';
import {
  captureXpOf,
  defeatReward,
  defeatXp,
  requiresBattle,
  weakenXp,
  wildHp,
} from '../src/core/capture';
import { buyOrbs, hitWild, tick, useOrb } from '../src/core/engine';
import { xpForNextLevel } from '../src/core/progression';
import { createRng, type Rng } from '../src/core/rng';
import { createInitialState, type GameState, type WildEncounter } from '../src/core/state';
import { BALANCE } from '../src/data/balance';
import { ORBS } from '../src/data/orbs';
import { getSpecies } from '../src/data/species';

const NOW = 500_000;
const base = createInitialState(NOW, 1);

function withState(overrides: Partial<GameState>): GameState {
  return { ...base, ...overrides };
}

function encounterOf(speciesId: Parameters<typeof getSpecies>[0], hp?: number): WildEncounter {
  const maxHp = wildHp(getSpecies(speciesId));
  return {
    speciesId,
    hp: hp ?? maxHp,
    maxHp,
    shiny: false,
    appearedAt: NOW,
    fleesAt: NOW + BALANCE.capture.encounterMs,
  };
}

function fakeRng(values: readonly number[]): Rng {
  let index = 0;
  const next = (): number => values[index++ % values.length] ?? 0;
  return {
    float: next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    seed: () => 11,
  };
}

describe('hitWild', () => {
  const rng = (): Rng => createRng(5);

  it('quita al clic el daño de clic del jugador', () => {
    const state = withState({ encounter: encounterOf('brotillo') });
    const result = hitWild(state, NOW + 10, rng());
    expect(result.state.encounter?.hp).toBe(BALANCE.capture.baseWildHp - BALANCE.click.baseDamage);
    expect(result.state.lastSeenAt).toBe(NOW + 10);
    expect(result.defeated).toBe(false);
  });

  it('no hace nada si no hay salvaje', () => {
    const result = hitWild(base, NOW, rng());
    expect(result.state).toBe(base);
    expect(result.speciesId).toBeNull();
  });

  it('mientras le quede vida no da monedas ni cuenta como clic del árbol', () => {
    const state = withState({ encounter: encounterOf('brotillo'), coins: 10 });
    const result = hitWild(state, NOW, rng());
    expect(result.state.coins).toBe(10);
    expect(result.state.stats.totalClicks).toBe(0);
    expect(result.coinsGained).toBe(0);
  });
});

describe('XP por debilitar', () => {
  const rng = (): Rng => createRng(5);

  it('cada golpe paga la parte proporcional del daño hecho', () => {
    const state = withState({ encounter: encounterOf('brotillo') });
    const result = hitWild(state, NOW, rng());
    const esperado =
      (captureXpOf('common') * BALANCE.capture.weakenXpShare) / BALANCE.capture.baseWildHp;
    expect(result.xpGained).toBeCloseTo(esperado, 6);
    expect(result.state.trainer.xp).toBeCloseTo(esperado, 6);
  });

  it('agotarle la barra entera paga la fracción pactada de la XP de captura', () => {
    let state = withState({ encounter: encounterOf('brotillo') });
    let total = 0;
    // Todos los golpes menos el último, para no mezclar el extra por rematar.
    for (let i = 0; i < BALANCE.capture.baseWildHp - 1; i += 1) {
      const result = hitWild(state, NOW, rng());
      state = result.state;
      total += result.xpGained;
    }
    const barraEntera = captureXpOf('common') * BALANCE.capture.weakenXpShare;
    expect(total).toBeCloseTo(barraEntera * ((BALANCE.capture.baseWildHp - 1) / 15), 6);
  });

  it('las rarezas altas pagan más por golpe', () => {
    const comun = hitWild(withState({ encounter: encounterOf('brotillo') }), NOW, rng()).xpGained;
    const pocoComun = hitWild(withState({ encounter: encounterOf('ascuin') }), NOW, rng()).xpGained;
    expect(pocoComun).toBeGreaterThan(comun);
  });

  it('el golpe de gracia suma el extra por derrotarla', () => {
    const state = withState({ encounter: encounterOf('brotillo', BALANCE.click.baseDamage) });
    const encounter = state.encounter;
    if (encounter === null) throw new Error('hace falta una salvaje');
    const result = hitWild(state, NOW, rng());
    expect(result.defeated).toBe(true);
    expect(result.xpGained).toBeCloseTo(
      weakenXp(encounter, BALANCE.click.baseDamage) + defeatXp(encounter),
      6,
    );
  });

  it('pelear da menos XP que capturar, para que el orbe siga mereciendo la pena', () => {
    let state = withState({ encounter: encounterOf('brotillo') });
    let total = 0;
    for (let i = 0; i < BALANCE.capture.baseWildHp; i += 1) {
      const result = hitWild(state, NOW, rng());
      state = result.state;
      total += result.xpGained;
    }
    expect(total).toBeLessThan(captureXpOf('common'));
  });

  it('el último golpe solo cobra los PV que quedaban', () => {
    const conGuantes = withState({
      encounter: encounterOf('brotillo', 1),
      upgrades: { 'gloves-1': 9 },
    });
    const encounter = conGuantes.encounter;
    if (encounter === null) throw new Error('hace falta una salvaje');
    const result = hitWild(conGuantes, NOW, rng());
    expect(result.xpGained).toBeCloseTo(weakenXp(encounter, 1) + defeatXp(encounter), 6);
  });

  it('sube de nivel si la XP de la pelea llega', () => {
    const state = withState({
      encounter: encounterOf('ascuin', BALANCE.click.baseDamage),
      trainer: { level: 1, xp: xpForNextLevel(1) - 1 },
    });
    const result = hitWild(state, NOW, rng());
    expect(result.levelsGained).toBe(1);
    expect(result.state.trainer.level).toBe(2);
  });

  it('sin salvaje no hay XP', () => {
    expect(hitWild(base, NOW, rng()).xpGained).toBe(0);
  });
});

describe('las raras exigen combate', () => {
  const rng = (): Rng => createRng(5);

  it('el clic no les quita PV y pide abrir combate', () => {
    const state = withState({ encounter: encounterOf('chispin') });
    const result = hitWild(state, NOW, rng());
    expect(result.needsBattle).toBe(true);
    expect(result.state).toBe(state);
    expect(result.xpGained).toBe(0);
    expect(result.speciesId).toBe('chispin');
  });

  it('las legendarias también', () => {
    expect(hitWild(withState({ encounter: encounterOf('cornavid') }), NOW, rng()).needsBattle).toBe(
      true,
    );
  });

  it('las comunes y poco comunes siguen debilitándose a clics', () => {
    for (const speciesId of ['brotillo', 'ascuin'] as const) {
      const result = hitWild(withState({ encounter: encounterOf(speciesId) }), NOW, rng());
      expect(result.needsBattle).toBe(false);
      expect(result.state.encounter?.hp).toBeLessThan(encounterOf(speciesId).hp);
    }
  });

  it('requiresBattle mira el escalón de rareza del balance', () => {
    expect(requiresBattle(encounterOf('brotillo'))).toBe(false);
    expect(requiresBattle(encounterOf('ascuin'))).toBe(false);
    expect(requiresBattle(encounterOf('chispin'))).toBe(true);
    expect(requiresBattle(encounterOf('geodron'))).toBe(true);
  });
});

describe('derrotar a la salvaje', () => {
  const rng = (): Rng => createRng(5);
  const almostDead = (speciesId: Parameters<typeof getSpecies>[0]): GameState =>
    withState({ encounter: encounterOf(speciesId, BALANCE.click.baseDamage) });

  it('el golpe que la deja a 0 la derrota y paga monedas', () => {
    const state = almostDead('brotillo');
    const result = hitWild(state, NOW, rng());
    expect(result.defeated).toBe(true);
    expect(result.speciesId).toBe('brotillo');
    expect(result.coinsGained).toBeGreaterThan(0);
    expect(result.state.coins).toBe(result.coinsGained);
  });

  it('la criatura se pierde: no entra en el Rancho y toca esperar a la siguiente', () => {
    const result = hitWild(almostDead('brotillo'), NOW, rng());
    expect(result.state.encounter).toBeNull();
    expect(result.state.creatures).toHaveLength(0);
    expect(result.state.nextSpawnAt).toBeGreaterThanOrEqual(NOW + BALANCE.capture.spawnMinMs);
  });

  it('paga PV_max · monedas por clic · bonus de rareza', () => {
    const state = almostDead('brotillo');
    const encounter = state.encounter;
    if (encounter === null) throw new Error('hace falta una salvaje');
    const expected = Math.round(
      encounter.maxHp * 1 * BALANCE.defeat.rarityBonus[getSpecies('brotillo').rarity],
    );
    expect(hitWild(state, NOW, rng()).coinsGained).toBe(expected);
    expect(defeatReward(state, encounter)).toBe(expected);
  });

  it('las rarezas altas pagan más porque suman PV y bonus', () => {
    const comun = hitWild(almostDead('brotillo'), NOW, rng()).coinsGained;
    const pocoComun = hitWild(almostDead('ascuin'), NOW, rng()).coinsGained;
    expect(pocoComun).toBeGreaterThan(comun);
  });

  it('las mejoras de clic suben el botín', () => {
    // Cuatro guantes dejan el clic en ×5, así que el botín se quintuplica.
    const conGuantes = {
      ...almostDead('brotillo'),
      upgrades: { 'gloves-1': 4 } as GameState['upgrades'],
    };
    const sinGuantes = hitWild(almostDead('brotillo'), NOW, rng()).coinsGained;
    const mejorado = hitWild(conGuantes, NOW, rng()).coinsGained;
    expect(mejorado).toBe(
      Math.round(BALANCE.capture.baseWildHp * 5 * BALANCE.defeat.rarityBonus.common),
    );
    // El redondeo a moneda entera impide un ×5 exacto sobre el valor base.
    expect(mejorado / sinGuantes).toBeCloseTo(5, 0);
  });

  it('cuenta la derrota y suma al total de monedas ganadas', () => {
    const result = hitWild(almostDead('brotillo'), NOW, rng());
    expect(result.state.stats.totalDefeats).toBe(1);
    expect(result.state.stats.totalCoinsEarned).toBe(result.coinsGained);
  });

  it('no muta el estado anterior', () => {
    const state = almostDead('brotillo');
    const snapshot = structuredClone(state);
    hitWild(state, NOW, rng());
    expect(state).toEqual(snapshot);
  });
});

describe('buyOrbs', () => {
  it('cobra precio fijo por unidad, sin la subida del 15 %', () => {
    const first = buyOrbs(withState({ coins: 1_000 }), 'basic', 1, NOW);
    expect(first.spent).toBe(ORBS.basic.price);
    const second = buyOrbs(first.state, 'basic', 1, NOW);
    expect(second.spent).toBe(ORBS.basic.price);
    expect(second.state.orbs.basic).toBe(2);
  });

  it('un paquete de 10 cuesta diez veces el precio', () => {
    const result = buyOrbs(withState({ coins: 1_000 }), 'basic', 10, NOW);
    expect(result.spent).toBe(ORBS.basic.price * 10);
    expect(result.state.orbs.basic).toBe(10);
  });

  it('rechaza orbes bloqueados por nivel, sin dinero o con cantidades raras', () => {
    expect(buyOrbs(withState({ coins: 1e6 }), 'lunar', 1, NOW).failure).toBe('locked');
    expect(buyOrbs(withState({ coins: 10 }), 'basic', 1, NOW).failure).toBe('too-poor');
    expect(buyOrbs(withState({ coins: 1e6 }), 'basic', 0, NOW).failure).toBe('invalid-amount');
    expect(buyOrbs(withState({ coins: 1e6 }), 'basic', 2.5, NOW).failure).toBe('invalid-amount');
  });

  it('el orbe de red se vende a partir del nivel 4', () => {
    const state = withState({ coins: 1_000, trainer: { level: 4, xp: 0 } });
    expect(buyOrbs(state, 'net', 1, NOW).bought).toBe(true);
  });
});

describe('useOrb', () => {
  const ready = withState({ encounter: encounterOf('brotillo'), orbs: { basic: 2 } });

  it('al capturar reparte la XP de la rareza y cuenta la captura', () => {
    const outcome = useOrb(ready, 'basic', NOW, fakeRng([0]));
    expect(outcome.captured).toBe(true);
    expect(outcome.state.trainer.xp).toBe(BALANCE.rarity.common.captureXp);
    expect(outcome.state.stats.totalCaptures).toBe(1);
    expect(outcome.state.stats.totalOrbsThrown).toBe(1);
  });

  it('al fallar cuenta el orbe lanzado pero no la captura', () => {
    const outcome = useOrb(ready, 'basic', NOW, fakeRng([0.99, 0.99]));
    expect(outcome.captured).toBe(false);
    expect(outcome.state.stats.totalCaptures).toBe(0);
    expect(outcome.state.stats.totalOrbsThrown).toBe(1);
  });

  it('avisa de la subida de nivel que provoca la captura', () => {
    const almost = withState({
      encounter: encounterOf('chispin'),
      orbs: { basic: 1 },
      trainer: { level: 1, xp: xpForNextLevel(1) - 5 },
    });
    const outcome = useOrb(almost, 'basic', NOW, fakeRng([0]));
    expect(outcome.levelsGained).toBe(1);
    expect(outcome.state.trainer.level).toBe(2);
  });

  it('un intento rechazado no toca las estadísticas', () => {
    const outcome = useOrb(base, 'basic', NOW, createRng(1));
    expect(outcome.failure).toBe('no-encounter');
    expect(outcome.state).toBe(base);
  });
});

describe('tick con apariciones', () => {
  it('hace aparecer una salvaje cuando toca', () => {
    const result = tick(withState({ nextSpawnAt: NOW }), NOW, createRng(3));
    expect(result.spawned).toBe(true);
    expect(result.state.encounter).not.toBeNull();
  });

  it('no hace aparecer nada antes de tiempo', () => {
    const result = tick(withState({ nextSpawnAt: NOW + 10_000 }), NOW, createRng(3));
    expect(result.spawned).toBe(false);
    expect(result.state.encounter).toBeNull();
  });

  it('hace huir a la salvaje que agotó su tiempo y programa la siguiente', () => {
    const state = withState({ encounter: encounterOf('brotillo') });
    const result = tick(state, NOW + BALANCE.capture.encounterMs, createRng(3));
    expect(result.fled).toBe(true);
    expect(result.state.encounter).toBeNull();
    expect(result.state.nextSpawnAt).toBeGreaterThan(NOW);
  });

  it('no toca a la salvaje que aún tiene tiempo', () => {
    const state = withState({ encounter: encounterOf('brotillo') });
    const result = tick(state, NOW + 1_000, createRng(3));
    expect(result.fled).toBe(false);
    expect(result.state.encounter).toEqual(state.encounter);
  });

  it('la semilla avanza con cada aparición, así que la partida es reproducible', () => {
    const a = tick(withState({ nextSpawnAt: NOW }), NOW, createRng(9));
    const b = tick(withState({ nextSpawnAt: NOW }), NOW, createRng(9));
    expect(a.state).toEqual(b.state);
    expect(a.state.rngSeed).not.toBe(base.rngSeed);
  });
});
