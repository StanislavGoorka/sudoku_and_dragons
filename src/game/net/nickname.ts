const TITLES = ['Rycerz', 'Mag', 'Łucznik', 'Druid', 'Paladyn', 'Bard', 'Łowca', 'Alchemik', 'Czarodziejka', 'Wojowniczka'];

/** A made-up nickname for a new player, like "Druid 417". */
export function randomNickname(): string {
  return `${TITLES[Math.floor(Math.random() * TITLES.length)]} ${100 + Math.floor(Math.random() * 900)}`;
}

export const NICKNAME_MAX = 20;

/** A nickname as typed, tidied up (spaces trimmed and squeezed), or null if it is too short or long. */
export function cleanNickname(typed: string): string | null {
  const name = typed.trim().replace(/\s+/g, ' ');
  return name.length >= 2 && name.length <= NICKNAME_MAX ? name : null;
}
