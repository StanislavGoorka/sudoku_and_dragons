import type { Reward } from './progress.ts';

/** "gwiazdka", "gwiazdki" or "gwiazdek", as Polish counts them. */
export function starsWord(count: number): string {
  if (count === 1) return 'gwiazdka';
  const tens = count % 100;
  const ones = count % 10;
  return ones >= 2 && ones <= 4 && (tens < 12 || tens > 14) ? 'gwiazdki' : 'gwiazdek';
}

/** What a fight paid, as lines for the end dialog: stars, an unlocked dragon, achievements. */
export function rewardLines(reward: Reward, balance: number): string[] {
  const lines: string[] = [];
  if (reward.stars > 0) lines.push(`+${reward.stars} ${starsWord(reward.stars)} (razem ${balance})`);
  if (reward.daily) {
    const { stars, streak } = reward.daily;
    lines.push(`Wyzwanie dnia: +${stars} ${starsWord(stars)}${streak > 1 ? ` (seria: ${streak} dni)` : ''}`);
  }
  const opened = reward.unlocked;
  if (opened) lines.push(opened.number === 1 ? `Nowa kraina: ${opened.region.name}!` : `Odblokowano: ${opened.enemy.name}!`);
  for (const achievement of reward.achievements.slice(0, 2)) {
    lines.push(`Osiągnięcie: ${achievement.title} (+${achievement.reward})`);
  }
  if (reward.achievements.length > 2) lines.push(`…i ${reward.achievements.length - 2} więcej`);
  return lines;
}
