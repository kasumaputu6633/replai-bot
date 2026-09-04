import { describe, expect, it } from 'vitest';
import { correctsPreviousAssumption, DEFAULT_QUESTION, parseQuestion } from './parse-question.js';

describe('parseQuestion', () => {
  it('removes a standard Discord user mention', () => {
    expect(parseQuestion('<@123> is this true?', '123')).toBe('is this true?');
  });

  it('removes an alternate nickname mention', () => {
    expect(parseQuestion('<@!123> explain this', '123')).toBe('explain this');
  });

  it('removes a managed bot role mention', () => {
    expect(parseQuestion('<@&456> is this true?', '123', ['456'])).toBe('is this true?');
  });

  it('uses the default question when only the mention remains', () => {
    expect(parseQuestion('<@123>', '123')).toBe(DEFAULT_QUESTION);
  });
});

describe('correctsPreviousAssumption', () => {
  it.each(['setau saya ada deh', 'setahu saya ada', 'bukannya sudah ada?'])(
    'recognizes a user challenging the bot: %s',
    (question) => {
      expect(correctsPreviousAssumption(question)).toBe(true);
    },
  );
});
