import {
  add,
  clickDamage,
  coinsPerClick,
  gte,
  ownedCount,
  sub,
  upgradeBundlePrice,
  upgradeRemaining,
  xpPerClick,
} from './economy';
import {
  captureXpOf,
  clearEncounter,
  damageEncounter,
  requiresBattle,
  defeatReward,
  defeatXp,
  weakenXp,
  hasEncounterExpired,
  isSpawnDue,
  orbCount,
  spawnEncounter,
  throwOrb,
  type ThrowResult,
} from './capture';
import {
  advanceRanch,
  isPostUnlocked,
  postUpgradeLevel,
  postUpgradePrice,
  ranchProduction,
  ranchSlotPrice,
  ranchSlots,
  type RanchGains,
} from './ranch';
import { advanceBattle, type BattleOutcome } from './combat';
import { refreshAchievements } from './achievements';
import {
  grantTrainerXp,
  isUpgradeUnlocked,
  isZoneUnlocked,
  refreshZoneUnlocks,
} from './progression';
import type { AchievementId } from '../data/achievements';
import { getUpgrade, type UpgradeId } from '../data/items';
import { BALANCE } from '../data/balance';
import { getOrb, type OrbId } from '../data/orbs';
import type { PostId } from '../data/posts';
import type { BossMechanicId } from '../data/bosses';
import { getSpecies, type SpeciesId } from '../data/species';
import type { ZoneId } from '../data/zones';
import type { Rng } from './rng';
import type { GameState } from './state';

/**
 * Reglas que componen varias partes del núcleo. Todo es puro:
 * `(estado, entrada, ahora, rng) → nuevo estado`.
 */

export interface ClickResult {
  readonly state: GameState;
  readonly coinsGained: number;
  readonly xpGained: number;
  readonly levelsGained: number;
}

/** Un clic sobre el objeto central de la zona activa: monedas + XP. */
export function applyClick(state: GameState, now: number): ClickResult {
  const coinsGained = coinsPerClick(state);
  const xpGained = xpPerClick(state);
  const { trainer, levelsGained } = grantTrainerXp(state.trainer, xpGained);

  return {
    state: {
      ...state,
      coins: add(state.coins, coinsGained),
      trainer,
      stats: {
        ...state.stats,
        totalClicks: state.stats.totalClicks + 1,
        totalCoinsEarned: add(state.stats.totalCoinsEarned, coinsGained),
      },
      lastSeenAt: now,
    },
    coinsGained,
    xpGained,
    levelsGained,
  };
}

export interface WildHitResult {
  readonly state: GameState;
  /** El golpe la dejó sin PV: cae y paga monedas en vez de capturarse. */
  readonly defeated: boolean;
  readonly coinsGained: number;
  readonly xpGained: number;
  readonly levelsGained: number;
  readonly speciesId: SpeciesId | null;
  /** Es rara o mejor: no se debilita a clics, pide combate con el equipo. */
  readonly needsBattle: boolean;
  /** Ya está sin PV (jefe recién vencido o rara ganada): toca el orbe. */
  readonly needsOrb: boolean;
}

/**
 * Un clic sobre la salvaje: le quita PV, lo que sube la probabilidad del orbe.
 * Si el golpe la deja a 0 la derrota, y entonces se pierde la criatura pero
 * paga `PV_max · M_clic · bonus_rareza` en monedas. Quien quiera capturarla
 * tiene que lanzar el orbe antes del último golpe.
 *
 * Las raras o mejores quedan fuera de esto: el GDD las reserva para el
 * combate con equipo, así que el clic no les hace nada y se devuelve
 * `needsBattle` para que la interfaz abra la pelea.
 */
export function hitWild(state: GameState, now: number, rng: Rng): WildHitResult {
  const { encounter } = state;
  if (encounter === null) {
    return {
      state,
      defeated: false,
      coinsGained: 0,
      xpGained: 0,
      levelsGained: 0,
      speciesId: null,
      needsBattle: false,
      needsOrb: false,
    };
  }

  if (requiresBattle(encounter)) {
    /*
     * Si ya está sin PV, la pelea está hecha: es el jefe que acaba de caer o
     * la rara que se ganó en combate, y lo que queda es el orbe. Clicarla no
     * tiene que volver a prometer un combate que el núcleo va a rechazar.
     */
    const won = encounter.hp <= 0;
    return {
      state,
      defeated: false,
      coinsGained: 0,
      xpGained: 0,
      levelsGained: 0,
      speciesId: encounter.speciesId,
      needsBattle: !won,
      needsOrb: won,
    };
  }

  const damaged = damageEncounter(state, clickDamage(state));
  const hit = damaged.encounter;
  if (hit === null) {
    return {
      state,
      defeated: false,
      coinsGained: 0,
      xpGained: 0,
      levelsGained: 0,
      speciesId: encounter.speciesId,
      needsBattle: false,
      needsOrb: false,
    };
  }

  // El último golpe solo cobra los PV que quedaban, no el daño entero.
  const dealt = encounter.hp - hit.hp;
  const xpGained = weakenXp(encounter, dealt) + (hit.hp === 0 ? defeatXp(encounter) : 0);
  const { trainer, levelsGained } = grantTrainerXp(damaged.trainer, xpGained);

  if (hit.hp > 0) {
    return {
      state: { ...damaged, trainer, lastSeenAt: now },
      defeated: false,
      coinsGained: 0,
      xpGained,
      levelsGained,
      speciesId: encounter.speciesId,
      needsBattle: false,
      needsOrb: false,
    };
  }

  const coinsGained = defeatReward(damaged, hit);
  const cleared = clearEncounter(damaged, now, rng);
  return {
    state: {
      ...cleared,
      trainer,
      coins: add(cleared.coins, coinsGained),
      stats: {
        ...cleared.stats,
        totalDefeats: cleared.stats.totalDefeats + 1,
        totalCoinsEarned: add(cleared.stats.totalCoinsEarned, coinsGained),
      },
      lastSeenAt: now,
    },
    defeated: true,
    coinsGained,
    xpGained,
    levelsGained,
    speciesId: encounter.speciesId,
    needsBattle: false,
    needsOrb: false,
  };
}

export type TravelFailure = 'locked' | 'in-battle';

export interface TravelResult {
  readonly state: GameState;
  readonly moved: boolean;
  readonly failure: TravelFailure | null;
}

/**
 * Cambia de zona. La salvaje que hubiera se queda atrás —vive en la zona
 * anterior— y la siguiente aparición se programa de nuevo, así que viajar no
 * sirve para reiniciar una espera larga a voluntad: la espera vuelve a empezar.
 * Con un combate en marcha no se puede viajar.
 */
export function travelToZone(
  state: GameState,
  zoneId: ZoneId,
  now: number,
  rng: Rng,
): TravelResult {
  if (state.battle !== null) return { state, moved: false, failure: 'in-battle' };
  if (!isZoneUnlocked(state, zoneId)) return { state, moved: false, failure: 'locked' };
  if (state.activeZoneId === zoneId) return { state, moved: false, failure: null };

  const moved = clearEncounter({ ...state, activeZoneId: zoneId }, now, rng);
  return { state: { ...moved, lastSeenAt: now }, moved: true, failure: null };
}

/** Por qué no se pudo comprar algo; la interfaz lo traduce. */
export type PurchaseFailure = 'locked' | 'too-poor' | 'invalid-amount' | 'maxed';

export interface PurchaseResult {
  readonly state: GameState;
  readonly bought: boolean;
  readonly spent: number;
  readonly quantity: number;
  readonly failure: PurchaseFailure | null;
}

function refusePurchase(state: GameState, failure: PurchaseFailure): PurchaseResult {
  return { state, bought: false, spent: 0, quantity: 0, failure };
}

/**
 * Compra `amount` unidades de una mejora. Es todo o nada: si no llega el
 * dinero para el lote entero no se compra ninguna.
 */
export function buyUpgrade(
  state: GameState,
  upgradeId: UpgradeId,
  amount: number,
  now: number,
): PurchaseResult {
  if (!Number.isInteger(amount) || amount < 1) return refusePurchase(state, 'invalid-amount');

  const upgrade = getUpgrade(upgradeId);
  if (!isUpgradeUnlocked(state, upgrade)) return refusePurchase(state, 'locked');
  // Cada mejora se compra un número limitado de veces.
  if (amount > upgradeRemaining(state, upgradeId)) return refusePurchase(state, 'maxed');

  const owned = ownedCount(state.upgrades, upgradeId);
  const price = upgradeBundlePrice(upgrade, owned, amount);
  if (!gte(state.coins, price)) return refusePurchase(state, 'too-poor');

  return {
    state: {
      ...state,
      coins: sub(state.coins, price),
      upgrades: { ...state.upgrades, [upgradeId]: owned + amount },
      lastSeenAt: now,
    },
    bought: true,
    spent: price,
    quantity: amount,
    failure: null,
  };
}

/** Precio de un orbe, ya con el descuento que aplique el Taller. */
export function orbPrice(state: GameState, orbId: OrbId): number {
  return Math.round(getOrb(orbId).price * (1 - ranchProduction(state).orbDiscount));
}

/** Compra orbes. A diferencia de las mejoras, su precio es fijo por unidad. */
export function buyOrbs(
  state: GameState,
  orbId: OrbId,
  amount: number,
  now: number,
): PurchaseResult {
  if (!Number.isInteger(amount) || amount < 1) return refusePurchase(state, 'invalid-amount');

  const orb = getOrb(orbId);
  if (state.trainer.level < orb.unlockLevel) return refusePurchase(state, 'locked');

  const price = orbPrice(state, orbId) * amount;
  if (!gte(state.coins, price)) return refusePurchase(state, 'too-poor');

  return {
    state: {
      ...state,
      coins: sub(state.coins, price),
      orbs: { ...state.orbs, [orbId]: orbCount(state, orbId) + amount },
      lastSeenAt: now,
    },
    bought: true,
    spent: price,
    quantity: amount,
    failure: null,
  };
}

/** Compra una plaza más de Rancho: 500 · 2^k monedas (GDD). */
export function buyRanchSlot(state: GameState, now: number): PurchaseResult {
  if (ranchSlots(state) >= BALANCE.ranch.maxSlots) return refusePurchase(state, 'locked');

  const price = ranchSlotPrice(state);
  if (!gte(state.coins, price)) return refusePurchase(state, 'too-poor');

  return {
    state: {
      ...state,
      coins: sub(state.coins, price),
      extraRanchSlots: state.extraRanchSlots + 1,
      lastSeenAt: now,
    },
    bought: true,
    spent: price,
    quantity: 1,
    failure: null,
  };
}

/** Sube un puesto de nivel: +25 % a lo que produce, hasta tres veces (GDD). */
export function buyPostUpgrade(state: GameState, postId: PostId, now: number): PurchaseResult {
  if (!isPostUnlocked(state, postId)) return refusePurchase(state, 'locked');
  if (postUpgradeLevel(state, postId) >= BALANCE.ranch.maxPostUpgrades) {
    return refusePurchase(state, 'locked');
  }

  const price = postUpgradePrice(state, postId);
  if (!gte(state.coins, price)) return refusePurchase(state, 'too-poor');

  return {
    state: {
      ...state,
      coins: sub(state.coins, price),
      postUpgrades: {
        ...state.postUpgrades,
        [postId]: postUpgradeLevel(state, postId) + 1,
      },
      lastSeenAt: now,
    },
    bought: true,
    spent: price,
    quantity: 1,
    failure: null,
  };
}

/** Compra bayas para el comedero. */
export function buyBerries(state: GameState, amount: number, now: number): PurchaseResult {
  if (!Number.isInteger(amount) || amount < 1) return refusePurchase(state, 'invalid-amount');
  if (state.trainer.level < BALANCE.berries.unlockLevel) return refusePurchase(state, 'locked');

  const price = BALANCE.berries.price * amount;
  if (!gte(state.coins, price)) return refusePurchase(state, 'too-poor');

  return {
    state: {
      ...state,
      coins: sub(state.coins, price),
      berries: state.berries + amount,
      lastSeenAt: now,
    },
    bought: true,
    spent: price,
    quantity: amount,
    failure: null,
  };
}

export interface OrbThrowOutcome extends ThrowResult {
  readonly levelsGained: number;
}

/** Lanza un orbe y, si captura, reparte la XP de entrenador de la rareza. */
export function useOrb(state: GameState, orbId: OrbId, now: number, rng: Rng): OrbThrowOutcome {
  const result = throwOrb(state, orbId, now, rng);
  if (result.failure !== null) return { ...result, levelsGained: 0 };

  const thrown: GameState = {
    ...result.state,
    stats: {
      ...result.state.stats,
      totalOrbsThrown: result.state.stats.totalOrbsThrown + 1,
      totalCaptures: result.state.stats.totalCaptures + (result.captured ? 1 : 0),
    },
    lastSeenAt: now,
  };

  if (!result.captured) return { ...result, state: thrown, levelsGained: 0 };

  const { trainer, levelsGained } = grantTrainerXp(thrown.trainer, result.xpGained);
  return { ...result, state: { ...thrown, trainer }, levelsGained };
}

export interface TickResult {
  readonly state: GameState;
  /** Desenlace del combate, si terminó en este tick. */
  readonly battleOutcome: BattleOutcome | null;
  readonly battleReward: BattleReward | null;
  /** Una salvaje acaba de aparecer en este tick. */
  readonly spawned: boolean;
  /** La salvaje se cansó de esperar y huyó. */
  readonly fled: boolean;
  /** Quién huyó, para poder anunciarlo. */
  readonly fledSpeciesId: SpeciesId | null;
  /** Lo que produjo el Rancho en este tick. */
  readonly gains: RanchGains;
  /** Zonas que se han abierto en este tick, para poder anunciarlas. */
  readonly unlockedZoneIds: readonly ZoneId[];
  /** Zona cuyo jefe ha caído en este tick. */
  readonly bossDefeatedZoneId: ZoneId | null;
  /** Mecánicas de jefe que han saltado en este tick. */
  readonly bossMechanics: readonly BossMechanicId[];
  /** Logros conseguidos en este tick, para poder celebrarlos. */
  readonly unlockedAchievementIds: readonly AchievementId[];
}

/**
 * Un tick lógico (100 ms): adelanta el reloj, hace huir a la salvaje que
 * agotó su tiempo y hace aparecer la siguiente cuando toca. La producción
 * pasiva del Rancho entra en la fase 4.
 */
export interface BattleReward {
  readonly coins: number;
  readonly xp: number;
  readonly levelsGained: number;
}

/**
 * Botín de ganar un combate: monedas por los PV del rival y XP de su rareza.
 * Un jefe paga el doble, que para algo tiene diez veces los PV.
 */
function rewardFor(
  state: GameState,
  speciesId: SpeciesId,
  maxHp: number,
  isBoss: boolean,
): BattleReward {
  const bonus = isBoss ? BALANCE.combat.boss.rewardMultiplier : 1;
  const coins = Math.round(maxHp * BALANCE.combat.victoryCoinsPerHp * coinsPerClick(state) * bonus);
  const xp = Math.round(
    captureXpOf(getSpecies(speciesId).rarity) * BALANCE.combat.victoryXpShare * bonus,
  );
  return { coins, xp, levelsGained: 0 };
}

export function tick(state: GameState, now: number, rng: Rng): TickResult {
  let next = state;
  let fled = false;
  let battleOutcome: BattleOutcome | null = null;
  let battleReward: BattleReward | null = null;
  let fledSpeciesId: SpeciesId | null = null;
  let spawned = false;
  let bossDefeatedZoneId: ZoneId | null = null;
  let bossMechanics: readonly BossMechanicId[] = [];

  /*
   * El Rancho produce por el tiempo transcurrido desde el último paso. Un
   * hueco largo (pestaña en segundo plano, portátil dormido) se paga con las
   * reglas del progreso offline, no al 100 %: si no, bastaría con minimizar.
   */
  const elapsed = Math.max(0, now - state.lastSeenAt);
  const wasAway = elapsed >= BALANCE.ranch.offline.minMs;
  const step = advanceRanch(
    next,
    wasAway ? Math.min(elapsed, BALANCE.ranch.offline.maxMs) : elapsed,
    coinsPerClick(next),
    wasAway ? BALANCE.ranch.offline.factor : 1,
  );
  next = step.state;

  // El combate corre antes que las apariciones: manda sobre la salvaje.
  if (next.battle !== null) {
    const step = advanceBattle(next, now, rng);
    next = step.state;
    battleOutcome = step.outcome;
    bossDefeatedZoneId = step.bossZoneId;
    bossMechanics = step.mechanics;

    /*
     * El botín sale de quién era el rival en el combate, no del encuentro que
     * haya en la zona: un jefe no ocupa el hueco de la salvaje mientras se
     * pelea con él.
     */
    if (step.outcome === 'won' && step.enemySpeciesId !== null) {
      const reward = rewardFor(
        next,
        step.enemySpeciesId,
        step.enemyMaxHp,
        step.bossZoneId !== null,
      );
      const granted = grantTrainerXp(next.trainer, reward.xp);
      battleReward = { ...reward, levelsGained: granted.levelsGained };
      next = {
        ...next,
        coins: add(next.coins, reward.coins),
        trainer: granted.trainer,
        stats: {
          ...next.stats,
          totalCoinsEarned: add(next.stats.totalCoinsEarned, reward.coins),
        },
      };
    }
  }

  if (hasEncounterExpired(next, now)) {
    fledSpeciesId = next.encounter?.speciesId ?? null;
    next = clearEncounter(next, now, rng);
    fled = true;
  }
  if (isSpawnDue(next, now)) {
    next = spawnEncounter(next, now, rng);
    spawned = next.encounter !== null;
  }
  /*
   * Las zonas se revisan al final del tick: el nivel puede haber subido con
   * la XP del combate o de la salvaje de este mismo paso.
   */
  next = refreshZoneUnlocks(next);
  const unlockedZoneIds = next.unlockedZoneIds.filter(
    (zoneId) => !state.unlockedZoneIds.includes(zoneId),
  );

  /*
   * Los logros se revisan al final, con el estado del tick ya cerrado: así
   * valen igual los clics, las capturas, el nivel y lo que haya producido el
   * Rancho sin que cada acción tenga que acordarse de comprobarlos.
   */
  const achievements = refreshAchievements(next);
  next = achievements.state;

  if (now > next.lastSeenAt) next = { ...next, lastSeenAt: now };

  return {
    state: next,
    spawned,
    fled,
    fledSpeciesId,
    gains: step.gains,
    battleOutcome,
    battleReward,
    unlockedZoneIds,
    bossDefeatedZoneId,
    bossMechanics,
    unlockedAchievementIds: achievements.unlocked,
  };
}
