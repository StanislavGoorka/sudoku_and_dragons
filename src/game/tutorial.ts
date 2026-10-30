import { profileSuffix } from './profile.ts';

/** The one-time explanations: the guided first battle, and the duel rules before the first duel. */
export type Lesson = 'battle' | 'duel';

const key = (lesson: Lesson) => `sudoku-dragons.tutorial-${lesson}${profileSuffix}`;

/** Kept on the device: a player who reinstalls sees the lessons again, which does no harm. */
export function lessonSeen(lesson: Lesson): boolean {
  try {
    return localStorage.getItem(key(lesson)) === 'seen';
  } catch {
    return false;
  }
}

export function markLessonSeen(lesson: Lesson): void {
  try {
    localStorage.setItem(key(lesson), 'seen');
  } catch {
    // Storage may be unavailable; the lesson then shows again next time.
  }
}

/** A cell where only one digit fits (nearest the middle), to suggest to a new player; any empty one if none. */
export function easyCell(grid: readonly number[]): number {
  const fits = (cell: number) => {
    const row = Math.floor(cell / 9);
    const col = cell % 9;
    const used = new Set<number>();
    for (let k = 0; k < 9; k++) {
      used.add(grid[row * 9 + k]);
      used.add(grid[k * 9 + col]);
      used.add(grid[(Math.floor(row / 3) * 3 + Math.floor(k / 3)) * 9 + Math.floor(col / 3) * 3 + (k % 3)]);
    }
    return 9 - [...used].filter((d) => d > 0).length;
  };
  const empty = grid.flatMap((value, cell) => (value === 0 ? [cell] : []));
  const middle = (cell: number) => Math.abs(Math.floor(cell / 9) - 4) + Math.abs((cell % 9) - 4);
  const singles = empty.filter((cell) => fits(cell) === 1).sort((a, b) => middle(a) - middle(b));
  return singles[0] ?? empty[0] ?? 40;
}
