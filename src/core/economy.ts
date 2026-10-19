import { BALANCE } from '../data/balance';
import { UPGRADE_LIST, type UpgradeDefinition, type UpgradeId } from '../data/items';
import { achievementGlobalBonus } from './achievements';
import { ranchProduction } from './ranch';
import type { GameState, UpgradeCounts } from './state';

/**
 * Aritmética de monedas envuelta en helpers: cuando el MVP necesite números
 * grandes bastará con cambiar estas cuatro funciones por `break_infinity.js`.
 */
export function add(a: number, b: number): number {
  return a + b;
}

export function sub(a: number, b: number): number {
  return a - b;
}

export function mul(a: number, b: number): number {
  return a * b;
}

export function gte(a: number, b: number): boolean {
  return a >= b;
}

const UNITS = ['', ' K', ' M', ' B', ' T', ' aa', ' ab'] as const;

/** Formatea monedas al estilo del GDD: 1,2 K · 3,4 M. Coma decimal (es-ES). */
export function format(value: number): string {
  if (!Number.isFinite(value)) return '∞';
  const sign = value < 0 ? '-' : '';
  let amount = Math.abs(value);
  if (amount < 1000) {
    const rounded = Math.floor(amount * 10) / 10;
    const decimals = amount < 10 && !Number.isInteger(rounded) ? 1 : 0;
    return (
      sign +
      (decimals === 1 ? rounded : Math.floor(amount)).toLocaleString('es-ES', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    );
  }
  let unit = 0;
  while (amount >= 1000 && unit < UNITS.length - 1) {
    amount /= 1000;
    unit += 1;
  }
  const truncated = Math.floor(amount * 10) / 10;
  return `${sign}${truncated.toLocaleString('es-ES', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}${UNITS[unit] ?? ''}`;
}

/**
 * Fuentes de bonus del clic (GDD):
 * `M_clic = (1 + plano) · mult · (1 + minería) · (1 + global)`.
 * El plano sale de los guantes, la minería del Rancho y el global de los
 * logros, que por eso suben también lo que produce el Rancho: sus monedas se
 * calculan con las monedas por clic.
 */
export interface ClickBonuses {
  readonly flat: number;
  readonly mult: number;
  readonly mining: number;
  readonly global: number;
}

export const NEUTRAL_CLICK_BONUSES: ClickBonuses = { flat: 0, mult: 1, mining: 0, global: 0 };

export function ownedCount(upgrades: UpgradeCounts, id: UpgradeId): number {
  return upgrades[id] ?? 0;
}

/** Veces que se puede comprar una misma mejora. */
export function maxUpgradeOwned(): number {
  return BALANCE.shop.maxUpgradeOwned;
}

/** Cuántas unidades quedan por comprar de una mejora; nunca menos de cero. */
export function upgradeRemaining(state: GameState, id: UpgradeId): number {
  return Math.max(0, maxUpgradeOwned() - ownedCount(state.upgrades, id));
}

export function isUpgradeMaxed(state: GameState, id: UpgradeId): boolean {
  return upgradeRemaining(state, id) === 0;
}

export function clickBonuses(state: GameState): ClickBonuses {
  let flat = 0;
  for (const upgrade of UPGRADE_LIST) {
    flat += upgrade.flatBonus * ownedCount(state.upgrades, upgrade.id);
  }
  return {
    ...NEUTRAL_CLICK_BONUSES,
    flat,
    mining: ranchProduction(state).miningBonus,
    global: achievementGlobalBonus(state),
  };
}

/** Precio de la siguiente unidad: base · 1,15^cantidad (GDD). */
export function upgradePrice(upgrade: UpgradeDefinition, owned: number): number {
  return Math.round(upgrade.basePrice * Math.pow(BALANCE.shop.priceGrowth, owned));
}

/** Precio de comprar `amount` unidades seguidas, cada una más cara que la anterior. */
export function upgradeBundlePrice(
  upgrade: UpgradeDefinition,
  owned: number,
  amount: number,
): number {
  let total = 0;
  for (let i = 0; i < amount; i += 1) {
    total = add(total, upgradePrice(upgrade, owned + i));
  }
  return total;
}

export function coinsPerClick(state: GameState): number {
  const bonuses = clickBonuses(state);
  return mul(
    BALANCE.click.baseCoins,
    (1 + bonuses.flat) * bonuses.mult * (1 + bonuses.mining) * (1 + bonuses.global),
  );
}

/**
 * Cuánto multiplican los guantes la XP del clic: la suma de lo que aporta
 * cada unidad comprada. Las unidades por encima del tope no cuentan, así que
 * una partida vieja con más de la cuenta no se dispara.
 */
export function clickXpBonus(state: GameState): number {
  let bonus = 0;
  for (const upgrade of UPGRADE_LIST) {
    const owned = Math.min(ownedCount(state.upgrades, upgrade.id), maxUpgradeOwned());
    bonus += upgrade.xpBonus * owned;
  }
  return bonus;
}

/** XP de entrenador por clic: la base, aumentada por los guantes. */
export function xpPerClick(state: GameState): number {
  return mul(BALANCE.click.baseXp, 1 + clickXpBonus(state));
}

/** Daño que hace un clic a una salvaje (GDD · valores de arranque: 1). */
export function clickDamage(_state: GameState): number {
  return BALANCE.click.baseDamage;
}
