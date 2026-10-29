import { describe, expect, it } from 'vitest';
import { cleanNickname, NICKNAME_MAX, randomNickname } from './nickname.ts';

describe('nicknames', () => {
  it('are trimmed and their spaces squeezed, letters kept', () => {
    expect(cleanNickname('  Smoczy   Mistrz ')).toBe('Smoczy Mistrz');
    expect(cleanNickname('Łowczyni żmij')).toBe('Łowczyni żmij');
  });

  it('must be 2 to NICKNAME_MAX characters', () => {
    expect(cleanNickname(' a ')).toBeNull();
    expect(cleanNickname('ab')).toBe('ab');
    expect(cleanNickname('x'.repeat(NICKNAME_MAX))).not.toBeNull();
    expect(cleanNickname('x'.repeat(NICKNAME_MAX + 1))).toBeNull();
  });

  it('made-up ones are valid', () => {
    for (let i = 0; i < 50; i++) expect(cleanNickname(randomNickname())).not.toBeNull();
  });
});
