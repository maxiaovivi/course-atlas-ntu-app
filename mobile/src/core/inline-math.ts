// Compatibility normalizer for plain-text card fields that contain TeX-like
// tokens (`K_i`, `z_{k-1}`, `P^T P`, `S_W^{-1}(m_1-m_2)`, ...). It converts a
// small audited token grammar into explicit `$...$` inline-math markers for
// RaTeX InlineTeX. It is deliberately conservative:
//
// - A run is only converted when it contains at least one `_`/`^` script, so
//   bare words, identifiers, and single letters never become math on their own.
// - Multi-letter ASCII words (`zero_grad`, `backward`, `kernel`) never match:
//   a scriptless ASCII atom is only valid as a lone single letter.
// - Well-formed explicit `$...$` markers are passed through and rendered.
// - A bare backslash without explicit markers is left as ordinary text.
//
// This boundary exists because the live payload cannot be mutated in a
// frontend-only change. Future backend payloads should emit explicit `$...$`
// markers, at which point this normalizer becomes a no-op for those strings.

const GREEK_NAMES: Record<string, string> = {
  alpha: '\\alpha', beta: '\\beta', gamma: '\\gamma', delta: '\\delta',
  epsilon: '\\epsilon', eta: '\\eta', theta: '\\theta', kappa: '\\kappa',
  lambda: '\\lambda', mu: '\\mu', nu: '\\nu', xi: '\\xi', pi: '\\pi',
  rho: '\\rho', sigma: '\\sigma', tau: '\\tau', upsilon: '\\upsilon',
  phi: '\\phi', chi: '\\chi', psi: '\\psi', omega: '\\omega',
};

const GREEK_CHARS: Record<string, string> = {
  'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta',
  'ε': '\\epsilon', 'η': '\\eta', 'θ': '\\theta', 'κ': '\\kappa',
  'λ': '\\lambda', 'μ': '\\mu', 'ν': '\\nu', 'ξ': '\\xi', 'π': '\\pi',
  'ρ': '\\rho', 'σ': '\\sigma', 'τ': '\\tau', 'υ': '\\upsilon',
  'φ': '\\phi', 'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega',
  'Δ': '\\Delta', 'Θ': '\\Theta', 'Λ': '\\Lambda', 'Ξ': '\\Xi',
  'Π': '\\Pi', 'Σ': '\\Sigma', 'Φ': '\\Phi', 'Ψ': '\\Psi', 'Ω': '\\Omega',
};

const GREEK_NAME_LIST = Object.keys(GREEK_NAMES).sort((a, b) => b.length - a.length);
const CONNECTORS = new Set(['=', '+', '-', '/']);

const isAsciiLetter = (ch: string) => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
const isLowerLetter = (ch: string) => ch >= 'a' && ch <= 'z';
const isAlnum = (ch: string) => isAsciiLetter(ch) || (ch >= '0' && ch <= '9');
const isBoundaryHostile = (ch: string | undefined) =>
  ch !== undefined && (isAlnum(ch) || ch === '_' || ch === '^' || ch === '}');

type Parsed = { end: number; tex: string } | null;

// SCRIPT := ('_'|'^') ('{' [A-Za-z0-9+-]{1,6} '}' | alnum | two lowercase letters)
function parseScript(text: string, at: number): Parsed {
  const marker = text[at];
  if (marker !== '_' && marker !== '^') return null;
  const first = text[at + 1];
  if (first === '{') {
    let body = '';
    let i = at + 2;
    while (i < text.length && text[i] !== '}' && body.length <= 6) {
      if (!isAlnum(text[i]) && text[i] !== '+' && text[i] !== '-') return null;
      body += text[i];
      i += 1;
    }
    if (text[i] !== '}' || body.length === 0 || body.length > 6) return null;
    return { end: i + 1, tex: `${marker}{${body}}` };
  }
  if (first === undefined || !isAlnum(first)) return null;
  const second = text[at + 2];
  if (isLowerLetter(first) && second !== undefined && isLowerLetter(second)
    && !isBoundaryHostile(text[at + 3])) {
    return { end: at + 3, tex: `${marker}{${first}${second}}` };
  }
  return { end: at + 2, tex: `${marker}${first}` };
}

type Atom = { end: number; tex: string; scripted: boolean; ascii: boolean };

// ATOM := (ASCII letter | digit | greek name | greek char) SCRIPT{0,2}
function parseAtom(text: string, at: number): Atom | null {
  let base: string | null = null;
  let ascii = false;
  let i = at;
  const ch = text[at];
  if (ch !== undefined && GREEK_CHARS[ch]) {
    base = GREEK_CHARS[ch];
    i = at + 1;
  } else {
    for (const name of GREEK_NAME_LIST) {
      if (text.startsWith(name, at)) {
        base = GREEK_NAMES[name];
        i = at + name.length;
        break;
      }
    }
    if (base === null && ch !== undefined && isAsciiLetter(ch)) {
      base = ch;
      ascii = true;
      i = at + 1;
    } else if (base === null && ch !== undefined && ch >= '0' && ch <= '9') {
      base = ch;
      i = at + 1;
    }
  }
  if (base === null) return null;
  let tex = base;
  let scripted = false;
  for (let scripts = 0; scripts < 2; scripts += 1) {
    const script = parseScript(text, i);
    if (!script) break;
    tex += script.tex;
    scripted = true;
    i = script.end;
  }
  return { end: i, tex, scripted, ascii };
}

type Group = { end: number; tex: string; scripted: boolean };

// GROUP := adjacent atoms; a scriptless ASCII atom is only valid standing alone.
function parseGroup(text: string, at: number): Group | null {
  const atoms: Atom[] = [];
  let i = at;
  let tex = '';
  let scripted = false;
  for (;;) {
    const atom = parseAtom(text, i);
    if (!atom) break;
    atoms.push(atom);
    tex += atom.tex;
    scripted = scripted || atom.scripted;
    i = atom.end;
  }
  if (atoms.length === 0) return null;
  const invalidBare = atoms.some((atom) => atom.ascii && !atom.scripted) && atoms.length > 1;
  if (invalidBare) return null;
  return { end: i, tex, scripted };
}

type Run = { end: number; tex: string } | null;

// RUN := GROUP ((' ' | connector | balanced parens) GROUP)*, must contain a script.
function parseRun(text: string, at: number): Run {
  const first = parseGroup(text, at);
  if (!first) return null;
  let i = first.end;
  let tex = first.tex;
  let scripted = first.scripted;
  let depth = 0;
  let good = { end: i, tex, scripted };

  for (;;) {
    const sep = text[i];
    if (sep === ')' && depth > 0) {
      depth -= 1;
      tex += ')';
      i += 1;
      if (depth === 0) good = { end: i, tex, scripted };
      continue;
    }
    if (sep !== ' ' && sep !== '(' && (sep === undefined || !CONNECTORS.has(sep))) break;
    const group = parseGroup(text, i + 1);
    if (!group) break;
    if (sep === '(') depth += 1;
    tex += sep + group.tex;
    scripted = scripted || group.scripted;
    i = group.end;
    if (depth === 0) good = { end: i, tex, scripted };
  }

  if (!good.scripted || isBoundaryHostile(text[good.end])) return null;
  return { end: good.end, tex: good.tex };
}

export type InlineMathContent = { content: string; hasMath: boolean };

function hasExplicitInlineMath(text: string) {
  let openAt = -1;
  let hasPair = false;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\\') {
      i += 1;
      continue;
    }
    if (text[i] !== '$') continue;
    if (openAt < 0) {
      openAt = i;
    } else {
      if (i > openAt + 1) hasPair = true;
      openAt = -1;
    }
  }
  return openAt < 0 && hasPair;
}

export function toInlineMathContent(text: string): InlineMathContent {
  if (text.includes('$')) return { content: text, hasMath: hasExplicitInlineMath(text) };
  if (text.includes('\\')) return { content: text, hasMath: false };
  if (/(?:^|\s)(?:[^\s/]+\/)*[^\s/]+\.[A-Za-z0-9]{1,8}(?:$|\s)/.test(text)) {
    return { content: text, hasMath: false };
  }
  let content = '';
  let hasMath = false;
  let i = 0;
  while (i < text.length) {
    const previous = i > 0 ? text[i - 1] : undefined;
    if (!isBoundaryHostile(previous)) {
      const run = parseRun(text, i);
      if (run) {
        content += `$${run.tex}$`;
        hasMath = true;
        i = run.end;
        continue;
      }
    }
    content += text[i];
    i += 1;
  }
  return { content, hasMath };
}
