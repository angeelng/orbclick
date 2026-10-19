import { getAchievement } from '../data/achievements';
import { getSpecies } from '../data/species';
import { ZONE_NAMES, zoneUnlockedByBossOf } from '../data/zones';
import { format } from '../core/economy';
import { ES } from '../i18n/es';
import type { Game } from '../systems/game';
import { element, setText } from './dom';

/**
 * Región viva para lectores de pantalla. Lo que el juego canta en el cartel
 * de la zona —una salvaje que aparece, una captura, un jefe vencido— vive
 * dentro del canvas y no existe para quien no lo ve; aquí se repite en texto.
 *
 * Es `polite` a propósito: son avisos, no alarmas, y no deben cortar lo que el
 * lector esté leyendo.
 */
export function mountAnnouncer(host: HTMLElement, game: Game): void {
  const region = element('p', {
    className: 'visually-hidden',
    attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
  });
  host.append(region);

  const say = (text: string): void => {
    // Repetir el mismo texto no lo volvería a leer: se limpia antes.
    if (region.textContent === text) setText(region, '');
    setText(region, text);
  };

  game.events.on('wild:appeared', ({ state }) => {
    if (state.encounter === null) return;
    say(ES.encounter.appeared(getSpecies(state.encounter.speciesId).name));
  });
  game.events.on('wild:fled', ({ speciesId }) => {
    if (speciesId !== null) say(ES.encounter.fled(getSpecies(speciesId).name));
  });
  game.events.on('wild:defeated', ({ speciesId, coinsGained }) => {
    if (speciesId !== null) {
      say(ES.encounter.defeated(getSpecies(speciesId).name, format(coinsGained)));
    }
  });
  game.events.on('orb:thrown', ({ speciesId, captured, fled }) => {
    if (speciesId === null) return;
    const name = getSpecies(speciesId).name;
    say(
      captured
        ? ES.encounter.captured(name)
        : fled
          ? ES.encounter.fled(name)
          : ES.encounter.escaped(name),
    );
  });
  game.events.on('trainer:levelup', ({ level }) => {
    say(ES.feedback.levelUp(level));
  });
  game.events.on('achievement:unlocked', ({ achievementId }) => {
    say(ES.achievements.unlocked(getAchievement(achievementId).name));
  });
  game.events.on('zone:unlocked', ({ zoneId }) => {
    say(ES.zone.unlocked(ZONE_NAMES[zoneId]));
  });
  game.events.on('boss:defeated', ({ speciesId, zoneId }) => {
    const name = getSpecies(speciesId).name;
    const next = zoneUnlockedByBossOf(zoneId);
    say(next === null ? ES.boss.wonLast(name) : ES.boss.won(name, next.name));
  });
  game.events.on('battle:ended', ({ outcome, coins, xp }) => {
    say(
      outcome === 'won'
        ? ES.battle.won(format(coins), format(xp))
        : outcome === 'lost'
          ? ES.battle.lost
          : ES.battle.timeout,
    );
  });
}
