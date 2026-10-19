import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import {
  add,
  clickBonuses,
  clickXpBonus,
  coinsPerClick,
  format,
  gte,
  isUpgradeMaxed,
  mul,
  sub,
  upgradeRemaining,
  xpPerClick,
} from '../src/core/economy';
import { UPGRADE_LIST, getUpgrade } from '../src/data/items';
import { createInitialState } from '../src/core/state';

const state = createInitialState(0, 1);

describe('helpers de economía', () => {
  it('suma, resta, multiplica y compara', () => {
    expect(add(2, 3)).toBe(5);
    expect(sub(5, 2)).toBe(3);
    expect(mul(4, 2.5)).toBe(10);
    expect(gte(3, 3)).toBe(true);
    expect(gte(2, 3)).toBe(false);
  });
});

describe('format', () => {
  it('muestra números pequeños sin sufijo', () => {
    expect(format(0)).toBe('0');
    expect(format(7)).toBe('7');
    expect(format(999)).toBe('999');
  });

  it('usa coma decimal en los primeros dígitos', () => {
    expect(format(1.5)).toBe('1,5');
  });

  it('abrevia miles y millones como en el GDD', () => {
    expect(format(1200)).toBe('1,2 K');
    expect(format(3_400_000)).toBe('3,4 M');
    expect(format(2_500_000_000)).toBe('2,5 B');
  });

  it('trunca en vez de redondear hacia arriba', () => {
    expect(format(1999)).toBe('1,9 K');
  });

  it('mantiene el signo y tolera infinito', () => {
    expect(format(-1500)).toBe('-1,5 K');
    expect(format(Number.POSITIVE_INFINITY)).toBe('∞');
  });
});

describe('monedas por clic', () => {
  it('en la fase 1 vale el valor base', () => {
    expect(coinsPerClick(state)).toBe(BALANCE.click.baseCoins);
    expect(xpPerClick(state)).toBe(BALANCE.click.baseXp);
  });

  it('cada guante comprado sube la XP del clic', () => {
    const uno = { ...state, upgrades: { 'gloves-1': 1 } };
    expect(clickXpBonus(uno)).toBeCloseTo(getUpgrade('gloves-1').xpBonus);
    expect(xpPerClick(uno)).toBeCloseTo(
      BALANCE.click.baseXp * (1 + getUpgrade('gloves-1').xpBonus),
    );

    // Las unidades suman, y los distintos guantes se acumulan entre sí.
    const varios = { ...state, upgrades: { 'gloves-1': 3, 'gloves-2': 2 } };
    expect(clickXpBonus(varios)).toBeCloseTo(
      getUpgrade('gloves-1').xpBonus * 3 + getUpgrade('gloves-2').xpBonus * 2,
    );
  });

  it('con los cinco guantes al tope el clic da varias veces la XP base', () => {
    const upgrades = Object.fromEntries(
      UPGRADE_LIST.map((upgrade) => [upgrade.id, BALANCE.shop.maxUpgradeOwned]),
    );
    const lleno = { ...state, upgrades };
    // Ajuste de la fase 7: los guantes aceleran el nivel sin dispararlo.
    expect(xpPerClick(lleno) / BALANCE.click.baseXp).toBeGreaterThan(5);
  });

  // Los primeros guantes son lo único que acelera el nivel antes de la
  // Guardería, así que su efecto tiene que notarse ya en la barra.
  it('los diez primeros guantes al menos duplican la XP del clic', () => {
    const lleno = { ...state, upgrades: { 'gloves-1': BALANCE.shop.maxUpgradeOwned } };
    expect(xpPerClick(lleno) / BALANCE.click.baseXp).toBeGreaterThanOrEqual(2);
  });

  it('las unidades por encima del tope no cuentan para la XP', () => {
    const tope = { ...state, upgrades: { 'gloves-1': BALANCE.shop.maxUpgradeOwned } };
    const pasado = { ...state, upgrades: { 'gloves-1': BALANCE.shop.maxUpgradeOwned + 25 } };
    expect(xpPerClick(pasado)).toBe(xpPerClick(tope));
  });

  it('el tope deja ver cuántas unidades quedan de cada mejora', () => {
    expect(upgradeRemaining(state, 'gloves-1')).toBe(BALANCE.shop.maxUpgradeOwned);
    expect(isUpgradeMaxed(state, 'gloves-1')).toBe(false);

    const lleno = { ...state, upgrades: { 'gloves-1': BALANCE.shop.maxUpgradeOwned } };
    expect(upgradeRemaining(lleno, 'gloves-1')).toBe(0);
    expect(isUpgradeMaxed(lleno, 'gloves-1')).toBe(true);
  });

  it('los bonus arrancan neutros', () => {
    expect(clickBonuses(state)).toEqual({ flat: 0, mult: 1, mining: 0, global: 0 });
  });

  it('aplica la fórmula (1 + plano) · mult · (1 + minería) · (1 + global)', () => {
    const { flat, mult, mining, global } = clickBonuses(state);
    const expected = BALANCE.click.baseCoins * (1 + flat) * mult * (1 + mining) * (1 + global);
    expect(coinsPerClick(state)).toBe(expected);
  });
});
