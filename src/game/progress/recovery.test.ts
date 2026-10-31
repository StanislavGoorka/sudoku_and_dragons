import { describe, expect, it } from 'vitest';
import { boardTheme } from '../boardThemes.ts';
import { dragonSkin } from '../dragonSkins.ts';
import { ACHIEVEMENTS, buy, emptyProgress, parseProgress, recoverProgress, sameProgress } from './progress.ts';

describe('recovering progress without a base', () => {
  const rich = () => {
    const p = emptyProgress();
    p.stars = p.starsEarned = 200;
    return p;
  };

  it('keeps identical purchased items and their currency unchanged', () => {
    const p = rich();
    buy(p, 'board', boardTheme('ocean'));
    expect(sameProgress(recoverProgress(p, p), p)).toBe(true);
  });

  it('unites purchases without refunding either one', () => {
    const local = rich();
    const remote = rich();
    buy(local, 'board', boardTheme('ocean'));
    buy(remote, 'dragon', dragonSkin('king'));
    const recovered = recoverProgress(local, remote);
    expect(recovered.boardThemes).toEqual(['ocean']);
    expect(recovered.dragonSkins).toEqual(['king']);
    expect(recovered.stars).toBe(200 - boardTheme('ocean').price - dragonSkin('king').price);
    expect(recovered.starsEarned).toBe(200);
    expect(sameProgress(recoverProgress(recovered, remote), recovered)).toBe(true);
  });

  it('keeps later earnings while accounting for purchases in the older snapshot', () => {
    const local = rich();
    buy(local, 'board', boardTheme('ocean'));
    const remote = rich();
    remote.stars = remote.starsEarned = 250;
    expect(recoverProgress(local, remote).stars).toBe(250 - boardTheme('ocean').price);
  });

  it('does not restore spending unknown to this version of the game', () => {
    const local = rich();
    local.stars -= 20;
    const remote = rich();
    expect(recoverProgress(local, remote).stars).toBe(180);
  });

  it('keeps best records and unlocked achievements without doubling their rewards', () => {
    const local = rich();
    const remote = parseProgress(local);
    local.levels.easy = { wins: 4, losses: 1, bestStars: 3, bestTime: 120 };
    remote.levels.easy = { wins: 5, losses: 2, bestStars: 2, bestTime: 150 };
    const id = ACHIEVEMENTS[0].id;
    local.achievements[id] = 100;
    remote.achievements[id] = 200;
    const recovered = recoverProgress(local, remote);
    expect(recovered.levels.easy).toEqual({ wins: 5, losses: 2, bestStars: 3, bestTime: 120 });
    expect(recovered.stars).toBe(200);
    expect(recovered.achievements[id]).toBe(100);
    expect(sameProgress(recoverProgress(recovered, local), recovered)).toBe(true);
  });
});
