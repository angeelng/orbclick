import { SAVE_VERSION } from './types';

/**
 * Cadena de migraciones: cada entrada lleva una partida de `from` a `from + 1`.
 * Nunca se edita una migración ya publicada; se añade la siguiente.
 */
type RawSave = Record<string, unknown>;

export interface Migration {
  readonly from: number;
  readonly migrate: (save: RawSave) => RawSave;
}

function isRecord(value: unknown): value is RawSave {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const MIGRATIONS: readonly Migration[] = [
  {
    // v1 → v2 (fase 2): el estado pasa a guardar las mejoras compradas.
    from: 1,
    migrate: (save: RawSave): RawSave => {
      const state = isRecord(save['state']) ? save['state'] : {};
      return { ...save, state: { ...state, upgrades: state['upgrades'] ?? {} } };
    },
  },
  {
    // v2 → v3 (fase 3): entran los orbes, las criaturas y las apariciones.
    from: 2,
    migrate: (save: RawSave): RawSave => {
      const state = isRecord(save['state']) ? save['state'] : {};
      return {
        ...save,
        state: {
          ...state,
          orbs: state['orbs'] ?? {},
          creatures: state['creatures'] ?? [],
          nextCreatureUid: state['nextCreatureUid'] ?? 1,
          encounter: null,
          // Sin fecha fiable para la siguiente aparición: que salga una ya.
          nextSpawnAt: 0,
        },
      };
    },
  },
  {
    // v3 → v4: se pueden derrotar salvajes a clics, y eso se cuenta.
    from: 3,
    migrate: (save: RawSave): RawSave => {
      const state = isRecord(save['state']) ? save['state'] : {};
      const stats = isRecord(state['stats']) ? state['stats'] : {};
      return { ...save, state: { ...state, stats: { ...stats, totalDefeats: 0 } } };
    },
  },
  {
    // v4 → v5 (fase 4): el Rancho trae bayas, plazas, puestos y mejoras.
    from: 4,
    migrate: (save: RawSave): RawSave => {
      const state = isRecord(save['state']) ? save['state'] : {};
      const creatures = Array.isArray(state['creatures']) ? state['creatures'] : [];
      return {
        ...save,
        state: {
          ...state,
          berries: state['berries'] ?? 0,
          extraRanchSlots: state['extraRanchSlots'] ?? 0,
          postUpgrades: state['postUpgrades'] ?? {},
          orbProgress: state['orbProgress'] ?? 0,
          // Las criaturas ya capturadas entran al Rancho sin puesto asignado.
          creatures: creatures.map((creature: unknown) =>
            isRecord(creature) ? { ...creature, postId: creature['postId'] ?? null } : creature,
          ),
        },
      };
    },
  },
  {
    // v5 → v6 (fase 5): equipo de combate y agotamiento tras caer.
    from: 5,
    migrate: (save: RawSave): RawSave => {
      const state = isRecord(save['state']) ? save['state'] : {};
      const creatures = Array.isArray(state['creatures']) ? state['creatures'] : [];
      return {
        ...save,
        state: {
          ...state,
          team: state['team'] ?? [],
          battle: null,
          creatures: creatures.map((creature: unknown) =>
            isRecord(creature)
              ? { ...creature, exhaustedUntil: creature['exhaustedUntil'] ?? 0 }
              : creature,
          ),
        },
      };
    },
  },
  {
    // v6 → v7 (fase 6): la Cueva y el Lago se vuelven jugables y hay jefes.
    from: 6,
    migrate: (save: RawSave): RawSave => {
      const state = isRecord(save['state']) ? save['state'] : {};
      return {
        ...save,
        state: {
          ...state,
          // Nadie ha vencido todavía a un jefe: las zonas nuevas se abren
          // cuando toque, con las mismas reglas que una partida nueva.
          bosses: state['bosses'] ?? {},
        },
      };
    },
  },
  {
    // v7 → v8 (fase 7): los logros se apuntan en la partida.
    from: 7,
    migrate: (save: RawSave): RawSave => {
      const state = isRecord(save['state']) ? save['state'] : {};
      /*
       * Una partida antigua empieza sin ningún logro apuntado, pero los que ya
       * cumpla se le conceden en el primer tick: `refreshAchievements` mira el
       * estado, no el historial.
       */
      return { ...save, state: { ...state, achievements: state['achievements'] ?? [] } };
    },
  },
];

export class SaveTooNewError extends Error {
  constructor(version: number) {
    super(`La partida es de la versión ${version} y este juego entiende hasta ${SAVE_VERSION}.`);
    this.name = 'SaveTooNewError';
  }
}

export class SaveUnmigratableError extends Error {
  constructor(version: number) {
    super(`No hay migración desde la versión ${version}.`);
    this.name = 'SaveUnmigratableError';
  }
}

/** Aplica las migraciones necesarias hasta `SAVE_VERSION`. */
export function migrate(save: RawSave): RawSave {
  const rawVersion = save['version'];
  let version = typeof rawVersion === 'number' ? rawVersion : 0;
  if (version > SAVE_VERSION) throw new SaveTooNewError(version);

  let current = save;
  while (version < SAVE_VERSION) {
    const migration = MIGRATIONS.find((candidate) => candidate.from === version);
    if (migration === undefined) throw new SaveUnmigratableError(version);
    current = { ...migration.migrate(current), version: version + 1 };
    version += 1;
  }
  return current;
}
