import React from 'react';
import { Language, Question } from '../types';

export const getText = (field: Record<Language, string> | any, lang: Language) => {
  if (!field) return '';
  if (typeof field === 'string') return field;
  return field[lang] || field['en'] || Object.values(field).find(v => !!v) || '';
};

export const getLocalizedQuestionText = (q: Question, lang: Language): { text: string; isFallback: boolean } => {
  const primary = q.text?.[lang];
  if (primary && primary.trim() !== '') return { text: primary, isFallback: false };

  let fallbackLang: Language = 'en';
  if (lang === 'fr') {
    if (q.text?.en && q.text.en.trim() !== '') fallbackLang = 'en';
    else if (q.text?.rw && q.text.rw.trim() !== '') fallbackLang = 'rw';
  } else if (lang === 'en') {
    if (q.text?.fr && q.text.fr.trim() !== '') fallbackLang = 'fr';
    else if (q.text?.rw && q.text.rw.trim() !== '') fallbackLang = 'rw';
  } else {
    if (q.text?.en && q.text.en.trim() !== '') fallbackLang = 'en';
    else if (q.text?.fr && q.text.fr.trim() !== '') fallbackLang = 'fr';
  }

  const fallbackText = q.text?.[fallbackLang] || q.text?.en || q.text?.rw || q.text?.fr || '';
  return { text: fallbackText, isFallback: Boolean(fallbackText) && lang !== fallbackLang };
};

export const getLocalizedQuestionOptions = (q: Question, lang: Language): { options: string[]; isFallback: boolean } => {
  if (q.options && typeof q.options === 'object' && !Array.isArray(q.options)) {
    const langOpts = q.options[lang];
    if (Array.isArray(langOpts) && langOpts.length > 0 && langOpts.some(o => Boolean(o && o.trim()))) {
      return { options: langOpts, isFallback: false };
    }
    let fallbackLang: Language = 'en';
    if (lang === 'fr') {
      if (Array.isArray(q.options.en) && q.options.en.length > 0) fallbackLang = 'en';
      else if (Array.isArray(q.options.rw) && q.options.rw.length > 0) fallbackLang = 'rw';
    } else if (lang === 'en') {
      if (Array.isArray(q.options.fr) && q.options.fr.length > 0) fallbackLang = 'fr';
      else if (Array.isArray(q.options.rw) && q.options.rw.length > 0) fallbackLang = 'rw';
    } else {
      if (Array.isArray(q.options.en) && q.options.en.length > 0) fallbackLang = 'en';
      else if (Array.isArray(q.options.fr) && q.options.fr.length > 0) fallbackLang = 'fr';
    }
    const fallbackOpts = q.options[fallbackLang] || q.options.en || q.options.rw || q.options.fr || [];
    return { options: fallbackOpts, isFallback: fallbackOpts.length > 0 && lang !== fallbackLang };
  }
  if (Array.isArray(q.options)) {
    return { options: q.options, isFallback: false };
  }
  return { options: [], isFallback: false };
};

export const getLocalizedQuestionExplanation = (q: Question, lang: Language): { explanation: string; isFallback: boolean } => {
  if (q.explanation && typeof q.explanation === 'object') {
    const langExp = q.explanation[lang];
    if (typeof langExp === 'string' && langExp.trim()) {
      return { explanation: langExp, isFallback: false };
    }
    let fallbackLang: Language = 'en';
    if (lang === 'fr') {
      if (q.explanation.en && q.explanation.en.trim()) fallbackLang = 'en';
      else if (q.explanation.rw && q.explanation.rw.trim()) fallbackLang = 'rw';
    } else if (lang === 'en') {
      if (q.explanation.fr && q.explanation.fr.trim()) fallbackLang = 'fr';
      else if (q.explanation.rw && q.explanation.rw.trim()) fallbackLang = 'rw';
    } else {
      if (q.explanation.en && q.explanation.en.trim()) fallbackLang = 'en';
      else if (q.explanation.fr && q.explanation.fr.trim()) fallbackLang = 'fr';
    }
    const fallbackExp = q.explanation[fallbackLang] || q.explanation.en || q.explanation.rw || q.explanation.fr || '';
    return { explanation: fallbackExp, isFallback: Boolean(fallbackExp) && lang !== fallbackLang };
  }
  return { explanation: '', isFallback: false };
};

export const NotTranslatedBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200/80 shrink-0 ${className}`}>
    Not translated
  </span>
);
