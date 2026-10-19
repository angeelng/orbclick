import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyClick } from '../src/core/engine';
import { createInitialState } from '../src/core/state';
import { LocalSaveRepository } from '../src/persistence/localSaveRepository';
import {
  MIGRATIONS,
  SaveTooNewError,
  SaveUnmigratableError,
  migrate,
} from '../src/persistence/migrations';
import { SaveParseError, parseSaveFile } from '../src/persistence/parse';
import { BALANCE } from '../src/data/balance';
import { SAVE_VERSION, toSaveFile } from '../src/persistence/types';

/** localStorage de mentira: el repositorio recibe el almacenamiento inyectado. */
function createMemoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string): string | null => map.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      map.set(key, value);
    },
    removeItem: (key: string): void => {
      map.delete(key);
    },
  };
}

const NOW = 1_700_000_000_000;
const SEED = 4321;

describe('toSaveFile', () => {
  it('sella la versión y el instante', () => {
    const save = toSaveFile(createInitialState(NOW, SEED), NOW);
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.savedAt).toBe(NOW);
  });
});

describe('migrate', () => {
  it('deja intacta una partida de la versión actual', () => {
    const save = { version: SAVE_VERSION, savedAt: NOW, state: {} };
    expect(migrate(save)).toEqual(save);
  });

  it('rechaza partidas de una versión futura', () => {
    expect(() => migrate({ version: SAVE_VERSION + 1 })).toThrow(SaveTooNewError);
  });

  it('avisa si falta una migración en la cadena', () => {
    expect(() => migrate({ version: 0 })).toThrow(SaveUnmigratableError);
  });

  it('la cadena de migraciones no tiene huecos ni duplicados', () => {
    const origins = MIGRATIONS.map((migration) => migration.from);
    expect(new Set(origins).size).toBe(origins.length);
    for (const origin of origins) {
      expect(origin).toBeLessThan(SAVE_VERSION);
    }
    // Cada versión anterior debe tener su escalón hasta la actual.
    for (let version = 1; version < SAVE_VERSION; version += 1) {
      expect(origins).toContain(version);
    }
  });

  it('v1 → v2: una partida de la fase 1 estrena las mejoras vacías', () => {
    const legacy = {
      version: 1,
      savedAt: NOW,
      state: { coins: 42, trainer: { level: 3, xp: 10 }, activeZoneId: 'meadow' },
    };
    const migrated = migrate(legacy);
    expect(migrated['version']).toBe(SAVE_VERSION);
    expect((migrated['state'] as Record<string, unknown>)['upgrades']).toEqual({});
    expect((migrated['state'] as Record<string, unknown>)['coins']).toBe(42);
  });

  it('v6 → v7: una partida de la fase 5 estrena los jefes sin vencer', () => {
    const legacy = {
      version: 6,
      savedAt: NOW,
      state: { coins: 10, team: [], activeZoneId: 'meadow', unlockedZoneIds: ['meadow'] },
    };
    const state = migrate(legacy)['state'] as Record<string, unknown>;
    expect(state['bosses']).toEqual({});
    // Las zonas nuevas siguen cerradas: nadie ha vencido todavía a un jefe.
    expect(state['unlockedZoneIds']).toEqual(['meadow']);
  });

  it('v7 → v8: una partida de la fase 6 estrena la lista de logros vacía', () => {
    const legacy = {
      version: 7,
      savedAt: NOW,
      state: { coins: 10, bosses: {}, activeZoneId: 'meadow', unlockedZoneIds: ['meadow'] },
    };
    const state = migrate(legacy)['state'] as Record<string, unknown>;
    expect(state['achievements']).toEqual([]);
  });

  it('descarta los logros desconocidos y no repite los buenos', () => {
    const parsed = parseSaveFile(
      {
        version: SAVE_VERSION,
        savedAt: NOW,
        state: {
          activeZoneId: 'meadow',
          achievements: ['first-click', 'first-click', 'logro-inventado', 7],
        },
      },
      NOW,
      1,
    );
    expect(parsed.state.achievements).toEqual(['first-click']);
  });

  it('una partida de la fase 1 carga entera tras migrar', () => {
    const parsed = parseSaveFile(
      {
        version: 1,
        savedAt: NOW,
        state: {
          coins: 250,
          trainer: { level: 4, xp: 33 },
          stats: { totalClicks: 120, totalCoinsEarned: 250 },
          activeZoneId: 'meadow',
          unlockedZoneIds: ['meadow'],
          rngSeed: 12,
        },
      },
      NOW,
      SEED,
    );
    expect(parsed.version).toBe(SAVE_VERSION);
    expect(parsed.state.coins).toBe(250);
    expect(parsed.state.trainer).toEqual({ level: 4, xp: 33 });
    expect(parsed.state.upgrades).toEqual({});
  });
});

describe('parseSaveFile · zonas y jefes', () => {
  it('se queda con los jefes conocidos y descarta la morralla', () => {
    const parsed = parseSaveFile(
      {
        version: SAVE_VERSION,
        savedAt: NOW,
        state: {
          bosses: {
            meadow: { defeated: true, availableAt: NOW + 1000 },
            mountain: { defeated: true, availableAt: 0 },
            cave: 'si',
          },
        },
      },
      NOW,
      SEED,
    );
    expect(parsed.state.bosses).toEqual({ meadow: { defeated: true, availableAt: NOW + 1000 } });
  });

  it('recorta un enfriamiento imposible en vez de bloquear al jefe', () => {
    const parsed = parseSaveFile(
      {
        version: SAVE_VERSION,
        savedAt: NOW,
        state: { bosses: { lake: { defeated: true, availableAt: NOW + 10 ** 12 } } },
      },
      NOW,
      SEED,
    );
    const availableAt = parsed.state.bosses.lake?.availableAt ?? 0;
    expect(availableAt).toBeLessThanOrEqual(NOW + BALANCE.combat.boss.retryCooldownMs);
  });

  it('las zonas desbloqueadas se guardan sin repetidas y sin inventadas', () => {
    const parsed = parseSaveFile(
      {
        version: SAVE_VERSION,
        savedAt: NOW,
        state: { unlockedZoneIds: ['meadow', 'meadow', 'cave', 'mountain'] },
      },
      NOW,
      SEED,
    );
    expect(parsed.state.unlockedZoneIds).toEqual(['meadow', 'cave']);
  });

  it('una zona activa desconocida vuelve a la Pradera', () => {
    const parsed = parseSaveFile(
      { version: SAVE_VERSION, savedAt: NOW, state: { activeZoneId: 'mountain' } },
      NOW,
      SEED,
    );
    expect(parsed.state.activeZoneId).toBe('meadow');
  });
});

describe('parseSaveFile', () => {
  it('da la vuelta completa a una partida válida', () => {
    const state = applyClick(createInitialState(NOW, SEED), NOW + 10).state;
    const parsed = parseSaveFile(
      JSON.parse(JSON.stringify(toSaveFile(state, NOW))) as unknown,
      NOW,
      SEED,
    );
    expect(parsed.state).toEqual(state);
  });

  it('rechaza lo que no es un objeto', () => {
    expect(() => parseSaveFile('nope', NOW, SEED)).toThrow(SaveParseError);
    expect(() => parseSaveFile(null, NOW, SEED)).toThrow(SaveParseError);
  });

  it('repone los campos corruptos con el valor inicial', () => {
    const parsed = parseSaveFile(
      {
        version: SAVE_VERSION,
        savedAt: 'ayer',
        state: {
          coins: -50,
          trainer: { level: 0, xp: 'mucha' },
          stats: { totalClicks: 2.7, totalCoinsEarned: null },
          activeZoneId: 'atlantida',
          unlockedZoneIds: ['atlantida'],
          upgrades: { 'gloves-1': 2, 'no-existe': 5, 'gloves-2': -3, 'gloves-3': 'muchos' },
        },
      },
      NOW,
      SEED,
    );

    expect(parsed.savedAt).toBe(NOW);
    expect(parsed.state.coins).toBe(0);
    expect(parsed.state.trainer).toEqual({ level: 1, xp: 0 });
    expect(parsed.state.stats).toEqual({
      totalClicks: 2,
      totalCoinsEarned: 0,
      totalCaptures: 0,
      totalOrbsThrown: 0,
      totalDefeats: 0,
    });
    expect(parsed.state.activeZoneId).toBe('meadow');
    expect(parsed.state.unlockedZoneIds).toEqual(['meadow']);
    // Las mejoras desconocidas o con cantidades imposibles se descartan.
    expect(parsed.state.upgrades).toEqual({ 'gloves-1': 2 });
  });

  it('conserva los campos válidos aunque falten otros', () => {
    const parsed = parseSaveFile(
      { version: SAVE_VERSION, state: { coins: 1234, trainer: { level: 5, xp: 20 } } },
      NOW,
      SEED,
    );
    expect(parsed.state.coins).toBe(1234);
    expect(parsed.state.trainer).toEqual({ level: 5, xp: 20 });
    expect(parsed.state.rngSeed).toBe(SEED);
  });
});

describe('parseSaveFile · criaturas y apariciones', () => {
  const creature = {
    uid: 3,
    speciesId: 'brotillo',
    level: 4,
    xp: 12,
    traitId: 'lucky',
    shiny: true,
    satiety: 55,
    location: 'reserve',
    postId: null,
    exhaustedUntil: 0,
    capturedAt: NOW - 1000,
  };

  it('recupera un ejemplar entero', () => {
    const parsed = parseSaveFile(
      { version: SAVE_VERSION, state: { creatures: [creature], nextCreatureUid: 4 } },
      NOW,
      SEED,
    );
    expect(parsed.state.creatures).toEqual([creature]);
    expect(parsed.state.nextCreatureUid).toBe(4);
  });

  it('descarta especies y rasgos desconocidos', () => {
    const parsed = parseSaveFile(
      {
        version: SAVE_VERSION,
        state: {
          creatures: [
            { ...creature, speciesId: 'dragonazo' },
            { ...creature, uid: 9, traitId: 'invencible' },
            'esto no es una criatura',
          ],
        },
      },
      NOW,
      SEED,
    );
    expect(parsed.state.creatures).toHaveLength(1);
    expect(parsed.state.creatures[0]?.traitId).toBe('hardworking');
  });

  it('reasigna los uid repetidos y nunca los reparte dos veces', () => {
    const parsed = parseSaveFile(
      {
        version: SAVE_VERSION,
        state: { creatures: [creature, { ...creature }], nextCreatureUid: 1 },
      },
      NOW,
      SEED,
    );
    const uids = parsed.state.creatures.map((entry) => entry.uid);
    expect(new Set(uids).size).toBe(uids.length);
    expect(parsed.state.nextCreatureUid).toBeGreaterThan(Math.max(...uids));
  });

  it('recorta la saciedad y el nivel a valores posibles', () => {
    const parsed = parseSaveFile(
      {
        version: SAVE_VERSION,
        state: { creatures: [{ ...creature, satiety: 999, level: 0 }] },
      },
      NOW,
      SEED,
    );
    expect(parsed.state.creatures[0]?.satiety).toBe(100);
    expect(parsed.state.creatures[0]?.level).toBe(1);
  });

  it('restaura una aparición que todavía tiene tiempo', () => {
    const encounter = {
      speciesId: 'pelusin',
      hp: 5,
      maxHp: 15,
      shiny: false,
      appearedAt: NOW,
      fleesAt: NOW + 10_000,
    };
    const parsed = parseSaveFile({ version: SAVE_VERSION, state: { encounter } }, NOW, SEED);
    expect(parsed.state.encounter).toEqual(encounter);
  });

  it('tira la aparición caducada o imposible', () => {
    const caducada = {
      version: SAVE_VERSION,
      state: {
        encounter: { speciesId: 'pelusin', hp: 5, maxHp: 15, fleesAt: NOW - 1 },
      },
    };
    expect(parseSaveFile(caducada, NOW, SEED).state.encounter).toBeNull();

    const desconocida = {
      version: SAVE_VERSION,
      state: { encounter: { speciesId: 'fantasma', fleesAt: NOW + 5_000 } },
    };
    expect(parseSaveFile(desconocida, NOW, SEED).state.encounter).toBeNull();
  });

  it('se queda solo con los orbes del catálogo', () => {
    const parsed = parseSaveFile(
      {
        version: SAVE_VERSION,
        state: { orbs: { basic: 3, maestro: 99, net: -1 } },
      },
      NOW,
      SEED,
    );
    expect(parsed.state.orbs).toEqual({ basic: 3 });
  });

  it('v3 → v4: una partida anterior estrena el contador de derrotas', () => {
    const migrated = migrate({
      version: 3,
      savedAt: NOW,
      state: { stats: { totalClicks: 9 } },
    });
    const state = migrated['state'] as Record<string, unknown>;
    const stats = state['stats'] as Record<string, unknown>;
    expect(migrated['version']).toBe(SAVE_VERSION);
    expect(stats['totalDefeats']).toBe(0);
    expect(stats['totalClicks']).toBe(9);
  });

  it('v2 → v3: una partida de la fase 2 estrena orbes y criaturas vacíos', () => {
    const migrated = migrate({ version: 2, savedAt: NOW, state: { coins: 10 } });
    const state = migrated['state'] as Record<string, unknown>;
    expect(migrated['version']).toBe(SAVE_VERSION);
    expect(state['orbs']).toEqual({});
    expect(state['creatures']).toEqual([]);
    expect(state['coins']).toBe(10);
  });
});

describe('LocalSaveRepository', () => {
  let storage: ReturnType<typeof createMemoryStorage>;
  let repository: LocalSaveRepository;

  beforeEach(() => {
    storage = createMemoryStorage();
    repository = new LocalSaveRepository({
      storage,
      now: () => NOW,
      fallbackSeed: () => SEED,
    });
  });

  it('devuelve null cuando no hay partida', async () => {
    expect(await repository.load()).toBeNull();
  });

  it('guarda y recupera el mismo estado', async () => {
    const state = applyClick(createInitialState(NOW, SEED), NOW).state;
    await repository.save(toSaveFile(state, NOW));
    const loaded = await repository.load();
    expect(loaded?.state).toEqual(state);
  });

  it('empieza de cero si la partida guardada es ilegible', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    storage.setItem('orbclick:save:v1', '{ esto no es json');
    expect(await repository.load()).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('sigue jugando si el almacenamiento rechaza la escritura', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failing = new LocalSaveRepository({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('cuota llena');
        },
        removeItem: () => undefined,
      },
      now: () => NOW,
      fallbackSeed: () => SEED,
    });
    await expect(
      failing.save(toSaveFile(createInitialState(NOW, SEED), NOW)),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('clear borra la partida', async () => {
    await repository.save(toSaveFile(createInitialState(NOW, SEED), NOW));
    await repository.clear();
    expect(await repository.load()).toBeNull();
  });

  it('respeta la clave de almacenamiento que se le pase', async () => {
    const custom = new LocalSaveRepository({
      key: 'orbclick:test',
      storage,
      now: () => NOW,
      fallbackSeed: () => SEED,
    });
    await custom.save(toSaveFile(createInitialState(NOW, SEED), NOW));
    expect(storage.map.has('orbclick:test')).toBe(true);
  });
});
