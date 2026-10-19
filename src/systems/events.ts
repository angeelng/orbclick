import type { AchievementId } from '../data/achievements';
import type { GameState } from '../core/state';
import type { UpgradeId } from '../data/items';
import type { OrbId } from '../data/orbs';
import type { CapturedCreature } from '../core/state';
import type { RanchGains } from '../core/ranch';
import type { BossMechanicId } from '../data/bosses';
import type { SpeciesId } from '../data/species';
import type { ZoneId } from '../data/zones';

/** Eventos del juego. La UI se suscribe a lo que necesita y repinta solo eso. */
export interface GameEventMap {
  'state:changed': { state: GameState };
  'click:resolved': {
    state: GameState;
    coinsGained: number;
    xpGained: number;
    /** Punto del clic en coordenadas lógicas del canvas de zona. */
    x: number;
    y: number;
  };
  'trainer:levelup': { level: number };
  'shop:purchased': {
    state: GameState;
    upgradeId: UpgradeId;
    quantity: number;
    spent: number;
  };
  /**
   * Compra que no es una mejora de clic: orbes, bayas, plazas o puestos. Las
   * mejoras tienen su propio evento porque la tienda las repinta una a una.
   */
  'shop:bought': {
    state: GameState;
    what: 'orbs' | 'berries' | 'slot' | 'post';
    spent: number;
  };
  'game:imported': { state: GameState };
  'wild:appeared': { state: GameState };
  'wild:damaged': { state: GameState; xpGained: number };
  'wild:fled': { state: GameState; speciesId: SpeciesId | null };
  /** Clic sobre una rara sin equipo disponible: la UI lo explica. */
  'wild:needsTeam': { state: GameState; speciesId: SpeciesId | null };
  /** Clic sobre quien ya está debilitado: lo que falta es el orbe. */
  'wild:needsOrb': { state: GameState; speciesId: SpeciesId | null };
  'zone:changed': { state: GameState; zoneId: ZoneId };
  /** Una zona nueva se ha abierto: nivel y jefe cumplidos. */
  'zone:unlocked': { state: GameState; zoneId: ZoneId };
  'boss:challenged': { state: GameState; zoneId: ZoneId; speciesId: SpeciesId };
  /** Ha saltado la mecánica del jefe: rebrote, escudo u oleada. */
  'boss:mechanic': { state: GameState; mechanic: BossMechanicId };
  /** Jefe vencido: abre la zona siguiente y se queda a tiro del orbe. */
  'boss:defeated': { state: GameState; zoneId: ZoneId; speciesId: SpeciesId };
  'battle:started': { state: GameState };
  'battle:ended': {
    state: GameState;
    outcome: 'won' | 'lost' | 'timeout';
    coins: number;
    xp: number;
  };
  'wild:defeated': {
    state: GameState;
    speciesId: SpeciesId | null;
    coinsGained: number;
    xpGained: number;
  };
  'orb:thrown': {
    state: GameState;
    orbId: OrbId;
    speciesId: SpeciesId | null;
    captured: boolean;
    fled: boolean;
    chance: number;
    creature: CapturedCreature | null;
    xpGained: number;
  };
  /** Logro recién conseguido: suma su +1 % y se celebra en pantalla. */
  'achievement:unlocked': { state: GameState; achievementId: AchievementId };
  'game:saved': { at: number };
  'game:loaded': {
    state: GameState;
    savedAt: number | null;
    /** Producción de la ausencia, si hubo una que merezca resumen. */
    offline: RanchGains | null;
  };
}

export type GameEventName = keyof GameEventMap;
export type Listener<N extends GameEventName> = (payload: GameEventMap[N]) => void;
export type Unsubscribe = () => void;

export interface EventBus {
  on<N extends GameEventName>(name: N, listener: Listener<N>): Unsubscribe;
  emit<N extends GameEventName>(name: N, payload: GameEventMap[N]): void;
}

export function createEventBus(): EventBus {
  const listeners = new Map<GameEventName, Set<Listener<GameEventName>>>();

  return {
    on(name, listener) {
      const set = listeners.get(name) ?? new Set();
      set.add(listener as Listener<GameEventName>);
      listeners.set(name, set);
      return () => {
        set.delete(listener as Listener<GameEventName>);
      };
    },
    emit(name, payload) {
      const set = listeners.get(name);
      if (set === undefined) return;
      for (const listener of [...set]) {
        (listener as Listener<typeof name>)(payload);
      }
    },
  };
}
