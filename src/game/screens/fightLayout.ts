import { BoardView } from '../ui/BoardView.ts';

/** Where the arena, the board and the number pad go on a fight screen (a battle or a duel). */
export interface FightLayout {
  /** The column everything lines up in. */
  left: number;
  columnWidth: number;
  arenaY: number;
  arenaHeight: number;
  /** The board's cells (its tray reaches BoardView.BORDER further out). */
  boardY: number;
  boardSize: number;
  padY: number;
  padHeight: number;
}

/** The board gets as much room as the screen allows; the arena takes the rest above it, never less than this. */
const MIN_ARENA = 190;

export function fightLayout(width: number, height: number): FightLayout {
  const margin = 12;
  const gap = 12;
  const border = BoardView.BORDER;
  const lip = 5;
  const columnWidth = Math.min(width - margin * 2, 560);
  const padHeight = Math.round(Math.min(64, Math.max(46, (columnWidth / 9) * 1.25)));
  const room = height - margin * 2 - MIN_ARENA - gap * 2 - padHeight - border * 2 - lip;
  const boardSize = Math.max(180, Math.min(columnWidth - border * 2, room));
  const padY = height - margin - padHeight;
  const boardY = padY - gap - lip - border - boardSize;
  const arenaY = margin;
  return {
    left: (width - columnWidth) / 2,
    columnWidth,
    arenaY,
    arenaHeight: Math.max(0, boardY - border - gap - arenaY),
    boardY,
    boardSize,
    padY,
    padHeight,
  };
}
