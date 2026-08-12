'use dom';

import { useEffect, useRef, useState } from 'react';
import type { DOMProps } from 'expo/dom';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import amsRegular from '../../node_modules/katex/dist/fonts/KaTeX_AMS-Regular.woff2';
import caligraphicBold from '../../node_modules/katex/dist/fonts/KaTeX_Caligraphic-Bold.woff2';
import caligraphicRegular from '../../node_modules/katex/dist/fonts/KaTeX_Caligraphic-Regular.woff2';
import frakturBold from '../../node_modules/katex/dist/fonts/KaTeX_Fraktur-Bold.woff2';
import frakturRegular from '../../node_modules/katex/dist/fonts/KaTeX_Fraktur-Regular.woff2';
import mainBold from '../../node_modules/katex/dist/fonts/KaTeX_Main-Bold.woff2';
import mainBoldItalic from '../../node_modules/katex/dist/fonts/KaTeX_Main-BoldItalic.woff2';
import mainItalic from '../../node_modules/katex/dist/fonts/KaTeX_Main-Italic.woff2';
import mainRegular from '../../node_modules/katex/dist/fonts/KaTeX_Main-Regular.woff2';
import mathBoldItalic from '../../node_modules/katex/dist/fonts/KaTeX_Math-BoldItalic.woff2';
import mathItalic from '../../node_modules/katex/dist/fonts/KaTeX_Math-Italic.woff2';
import sansBold from '../../node_modules/katex/dist/fonts/KaTeX_SansSerif-Bold.woff2';
import sansItalic from '../../node_modules/katex/dist/fonts/KaTeX_SansSerif-Italic.woff2';
import sansRegular from '../../node_modules/katex/dist/fonts/KaTeX_SansSerif-Regular.woff2';
import scriptRegular from '../../node_modules/katex/dist/fonts/KaTeX_Script-Regular.woff2';
import size1Regular from '../../node_modules/katex/dist/fonts/KaTeX_Size1-Regular.woff2';
import size2Regular from '../../node_modules/katex/dist/fonts/KaTeX_Size2-Regular.woff2';
import size3Regular from '../../node_modules/katex/dist/fonts/KaTeX_Size3-Regular.woff2';
import size4Regular from '../../node_modules/katex/dist/fonts/KaTeX_Size4-Regular.woff2';
import typewriterRegular from '../../node_modules/katex/dist/fonts/KaTeX_Typewriter-Regular.woff2';

type Props = {
  latex: string;
  color?: string;
  fontSize?: number;
  displayMode?: boolean;
  dom?: DOMProps;
};

export default function MathFormula({
  latex,
  color = '#18343C',
  fontSize = 18,
  displayMode = true,
}: Props) {
  const formulaRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const html = katex.renderToString(latex, {
    displayMode,
    throwOnError: false,
    errorColor: '#B35445',
    output: 'htmlAndMathml',
    trust: false,
    strict: 'ignore',
    maxExpand: 100,
    maxSize: 12,
  });

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      const formula = formulaRef.current;
      const content = contentRef.current;
      if (!formula || !content) return;
      const availableWidth = Math.max(1, formula.clientWidth - 12);
      const availableHeight = Math.max(1, formula.clientHeight - 8);
      const requiredWidth = Math.max(1, content.scrollWidth);
      const requiredHeight = Math.max(1, content.scrollHeight);
      setScale(Math.min(1, availableWidth / requiredWidth, availableHeight / requiredHeight));
    };
    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    scheduleMeasure();
    void document.fonts?.ready.then(scheduleMeasure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure);
    if (formulaRef.current) observer?.observe(formulaRef.current);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [fontSize, html]);

  return (
    <>
      <style>{`
        @font-face { font-family: KaTeX_AMS; font-style: normal; font-weight: 400; src: url(${amsRegular}) format('woff2'); }
        @font-face { font-family: KaTeX_Caligraphic; font-style: normal; font-weight: 700; src: url(${caligraphicBold}) format('woff2'); }
        @font-face { font-family: KaTeX_Caligraphic; font-style: normal; font-weight: 400; src: url(${caligraphicRegular}) format('woff2'); }
        @font-face { font-family: KaTeX_Fraktur; font-style: normal; font-weight: 700; src: url(${frakturBold}) format('woff2'); }
        @font-face { font-family: KaTeX_Fraktur; font-style: normal; font-weight: 400; src: url(${frakturRegular}) format('woff2'); }
        @font-face { font-family: KaTeX_Main; font-style: normal; font-weight: 700; src: url(${mainBold}) format('woff2'); }
        @font-face { font-family: KaTeX_Main; font-style: italic; font-weight: 700; src: url(${mainBoldItalic}) format('woff2'); }
        @font-face { font-family: KaTeX_Main; font-style: italic; font-weight: 400; src: url(${mainItalic}) format('woff2'); }
        @font-face { font-family: KaTeX_Main; font-style: normal; font-weight: 400; src: url(${mainRegular}) format('woff2'); }
        @font-face { font-family: KaTeX_Math; font-style: italic; font-weight: 700; src: url(${mathBoldItalic}) format('woff2'); }
        @font-face { font-family: KaTeX_Math; font-style: italic; font-weight: 400; src: url(${mathItalic}) format('woff2'); }
        @font-face { font-family: KaTeX_SansSerif; font-style: normal; font-weight: 700; src: url(${sansBold}) format('woff2'); }
        @font-face { font-family: KaTeX_SansSerif; font-style: italic; font-weight: 400; src: url(${sansItalic}) format('woff2'); }
        @font-face { font-family: KaTeX_SansSerif; font-style: normal; font-weight: 400; src: url(${sansRegular}) format('woff2'); }
        @font-face { font-family: KaTeX_Script; font-style: normal; font-weight: 400; src: url(${scriptRegular}) format('woff2'); }
        @font-face { font-family: KaTeX_Size1; font-style: normal; font-weight: 400; src: url(${size1Regular}) format('woff2'); }
        @font-face { font-family: KaTeX_Size2; font-style: normal; font-weight: 400; src: url(${size2Regular}) format('woff2'); }
        @font-face { font-family: KaTeX_Size3; font-style: normal; font-weight: 400; src: url(${size3Regular}) format('woff2'); }
        @font-face { font-family: KaTeX_Size4; font-style: normal; font-weight: 400; src: url(${size4Regular}) format('woff2'); }
        @font-face { font-family: KaTeX_Typewriter; font-style: normal; font-weight: 400; src: url(${typewriterRegular}) format('woff2'); }
        :root { color-scheme: light; }
        html, body { margin: 0; min-height: 100%; background: transparent; overflow: hidden; }
        body { display: flex; align-items: center; justify-content: center; }
        .formula { width: 100%; height: 100%; padding: 4px 6px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; overflow: hidden; color: ${color}; font-size: ${fontSize}px; text-align: center; }
        .fit { display: inline-block; width: max-content; max-width: none; transform: scale(${scale}); transform-origin: center center; }
        .katex-display { margin: 0; overflow: visible; }
      `}</style>
      <div ref={formulaRef} className="formula">
        <div ref={contentRef} className="fit" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </>
  );
}
