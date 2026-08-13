import assert from 'node:assert/strict';
import test from 'node:test';

import { toInlineMathContent } from '../src/core/inline-math.ts';

function converted(input, expected) {
  const result = toInlineMathContent(input);
  assert.equal(result.content, expected, input);
  assert.ok(result.hasMath, input);
}

function untouched(input) {
  const result = toInlineMathContent(input);
  assert.equal(result.content, input);
  assert.ok(!result.hasMath, input);
}

test('upgrades audited TeX-like tokens from the corpus to $...$ markers', () => {
  converted('K_i', '$K_i$');
  converted('z_{k-1}', '$z_{k-1}$');
  converted('x_1x_2', '$x_1x_2$');
  converted('P^T P', '$P^T P$');
  converted('S_W^{-1}(m_1-m_2)', '$S_W^{-1}(m_1-m_2)$');
});

test('keeps surrounding CJK prose intact and converts only the token', () => {
  converted('当 K_i 增大时超调增大', '当 $K_i$ 增大时超调增大');
  converted('K_p控制比例项', '$K_p$控制比例项');
  converted('先验 P(w_i) 与后验', '先验 $P(w_i)$ 与后验');
});

test('converts greek names and characters with scripts', () => {
  converted('sigma_x', '$\\sigma_x$');
  converted('σ_x 是标准差', '$\\sigma_x$ 是标准差');
  converted('lambda_{max}', '$\\lambda_{max}$');
  converted('ξ_i>1 表示误分类', '$\\xi_i$>1 表示误分类');
  converted('mixing coefficient π_k', 'mixing coefficient $\\pi_k$');
});

test('converts numeric bases with scripts without touching ordinary numbers', () => {
  converted('分母是2^L-1', '分母是$2^L-1$');
  untouched('第 2 题有 3 步');
});

test('never converts plain identifiers, code names, or bare words', () => {
  untouched('zero_grad');
  untouched('model.zero_grad()');
  untouched('backward propagation');
  untouched('kernel trick');
  untouched('a and b');
  untouched('ABC_1');
  untouched('learning_rate');
  untouched('notes/x_i.pdf');
  untouched('x_id.md');
});

test('renders well-formed explicit inline TeX without rewriting it', () => {
  converted('already $K_i$ marked', 'already $K_i$ marked');
  converted('uses $\\alpha_i$ directly', 'uses $\\alpha_i$ directly');
  untouched('unmatched $K_i marker');
  untouched('uses \\alpha directly');
});

test('is deterministic and does not touch scriptless runs', () => {
  const input = '当 K_i 增大时 P^T P 保持对称';
  assert.deepEqual(toInlineMathContent(input), toInlineMathContent(input));
  untouched('P Q R');
});
