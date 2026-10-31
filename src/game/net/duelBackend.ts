import type { DuelEvent, Seat } from '../../core/index.ts';
import {
  fetchDuel,
  fetchProfile,
  knownProfile,
  leaveDuel,
  online,
  serverNow,
  watchDuel,
  type DuelRow,
  type Profile,
  type DuelConnectionState,
} from './online.ts';

/**
 * Whoever judges a duel for DuelScreen: the server for online duels (`onlineDuels`), or the device
 * itself for training with a bot (botDuel.ts). The screen plays the same either way; failures are
 * OnlineErrors with the server's codes.
 */
export interface DuelBackend {
  /** Online duels pay stars and count in the player's records; training with a bot does not. */
  readonly ranked: boolean;
  /** The judge's clock, in ms, for turn countdowns. */
  now(): number;
  move(duelId: string, cell: number, digit: number): Promise<{ duel: DuelRow; event: DuelEvent }>;
  claimTimeout(duelId: string): Promise<{ duel: DuelRow }>;
  /** Gives up in the background. Online returns the confirmed row, or nothing when unreachable. */
  leave(duelId: string): Promise<DuelRow | undefined> | void;
  /** { waiting } until the rival asks too, then the new duel. */
  rematch(duelId: string): Promise<{ waiting?: true; duel?: DuelRow; seat?: Seat }>;
  declineRematch(duelId: string): Promise<unknown>;
  fetchDuel(duelId: string): Promise<DuelRow>;
  /** Calls `onRow` with every new version of the duel; returns a function that stops it. */
  watch(duelId: string, onRow: (row: DuelRow) => void, onConnection?: (state: DuelConnectionState) => void): () => void;
  fetchProfile(playerId: string): Promise<Profile>;
  knownProfile(playerId: string): Profile | undefined;
}

export const onlineDuels: DuelBackend = {
  ranked: true,
  now: serverNow,
  move: online.move,
  claimTimeout: online.claimTimeout,
  leave: (duelId) => leaveDuel(duelId),
  rematch: online.rematch,
  declineRematch: online.declineRematch,
  fetchDuel,
  watch: watchDuel,
  fetchProfile,
  knownProfile,
};
