export const studyCardKinds = ['concept', 'formula', 'procedure', 'term'] as const;

export type StudyCardKind = typeof studyCardKinds[number];

export type StudyCardTerm = {
  term: string;
  meaning: string;
};

export type StudyCard = {
  id: string;
  courseCode: 'EE6221' | 'EE6406' | 'EE6407' | 'EE6497';
  kind: StudyCardKind;
  topic: string;
  prompt: string;
  answer: string[];
  latex: string[];
  terms: StudyCardTerm[];
  trap: string | null;
  signal: string;
  targets: string[];
  priority: 1 | 2 | 3;
};

export type StudyCardsPayload = {
  version: 1;
  updatedAt: string | null;
  cards: StudyCard[];
};

export const emptyStudyCards: StudyCardsPayload = { version: 1, updatedAt: null, cards: [] };

const MAX_CARDS = 128;
const COURSES = new Set(['EE6221', 'EE6406', 'EE6407', 'EE6497']);
const KINDS = new Set<string>(studyCardKinds);
const PAYLOAD_KEYS = new Set(['version', 'updatedAt', 'cards']);
const CARD_KEYS = new Set(['id', 'courseCode', 'kind', 'topic', 'prompt', 'answer', 'latex', 'terms', 'trap', 'signal', 'targets', 'priority']);
const TERM_KEYS = new Set(['term', 'meaning']);
const UNSAFE_LATEX = /\\(?:def|gdef|edef|xdef|let|futurelet|newcommand|renewcommand|providecommand|html|href|url|includegraphics|class|style|id|data)\b/i;

function hasExactKeys(value: object, keys: Set<string>) {
  const actual = Object.keys(value);
  return actual.length === keys.size && actual.every((key) => keys.has(key));
}

function isCleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
    && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

function isUniqueTextList(value: unknown, maxItems: number, maxLength: number, allowEmpty = false): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && (allowEmpty || value.length > 0)
    && value.every((item) => isCleanText(item, maxLength)) && new Set(value).size === value.length;
}

function isStudyCard(value: unknown): value is StudyCard {
  if (!value || typeof value !== 'object' || !hasExactKeys(value, CARD_KEYS)) return false;
  const card = value as Partial<StudyCard>;
  return typeof card.id === 'string' && /^[a-z0-9-]{8,96}$/.test(card.id)
    && typeof card.courseCode === 'string' && COURSES.has(card.courseCode)
    && typeof card.kind === 'string' && KINDS.has(card.kind)
    && isCleanText(card.topic, 60) && isCleanText(card.prompt, 120)
    && isUniqueTextList(card.answer, 3, 160)
    && isUniqueTextList(card.latex, 2, 360, true) && card.latex.every((item) => !UNSAFE_LATEX.test(item))
    && Array.isArray(card.terms) && card.terms.length <= 4
    && card.terms.every((term) => Boolean(term) && typeof term === 'object' && hasExactKeys(term, TERM_KEYS)
      && isCleanText(term.term, 60) && isCleanText(term.meaning, 120))
    && (card.trap === null || isCleanText(card.trap, 160))
    && isCleanText(card.signal, 80)
    && isUniqueTextList(card.targets, 3, 32)
    && Number.isInteger(card.priority) && Number(card.priority) >= 1 && Number(card.priority) <= 3;
}

export function isStudyCardsPayload(value: unknown): value is StudyCardsPayload {
  if (!value || typeof value !== 'object' || !hasExactKeys(value, PAYLOAD_KEYS)) return false;
  const payload = value as Partial<StudyCardsPayload>;
  return payload.version === 1
    && (payload.updatedAt === null || (typeof payload.updatedAt === 'string' && Number.isFinite(Date.parse(payload.updatedAt))))
    && Array.isArray(payload.cards) && payload.cards.length <= MAX_CARDS
    && payload.cards.every(isStudyCard)
    && new Set(payload.cards.map((card) => card.id)).size === payload.cards.length;
}

export function studyCardsForCourse(cards: StudyCard[], courseCode: string) {
  return cards.filter((card) => card.courseCode === courseCode).slice().sort((left, right) =>
    right.priority - left.priority || left.topic.localeCompare(right.topic, 'zh-CN') || left.id.localeCompare(right.id));
}

export function studyCardDeck(cards: StudyCard[]) {
  const groups = ['EE6221', 'EE6406', 'EE6407', 'EE6497']
    .map((courseCode) => studyCardsForCourse(cards, courseCode));
  const deck: StudyCard[] = [];
  for (let index = 0; index < Math.max(0, ...groups.map((group) => group.length)); index += 1) {
    for (const group of groups) {
      const card = group[index];
      if (card) deck.push(card);
    }
  }
  return deck;
}
