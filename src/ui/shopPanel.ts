import { orbCount } from '../core/capture';
import { format, isUpgradeMaxed, maxUpgradeOwned, ownedCount, upgradePrice } from '../core/economy';
import { orbPrice } from '../core/engine';
import { availableUpgrades } from '../core/progression';
import {
  creaturesInRanch,
  isPostUnlocked,
  postUpgradeLevel,
  postUpgradePrice,
  ranchSlotPrice,
  ranchSlots,
} from '../core/ranch';
import { BALANCE } from '../data/balance';
import { POST_LIST } from '../data/posts';
import type { GameState } from '../core/state';
import { ORB_LIST, type OrbDefinition } from '../data/orbs';
import { TYPE_NAMES } from '../i18n/names';
import {
  SHOP_CATEGORIES,
  UPGRADE_LIST,
  type ShopCategory,
  type UpgradeDefinition,
} from '../data/items';
import { ES } from '../i18n/es';
import { itemSpriteId, registerItemSprites, type ItemSpriteId } from '../render/itemSprites';

/** Guantes en el orden en que se compran, para emparejarlos con la lista. */
const GLOVE_SPRITES: readonly ItemSpriteId[] = ['glove1', 'glove2', 'glove3', 'glove4', 'glove5'];
import { orbSpriteId, registerOrbSprites } from '../render/orbSprites';
import { spriteCanvas } from './spriteCanvas';
import type { Game } from '../systems/game';
import { element, setText } from './dom';

/**
 * Tienda con pestañas. Solo la de mejoras tiene contenido en la fase 2; las
 * demás anuncian su fase para que el layout del GDD quede en pie.
 *
 * Repintado selectivo: las filas se construyen una vez y en cada cambio de
 * estado solo se reescriben precio, cantidad y el estado del botón. La lista
 * se reconstruye únicamente cuando el nivel desbloquea una mejora nueva.
 */
interface UpgradeRow {
  readonly root: HTMLElement;
  readonly price: HTMLElement;
  readonly owned: HTMLElement;
  readonly button: HTMLButtonElement;
  /** Sustituye al botón cuando la mejora llega a su tope de compras. */
  readonly maxNote: HTMLElement;
}

/**
 * Armazón de un artículo: cuadrado de color a la izquierda y el texto a la
 * derecha, como en la dirección visual. El `tint` es la variable CSS del
 * color que le toca.
 */
function shopRow(tint: string, icon?: HTMLElement): { root: HTMLElement; body: HTMLElement } {
  const root = element('article', { className: 'shop-item' });
  const iconBox = element('span', { className: 'shop-item-icon' });
  iconBox.style.background = `var(${tint})`;
  if (icon !== undefined) iconBox.append(icon);

  const body = element('div', { className: 'shop-item-body' });
  root.append(iconBox, body);
  return { root, body };
}

export function mountShopPanel(host: HTMLElement, game: Game): void {
  const title = element('div', { className: 'column-title' });
  title.append(element('h2', { text: ES.shop.title, attrs: { id: 'shop-title' } }));

  const tabs = element('div', { className: 'tabs', attrs: { role: 'tablist' } });
  const body = element('div', {
    className: 'shop-body',
    attrs: { id: 'shop-body', role: 'tabpanel', 'aria-label': ES.shop.title },
  });
  const lockedNote = element('p', { className: 'column-hint' });

  host.replaceChildren(title, tabs, body, lockedNote);

  let activeCategory: ShopCategory = 'click';
  const tabButtons = new Map<ShopCategory, HTMLButtonElement>();

  for (const category of SHOP_CATEGORIES) {
    const button = element('button', {
      className: 'tab',
      text: ES.shop.tabs[category],
      attrs: { type: 'button', role: 'tab', 'aria-controls': 'shop-body' },
    });
    button.addEventListener('click', () => {
      activeCategory = category;
      renderTabs();
      renderBody(game.getState());
    });
    tabButtons.set(category, button);
    tabs.append(button);
  }

  const renderTabs = (): void => {
    for (const [category, button] of tabButtons) {
      const selected = category === activeCategory;
      button.classList.toggle('tab--active', selected);
      button.setAttribute('aria-selected', String(selected));
      // Patrón ARIA de pestañas: solo la activa entra en el tabulador.
      button.tabIndex = selected ? 0 : -1;
    }
  };

  // --- filas de mejoras ----------------------------------------------------

  const rows = new Map<string, UpgradeRow>();
  const list = element('div', { className: 'shop-list' });

  /**
   * Los cinco guantes comparten silueta y cambian de material, así que el
   * icono sale del orden de la lista: el primero es el de tela y el último
   * el de oro.
   */
  const upgradeSprite = (upgrade: UpgradeDefinition): ItemSpriteId => {
    const step = Math.min(GLOVE_SPRITES.length, Math.max(1, UPGRADE_LIST.indexOf(upgrade) + 1));
    return GLOVE_SPRITES[step - 1] ?? 'glove1';
  };

  const createRow = (upgrade: UpgradeDefinition): UpgradeRow => {
    const { root, body } = shopRow(
      '--color-surface-3',
      spriteCanvas(itemSpriteId(upgradeSprite(upgrade)), 2),
    );
    const head = element('div', { className: 'shop-item-head' });
    const owned = element('span', { className: 'shop-item-owned' });
    head.append(element('h3', { className: 'shop-item-name', text: upgrade.name }), owned);

    const price = element('span', { className: 'shop-item-price' });
    const button = element('button', {
      className: 'shop-buy',
      attrs: { type: 'button' },
    });
    button.append(element('span', { text: ES.shop.buy }), price);
    button.addEventListener('click', () => {
      game.buy(upgrade.id);
    });

    body.append(
      head,
      element('p', { className: 'shop-item-desc', text: upgrade.description }),
      element('p', {
        className: 'shop-item-effect',
        text: ES.shop.effect(format(upgrade.flatBonus), format(upgrade.xpBonus * 100)),
      }),
      button,
    );

    const maxNote = element('p', { className: 'shop-item-max', text: ES.shop.upgradeMax });
    maxNote.hidden = true;
    body.append(maxNote);

    return { root, price, owned, button, maxNote };
  };

  const renderRow = (upgrade: UpgradeDefinition, state: GameState): void => {
    const row = rows.get(upgrade.id);
    if (row === undefined) return;
    const owned = ownedCount(state.upgrades, upgrade.id);
    const price = upgradePrice(upgrade, owned);
    const maxed = isUpgradeMaxed(state, upgrade.id);
    const affordable = !maxed && state.coins >= price;

    setText(row.owned, ES.shop.owned(owned, maxUpgradeOwned()));
    setText(row.price, format(price));
    row.button.disabled = !affordable;
    row.button.hidden = maxed;
    row.maxNote.hidden = !maxed;
    row.button.title = affordable ? '' : ES.shop.tooPoor;
    row.button.setAttribute('aria-label', ES.shop.buyLabel(upgrade.name, format(price)));
    row.root.classList.toggle('shop-item--affordable', affordable);
    row.root.classList.toggle('shop-item--maxed', maxed);
  };

  /** Reconstruye la lista solo si cambió el conjunto de mejoras desbloqueadas. */
  let renderedIds = '';

  const renderUpgrades = (state: GameState): void => {
    const unlocked = availableUpgrades(state);
    const signature = unlocked.map((upgrade) => upgrade.id).join(',');

    if (signature !== renderedIds) {
      renderedIds = signature;
      rows.clear();
      list.replaceChildren();
      for (const upgrade of unlocked) {
        const row = createRow(upgrade);
        rows.set(upgrade.id, row);
        list.append(row.root);
      }
    }
    for (const upgrade of unlocked) renderRow(upgrade, state);

    const nextLocked = UPGRADE_LIST.find((upgrade) => upgrade.unlockLevel > state.trainer.level);
    setText(
      lockedNote,
      nextLocked === undefined ? '' : ES.shop.nextLocked(nextLocked.name, nextLocked.unlockLevel),
    );
  };

  // --- orbes de captura -----------------------------------------------------

  interface OrbRow {
    readonly root: HTMLElement;
    readonly held: HTMLElement;
    readonly single: HTMLButtonElement;
    readonly pack: HTMLButtonElement;
    readonly singlePrice: HTMLElement;
    readonly packPrice: HTMLElement;
  }

  registerOrbSprites();
  registerItemSprites();
  const orbRows = new Map<string, OrbRow>();
  const orbList = element('div', { className: 'shop-list' });

  const createOrbRow = (orb: OrbDefinition): OrbRow => {
    const { root, body } = shopRow('--color-accent-soft', spriteCanvas(orbSpriteId(orb.id), 2));
    const head = element('div', { className: 'shop-item-head' });
    const held = element('span', { className: 'shop-item-owned' });
    head.append(element('h3', { className: 'shop-item-name', text: orb.name }), held);

    const effect =
      orb.againstType === null
        ? ES.shop.orbMultiplier(format(orb.multiplier))
        : `${ES.shop.orbMultiplier(format(orb.multiplier))} · ${ES.shop.orbAgainst(
            TYPE_NAMES[orb.againstType.type],
            format(orb.againstType.multiplier),
          )}`;

    const buttons = element('div', { className: 'shop-buy-row' });
    const single = element('button', { className: 'shop-buy', attrs: { type: 'button' } });
    const singlePrice = element('span', { className: 'shop-item-price' });
    single.append(element('span', { text: ES.shop.buy }), singlePrice);
    single.addEventListener('click', () => {
      game.buyOrbs(orb.id, 1);
    });

    const pack = element('button', { className: 'shop-buy', attrs: { type: 'button' } });
    const packPrice = element('span', { className: 'shop-item-price' });
    pack.append(element('span', { text: ES.shop.buyPack }), packPrice);
    pack.addEventListener('click', () => {
      game.buyOrbs(orb.id, 10);
    });
    buttons.append(single, pack);

    body.append(
      head,
      element('p', { className: 'shop-item-desc', text: orb.description }),
      element('p', { className: 'shop-item-effect', text: effect }),
      buttons,
    );
    return { root, held, single, pack, singlePrice, packPrice };
  };

  let renderedOrbIds = '';

  const renderOrbs = (state: GameState): void => {
    const unlocked = ORB_LIST.filter((orb) => state.trainer.level >= orb.unlockLevel);
    const signature = unlocked.map((orb) => orb.id).join(',');
    if (signature !== renderedOrbIds) {
      renderedOrbIds = signature;
      orbRows.clear();
      orbList.replaceChildren();
      for (const orb of unlocked) {
        const row = createOrbRow(orb);
        orbRows.set(orb.id, row);
        orbList.append(row.root);
      }
    }
    for (const orb of unlocked) {
      const row = orbRows.get(orb.id);
      if (row === undefined) continue;
      // El Taller abarata los orbes, así que el precio se recalcula.
      const price = orbPrice(state, orb.id);
      setText(row.held, ES.shop.orbHeld(orbCount(state, orb.id)));
      setText(row.singlePrice, format(price));
      setText(row.packPrice, format(price * 10));
      row.single.disabled = state.coins < price;
      row.pack.disabled = state.coins < price * 10;
      row.root.classList.toggle('shop-item--affordable', state.coins >= price);
    }

    const nextOrb = ORB_LIST.find((orb) => orb.unlockLevel > state.trainer.level);
    setText(
      lockedNote,
      nextOrb === undefined ? '' : ES.shop.nextLocked(nextOrb.name, nextOrb.unlockLevel),
    );
  };

  // --- Rancho: plazas y mejoras de puesto ------------------------------------

  /**
   * Botón de compra con su precio.
   *
   * Importante: estas listas NO se pueden reconstruir en cada `state:changed`
   * —el Rancho emite uno por tick— porque el nodo desaparecería entre
   * `pointerdown` y `pointerup` y el clic no llegaría a dispararse. Se montan
   * una vez y después solo se refrescan precio y disponibilidad.
   */
  interface PriceButton {
    readonly button: HTMLButtonElement;
    readonly price: HTMLElement;
    readonly priceOf: (state: GameState) => number;
  }

  const buyButton = (
    label: string,
    priceOf: (state: GameState) => number,
    onBuy: () => void,
  ): PriceButton => {
    const button = element('button', { className: 'shop-buy', attrs: { type: 'button' } });
    const price = element('span', { className: 'shop-item-price' });
    button.append(element('span', { text: label }), price);
    button.addEventListener('click', onBuy);
    return { button, price, priceOf };
  };

  const refreshPrices = (entries: readonly PriceButton[], state: GameState): void => {
    for (const entry of entries) {
      const value = entry.priceOf(state);
      setText(entry.price, format(value));
      entry.button.disabled = state.coins < value;
    }
  };

  const ranchList = element('div', { className: 'shop-list' });
  let ranchButtons: PriceButton[] = [];
  let ranchSlotCount: HTMLElement | null = null;
  let renderedRanch = '';

  const buildRanch = (state: GameState): void => {
    ranchButtons = [];
    const rows: HTMLElement[] = [];

    const slot = shopRow('--color-surface-3', spriteCanvas(itemSpriteId('plot'), 2));
    const slotHead = element('div', { className: 'shop-item-head' });
    ranchSlotCount = element('span', { className: 'shop-item-owned' });
    slotHead.append(
      element('h3', { className: 'shop-item-name', text: ES.shop.slot }),
      ranchSlotCount,
    );
    slot.body.append(
      slotHead,
      element('p', { className: 'shop-item-desc', text: ES.shop.slotDescription }),
    );

    if (ranchSlots(state) >= BALANCE.ranch.maxSlots) {
      slot.body.append(element('p', { className: 'shop-item-effect', text: ES.shop.slotMax }));
    } else {
      const entry = buyButton(ES.shop.buy, ranchSlotPrice, () => {
        game.buyRanchSlot();
      });
      slot.body.append(entry.button);
      ranchButtons.push(entry);
    }
    rows.push(slot.root);

    for (const post of POST_LIST) {
      if (!isPostUnlocked(state, post.id)) continue;
      const level = postUpgradeLevel(state, post.id);

      const { root, body } = shopRow('--color-surface-3', spriteCanvas(itemSpriteId('upgrade'), 2));
      const head = element('div', { className: 'shop-item-head' });
      head.append(
        element('h3', { className: 'shop-item-name', text: ES.shop.postUpgrade(post.name) }),
        element('span', {
          className: 'shop-item-owned',
          text: ES.shop.postUpgradeLevel(level, BALANCE.ranch.maxPostUpgrades),
        }),
      );
      body.append(
        head,
        element('p', { className: 'shop-item-desc', text: post.output }),
        element('p', {
          className: 'shop-item-effect',
          text: ES.shop.postUpgradeEffect(format(BALANCE.ranch.postUpgradeBonus * 100)),
        }),
      );

      if (level >= BALANCE.ranch.maxPostUpgrades) {
        body.append(element('p', { className: 'column-hint', text: ES.shop.postUpgradeMax }));
      } else {
        const entry = buyButton(
          ES.shop.buy,
          (current) => postUpgradePrice(current, post.id),
          () => {
            game.buyPostUpgrade(post.id);
          },
        );
        body.append(entry.button);
        ranchButtons.push(entry);
      }
      rows.push(root);
    }

    ranchList.replaceChildren(...rows);
  };

  const renderRanch = (state: GameState): void => {
    // La lista solo cambia de forma al abrir un puesto, subirlo o llenar plazas.
    const signature = [
      ranchSlots(state),
      POST_LIST.filter((post) => isPostUnlocked(state, post.id))
        .map((post) => `${post.id}:${postUpgradeLevel(state, post.id)}`)
        .join(','),
    ].join('|');
    if (signature !== renderedRanch) {
      renderedRanch = signature;
      buildRanch(state);
    }

    if (ranchSlotCount !== null) {
      setText(ranchSlotCount, ES.shop.slotCount(creaturesInRanch(state).length, ranchSlots(state)));
    }
    refreshPrices(ranchButtons, state);
    setText(lockedNote, '');
  };

  // --- Consumibles: bayas ------------------------------------------------------

  const consumableList = element('div', { className: 'shop-list' });
  let consumableButtons: PriceButton[] = [];
  let berriesHeld: HTMLElement | null = null;
  let renderedConsumables = '';

  /**
   * Consumible que todavía no se puede comprar: se enseña con su icono y su
   * efecto, en gris y con la pastilla «Pronto», para que la pestaña muestre lo
   * que viene sin fingir que ya está. El contenido real llega en la fase 7.
   */
  const comingSoonRow = (
    sprite: ItemSpriteId,
    name: string,
    description: string,
    effect: string,
  ): HTMLElement => {
    const { root, body } = shopRow('--color-surface-3', spriteCanvas(itemSpriteId(sprite), 2));
    root.classList.add('shop-item--soon');

    const head = element('div', { className: 'shop-item-head' });
    head.append(
      element('h3', { className: 'shop-item-name', text: name }),
      element('span', { className: 'chip', text: ES.shop.soonLabel }),
    );
    body.append(
      head,
      element('p', { className: 'shop-item-desc', text: description }),
      element('p', { className: 'shop-item-effect', text: effect }),
    );
    return root;
  };

  const buildConsumables = (unlocked: boolean): void => {
    consumableButtons = [];
    berriesHeld = null;
    const rows: HTMLElement[] = [];

    if (unlocked) {
      const { root, body } = shopRow('--color-surface-3', spriteCanvas(itemSpriteId('berry'), 2));
      const head = element('div', { className: 'shop-item-head' });
      berriesHeld = element('span', { className: 'shop-item-owned' });
      head.append(element('h3', { className: 'shop-item-name', text: ES.shop.berry }), berriesHeld);
      body.append(
        head,
        element('p', { className: 'shop-item-desc', text: ES.shop.berryDescription }),
        element('p', {
          className: 'shop-item-effect',
          text: ES.shop.berryEffect(BALANCE.ranch.berryRestore),
        }),
      );

      const buttons = element('div', { className: 'shop-buy-row' });
      for (const amount of [1, 10]) {
        const entry = buyButton(
          amount === 1 ? ES.shop.buy : ES.shop.buyPack,
          () => BALANCE.berries.price * amount,
          () => {
            game.buyBerries(amount);
          },
        );
        buttons.append(entry.button);
        consumableButtons.push(entry);
      }
      body.append(buttons);
      rows.push(root);
    }

    rows.push(
      comingSoonRow('potion', ES.shop.potion, ES.shop.potionDescription, ES.shop.potionEffect),
      comingSoonRow('sack', ES.shop.ration, ES.shop.rationDescription, ES.shop.rationEffect),
      element('p', { className: 'column-hint', text: ES.shop.soonNote }),
    );
    consumableList.replaceChildren(...rows);
  };

  const renderConsumables = (state: GameState): void => {
    const unlocked = state.trainer.level >= BALANCE.berries.unlockLevel;
    const signature = String(unlocked);
    if (signature !== renderedConsumables) {
      renderedConsumables = signature;
      buildConsumables(unlocked);
    }

    if (berriesHeld !== null) setText(berriesHeld, ES.shop.berriesHeld(format(state.berries)));
    refreshPrices(consumableButtons, state);
    setText(
      lockedNote,
      unlocked ? '' : ES.shop.nextLocked(ES.shop.berry, BALANCE.berries.unlockLevel),
    );
  };

  const renderBody = (state: GameState): void => {
    lockedNote.hidden = false;
    switch (activeCategory) {
      case 'click':
        body.replaceChildren(list);
        renderUpgrades(state);
        return;
      case 'capture':
        body.replaceChildren(orbList);
        renderOrbs(state);
        return;
      case 'ranch':
        body.replaceChildren(ranchList);
        renderRanch(state);
        return;
      case 'consumable':
        body.replaceChildren(consumableList);
        renderConsumables(state);
        return;
    }
  };

  game.events.on('state:changed', ({ state }) => {
    if (activeCategory === 'click') renderUpgrades(state);
    if (activeCategory === 'capture') renderOrbs(state);
    if (activeCategory === 'ranch') renderRanch(state);
    if (activeCategory === 'consumable') renderConsumables(state);
  });

  renderTabs();
  renderBody(game.getState());
}
