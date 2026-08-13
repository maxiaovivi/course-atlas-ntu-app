const BILINGUAL_SEPARATOR = ' ·';

export type SplitCardPrompt = {
  head: string;
  cue: string | null;
};

export type ReaderCardLayout = {
  answerMarginTop: number;
  cueMarginTop: number;
  dense: boolean;
  formulaFontSize: number;
  formulaGap: number;
  formulaMarginTop: number;
  promptFontSize: number;
  promptLetterSpacing: number;
  promptLineHeight: number;
};

export function splitCardPrompt(prompt: string): SplitCardPrompt {
  const separatorIndex = prompt.indexOf(BILINGUAL_SEPARATOR);
  if (separatorIndex < 0) return { head: prompt, cue: null };

  const head = prompt.slice(0, separatorIndex).trim();
  const cue = prompt.slice(separatorIndex + BILINGUAL_SEPARATOR.length).trim();
  return {
    head: head || prompt,
    cue: cue || null,
  };
}

export function readerCardLayout(head: string, formulaCount: number): ReaderCardLayout {
  const longPrompt = head.length > 48;
  const multipleFormulas = formulaCount > 1;
  const dense = longPrompt && multipleFormulas;

  return {
    answerMarginTop: dense ? 20 : 24,
    cueMarginTop: dense ? 4 : 6,
    dense,
    formulaFontSize: multipleFormulas ? 19 : 21,
    formulaGap: multipleFormulas ? 14 : 0,
    formulaMarginTop: multipleFormulas ? 16 : 20,
    promptFontSize: longPrompt ? 21 : 25,
    promptLetterSpacing: longPrompt ? -0.3 : -0.4,
    promptLineHeight: longPrompt ? 29 : 33,
  };
}
