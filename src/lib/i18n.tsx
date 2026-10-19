import React from 'react';
import { Language, Question } from '../types';

export const getText = (field: Record<Language, string> | any, lang: Language) => {
  if (!field) return '';
  if (typeof field === 'string') return field;
  return field[lang] || field['en'] || Object.values(field).find(v => !!v) || '';
};

export const getLocalizedQuestionText = (q: Question, lang: Language): { text: string; isFallback: boolean } => {
  if (q.text && q.text[lang] && q.text[lang].trim() !== '') {
    return { text: q.text[lang], isFallback: false };
  }
  const enText = q.text?.en || '';
  return { text: enText, isFallback: lang !== 'en' && Boolean(enText) };
};

export const getLocalizedQuestionOptions = (q: Question, lang: Language): { options: string[]; isFallback: boolean } => {
  if (q.options && !Array.isArray(q.options)) {
    const langOpts = q.options[lang];
    if (Array.isArray(langOpts) && langOpts.length > 0 && langOpts.some(o => Boolean(o && o.trim()))) {
      return { options: langOpts, isFallback: false };
    }
    const enOpts = Array.isArray(q.options.en) && q.options.en.length > 0 ? q.options.en : [];
    return { options: enOpts, isFallback: lang !== 'en' && enOpts.length > 0 };
  }
  if (Array.isArray(q.options)) {
    return { options: q.options, isFallback: lang !== 'en' && q.options.length > 0 };
  }
  return { options: [], isFallback: false };
};

export const getLocalizedQuestionExplanation = (q: Question, lang: Language): { explanation: string; isFallback: boolean } => {
  if (q.explanation && typeof q.explanation === 'object') {
    const langExp = q.explanation[lang];
    if (typeof langExp === 'string' && langExp.trim()) {
      return { explanation: langExp, isFallback: false };
    }
    const enExp = q.explanation.en || '';
    return { explanation: enExp, isFallback: lang !== 'en' && Boolean(enExp) };
  }
  return { explanation: '', isFallback: false };
};

export const NotTranslatedBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200/80 shrink-0 ${className}`}>
    Not translated
  </span>
);
