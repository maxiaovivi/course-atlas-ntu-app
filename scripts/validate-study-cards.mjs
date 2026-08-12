#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const path = process.argv[2];
if (!path) throw new Error('Usage: node scripts/validate-study-cards.mjs <cards.json>');

const value = JSON.parse(await readFile(path, 'utf8'));
const exact = (object, keys) => object && typeof object === 'object'
  && Object.keys(object).length === keys.length && Object.keys(object).every((key) => keys.includes(key));
const text = (item, max) => typeof item === 'string' && item.length > 0 && item.length <= max
  && item.trim() === item && !/[\u0000-\u001f\u007f]/.test(item);
const list = (items, maxItems, maxLength, allowEmpty = false) => Array.isArray(items)
  && items.length <= maxItems && (allowEmpty || items.length > 0)
  && items.every((item) => text(item, maxLength)) && new Set(items).size === items.length;
const cardKeys = ['id', 'courseCode', 'kind', 'topic', 'prompt', 'answer', 'latex', 'terms', 'trap', 'signal', 'targets', 'priority'];
const unsafe = /\\(?:def|gdef|edef|xdef|let|futurelet|newcommand|renewcommand|providecommand|html|href|url|includegraphics|class|style|id|data)\b/i;
const valid = exact(value, ['version', 'updatedAt', 'cards']) && value.version === 1
  && (value.updatedAt === null || (typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt))))
  && Array.isArray(value.cards) && value.cards.length > 0 && value.cards.length <= 128
  && value.cards.every((card) => exact(card, cardKeys)
    && /^[a-z0-9-]{8,96}$/.test(card.id)
    && ['EE6221', 'EE6406', 'EE6407', 'EE6497'].includes(card.courseCode)
    && ['concept', 'formula', 'procedure', 'term'].includes(card.kind)
    && text(card.topic, 60) && text(card.prompt, 120)
    && list(card.answer, 3, 160)
    && list(card.latex, 2, 360, true) && card.latex.every((item) => !unsafe.test(item))
    && Array.isArray(card.terms) && card.terms.length <= 4
    && card.terms.every((term) => exact(term, ['term', 'meaning']) && text(term.term, 60) && text(term.meaning, 120))
    && (card.trap === null || text(card.trap, 160))
    && text(card.signal, 80) && list(card.targets, 3, 32)
    && Number.isInteger(card.priority) && card.priority >= 1 && card.priority <= 3)
  && new Set(value.cards.map((card) => card.id)).size === value.cards.length;

if (!valid) throw new Error('Study-card payload is invalid');
const counts = Object.fromEntries(['EE6221', 'EE6406', 'EE6407', 'EE6497']
  .map((course) => [course, value.cards.filter((card) => card.courseCode === course).length]));
console.log(JSON.stringify({ ok: true, cards: value.cards.length, courses: counts }));
