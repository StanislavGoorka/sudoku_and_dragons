import type { BotStrength } from '../../core/duel/bot.ts';
export const BOT_NAMES:Record<BotStrength,string>={easy:'Spokojny',medium:'Taktyczny',hard:'Ekspert'};
export const BOT_DESCRIPTIONS:Record<BotStrength,string>={
  easy:'Myśli 5,5–8,5 s. Zna tylko jednego kandydata pola.',
  medium:'Myśli 3,8–6 s. Zna też jedyne miejsce cyfry w jednostce.',
  hard:'Myśli 2,2–4,2 s. Korzysta również z par i eliminacji.',
};
