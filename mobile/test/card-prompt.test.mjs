import assert from 'node:assert/strict';
import test from 'node:test';

import { readerCardLayout, splitCardPrompt } from '../src/core/card-prompt.ts';

test('splits the bilingual prompt once and removes the visual separator', () => {
  assert.deepEqual(
    splitCardPrompt('Why is the LDA direction $S_W^{-1}(m_1-m_2)$? ·投影方向'),
    {
      head: 'Why is the LDA direction $S_W^{-1}(m_1-m_2)$?',
      cue: '投影方向',
    },
  );
});

test('keeps a future prompt without a bilingual cue intact', () => {
  assert.deepEqual(splitCardPrompt('State the Kalman update.'), {
    head: 'State the Kalman update.',
    cue: null,
  });
});

test('uses deterministic density tiers instead of card-specific rules', () => {
  assert.deepEqual(readerCardLayout('x'.repeat(48), 1), {
    answerMarginTop: 24,
    cueMarginTop: 6,
    dense: false,
    formulaFontSize: 21,
    formulaGap: 0,
    formulaMarginTop: 20,
    promptFontSize: 25,
    promptLetterSpacing: -0.4,
    promptLineHeight: 33,
  });

  assert.deepEqual(readerCardLayout('x'.repeat(49), 2), {
    answerMarginTop: 20,
    cueMarginTop: 4,
    dense: true,
    formulaFontSize: 19,
    formulaGap: 14,
    formulaMarginTop: 16,
    promptFontSize: 21,
    promptLetterSpacing: -0.3,
    promptLineHeight: 29,
  });
});
