import {
  applyClick,
  buyBerries,
  buyOrbs,
  buyPostUpgrade,
  buyRanchSlot,
  buyUpgrade,
  hitWild,
  tick as tickState,
  travelToZone,
  useOrb,
  type OrbThrowOutcome,
  type PurchaseResult,
  type TravelResult,
} from '../core/engine';
import { coinsPerClick } from '../core/economy';
import {
  addToTeam,
  clickEnemy,
  fleeBattle,
  removeFromTeam,
  startBattle,
  startBossBattle,
  useAbility,
  useBerry,
  type AbilityResult,
  type BattleStartResult,
  type BerryResult,
  type TeamResult,
} from '../core/combat';
import { clickDamage } from '../core/economy';
import {
  assignToPost,
  offlineProgress,
  sendToReserve,
  type AssignResult,
  type RanchGains,
} from '../core/ranch';
import { createRng } from '../core/rng';
import { createInitialState, type GameState } from '../core/state';
import { BALANCE } from '../data/balance';
import type { UpgradeId } from '../data/items';
import type { OrbId } from '../data/orbs';
import type { PostId } from '../data/posts';
import { getZone, type ZoneId } from '../data/zones';
import { decodeSave, encodeSave } from '../persistence/codec';
import { toSaveFile, type SaveRepository } from '../persistence/types';
import { createEventBus, type EventBus } from './events';

/**
 * Dueño del `GameState`: aplica las reglas puras de `core/`, emite eventos y
 * guarda. Es el único sitio que conoce a la vez el reloj real y el repositorio;
 * la UI solo lee estado y despacha acciones.
 */
export interface Game {
  readonly events: EventBus;
  getState(): GameState;
  /** Clic sobre el objeto de la zona; (x, y) en coordenadas lógicas del canvas. */
  click(x: number, y: number): void;
  /** Clic sobre la salvaje: la debilita para que el orbe tenga más opciones. */
  hitWild(): void;
  /** Compra unidades de una mejora; devuelve qué pasó para que la UI avise. */
  buy(upgradeId: UpgradeId, amount?: number): PurchaseResult;
  buyOrbs(orbId: OrbId, amount?: number): PurchaseResult;
  buyBerries(amount?: number): PurchaseResult;
  buyRanchSlot(): PurchaseResult;
  buyPostUpgrade(postId: PostId): PurchaseResult;
  /** Pone a trabajar a una criatura en un puesto (`null` la deja parada). */
  assign(uid: number, postId: PostId | null): AssignResult;
  sendToReserve(uid: number): AssignResult;
  addToTeam(uid: number): TeamResult;
  removeFromTeam(uid: number): TeamResult;
  /** Reta a la salvaje de la zona con el equipo. */
  startBattle(): BattleStartResult;
  /** Reta al jefe de una zona desbloqueada. */
  challengeBoss(zoneId: ZoneId): BattleStartResult;
  /** Viaja a una zona ya desbloqueada. */
  travelTo(zoneId: ZoneId): TravelResult;
  /** Clic sobre el enemigo durante el combate. */
  hitEnemy(): void;
  useAbility(uid: number): AbilityResult;
  useBerry(uid: number): BerryResult;
  fleeBattle(): void;
  throwOrb(orbId: OrbId): OrbThrowOutcome;
  tick(): void;
  load(): Promise<void>;
  save(): Promise<void>;
  /** Código de texto con la partida actual. */
  exportSave(): string;
  /** Reemplaza la partida por la del código. Lanza `SaveParseError` si no vale. */
  importSave(code: string): Promise<void>;
}

export interface GameOptions {
  readonly repository: SaveRepository;
  /** Reloj real en ms (`Date.now`). El tiempo nunca se lee dentro de `core/`. */
  readonly clock: () => number;
  readonly seed: () => number;
}

export function createGame(options: GameOptions): Game {
  const { repository, clock, seed } = options;
  const events = createEventBus();

  let state = createInitialState(clock(), seed());
  let lastSaveAt = clock();

  const commit = (next: GameState): void => {
    state = next;
    events.emit('state:changed', { state });
  };

  /** Cursor del PRNG sobre la semilla guardada; `core/` devuelve la siguiente. */
  const rng = (): ReturnType<typeof createRng> => createRng(state.rngSeed);

  const game: Game = {
    events,
    getState: () => state,

    click(x, y) {
      const result = applyClick(state, clock());
      commit(result.state);
      events.emit('click:resolved', {
        state: result.state,
        coinsGained: result.coinsGained,
        xpGained: result.xpGained,
        x,
        y,
      });
      if (result.levelsGained > 0) {
        events.emit('trainer:levelup', { level: result.state.trainer.level });
      }
    },

    hitWild() {
      const result = hitWild(state, clock(), rng());
      if (result.needsOrb) {
        events.emit('wild:needsOrb', { state, speciesId: result.speciesId });
        return;
      }
      // Las raras no se debilitan a clics: el clic abre el combate (GDD).
      if (result.needsBattle) {
        const battle = startBattle(state, clock());
        if (battle.started) {
          commit(battle.state);
          events.emit('battle:started', { state: battle.state });
        } else {
          events.emit('wild:needsTeam', { state, speciesId: result.speciesId });
        }
        return;
      }
      if (result.state === state) return;
      commit(result.state);
      if (result.defeated) {
        events.emit('wild:defeated', {
          state: result.state,
          speciesId: result.speciesId,
          coinsGained: result.coinsGained,
          xpGained: result.xpGained,
        });
      } else {
        events.emit('wild:damaged', { state: result.state, xpGained: result.xpGained });
      }
      if (result.levelsGained > 0) {
        events.emit('trainer:levelup', { level: result.state.trainer.level });
      }
    },

    buy(upgradeId, amount = 1) {
      const result = buyUpgrade(state, upgradeId, amount, clock());
      if (result.bought) {
        commit(result.state);
        events.emit('shop:purchased', {
          state: result.state,
          upgradeId,
          quantity: result.quantity,
          spent: result.spent,
        });
      }
      return result;
    },

    buyOrbs(orbId, amount = 1) {
      const result = buyOrbs(state, orbId, amount, clock());
      if (result.bought) {
        commit(result.state);
        events.emit('shop:bought', { state: result.state, what: 'orbs', spent: result.spent });
      }
      return result;
    },

    buyBerries(amount = 1) {
      const result = buyBerries(state, amount, clock());
      if (result.bought) {
        commit(result.state);
        events.emit('shop:bought', { state: result.state, what: 'berries', spent: result.spent });
      }
      return result;
    },

    buyRanchSlot() {
      const result = buyRanchSlot(state, clock());
      if (result.bought) {
        commit(result.state);
        events.emit('shop:bought', { state: result.state, what: 'slot', spent: result.spent });
      }
      return result;
    },

    buyPostUpgrade(postId) {
      const result = buyPostUpgrade(state, postId, clock());
      if (result.bought) {
        commit(result.state);
        events.emit('shop:bought', { state: result.state, what: 'post', spent: result.spent });
      }
      return result;
    },

    assign(uid, postId) {
      const result = assignToPost(state, uid, postId);
      if (result.assigned) commit(result.state);
      return result;
    },

    sendToReserve(uid) {
      const result = sendToReserve(state, uid);
      if (result.assigned) commit(result.state);
      return result;
    },

    addToTeam(uid) {
      const result = addToTeam(state, uid, clock());
      if (result.changed) commit(result.state);
      return result;
    },

    removeFromTeam(uid) {
      const result = removeFromTeam(state, uid);
      if (result.changed) commit(result.state);
      return result;
    },

    travelTo(zoneId) {
      const result = travelToZone(state, zoneId, clock(), rng());
      if (result.moved) {
        commit(result.state);
        events.emit('zone:changed', { state: result.state, zoneId });
      }
      return result;
    },

    startBattle() {
      const result = startBattle(state, clock());
      if (result.started) {
        commit(result.state);
        events.emit('battle:started', { state: result.state });
      }
      return result;
    },

    challengeBoss(zoneId) {
      const result = startBossBattle(state, zoneId, clock());
      if (result.started) {
        commit(result.state);
        events.emit('boss:challenged', {
          state: result.state,
          zoneId,
          speciesId: getZone(zoneId).bossSpeciesId,
        });
        events.emit('battle:started', { state: result.state });
      }
      return result;
    },

    hitEnemy() {
      const next = clickEnemy(state, clickDamage(state));
      if (next !== state) commit(next);
    },

    useAbility(uid) {
      const result = useAbility(state, uid, clock(), rng());
      if (result.used) commit(result.state);
      return result;
    },

    useBerry(uid) {
      const result = useBerry(state, uid);
      if (result.used) commit(result.state);
      return result;
    },

    fleeBattle() {
      const next = fleeBattle(state);
      if (next !== state) commit(next);
    },

    throwOrb(orbId) {
      const outcome = useOrb(state, orbId, clock(), rng());
      if (outcome.failure !== null) return outcome;

      commit(outcome.state);
      events.emit('orb:thrown', {
        state: outcome.state,
        orbId,
        speciesId: outcome.speciesId,
        captured: outcome.captured,
        fled: outcome.fled,
        chance: outcome.chance,
        creature: outcome.creature,
        xpGained: outcome.captured ? outcome.xpGained : 0,
      });
      if (outcome.levelsGained > 0) {
        events.emit('trainer:levelup', { level: outcome.state.trainer.level });
      }
      return outcome;
    },

    tick() {
      const now = clock();
      const result = tickState(state, now, rng());
      if (result.state !== state) commit(result.state);
      if (result.battleOutcome !== null) {
        events.emit('battle:ended', {
          state: result.state,
          outcome: result.battleOutcome,
          coins: result.battleReward?.coins ?? 0,
          xp: result.battleReward?.xp ?? 0,
        });
      }
      if (result.bossDefeatedZoneId !== null) {
        events.emit('boss:defeated', {
          state: result.state,
          zoneId: result.bossDefeatedZoneId,
          speciesId: getZone(result.bossDefeatedZoneId).bossSpeciesId,
        });
      }
      for (const mechanic of result.bossMechanics) {
        events.emit('boss:mechanic', { state: result.state, mechanic });
      }
      for (const achievementId of result.unlockedAchievementIds) {
        events.emit('achievement:unlocked', { state: result.state, achievementId });
      }
      if (result.battleReward !== null && result.battleReward.levelsGained > 0) {
        events.emit('trainer:levelup', { level: result.state.trainer.level });
      }
      if (result.fled) {
        events.emit('wild:fled', { state: result.state, speciesId: result.fledSpeciesId });
      }
      if (result.spawned) events.emit('wild:appeared', { state: result.state });
      for (const zoneId of result.unlockedZoneIds) {
        events.emit('zone:unlocked', { state: result.state, zoneId });
      }
      if (now - lastSaveAt >= BALANCE.loop.autosaveMs) {
        void game.save();
      }
    },

    async load() {
      const save = await repository.load();
      if (save !== null) {
        state = save.state;
        lastSaveAt = clock();
      }

      // Lo que el Rancho produjo mientras no estabas (GDD: 50 %, máx. 8 h).
      let offline: RanchGains | null = null;
      if (save !== null) {
        const away = offlineProgress(state, clock(), coinsPerClick(state));
        if (away !== null) {
          state = away.state;
          offline = away.gains;
        }
      }

      events.emit('game:loaded', { state, savedAt: save?.savedAt ?? null, offline });
      events.emit('state:changed', { state });
    },

    async save() {
      const at = clock();
      lastSaveAt = at;
      await repository.save(toSaveFile(state, at));
      events.emit('game:saved', { at });
    },

    exportSave() {
      return encodeSave(toSaveFile(state, clock()));
    },

    async importSave(code) {
      const save = decodeSave(code, clock(), seed());
      state = save.state;
      events.emit('game:imported', { state });
      events.emit('state:changed', { state });
      await game.save();
    },
  };

  return game;
}
