// The language the visitor chose. The agent speaks and writes in it, the
// brief is drafted in it, and the page takes its direction from it.

import { emit, EVENT } from './bus.js';

// name is what a speaker of the language reads; english is what the agent
// is told.
export const LANGUAGES = Object.freeze([
  { code: 'en', name: 'English', english: 'English', dir: 'ltr' },
  { code: 'es', name: 'Español', english: 'Spanish', dir: 'ltr' },
  { code: 'fr', name: 'Français', english: 'French', dir: 'ltr' },
  { code: 'de', name: 'Deutsch', english: 'German', dir: 'ltr' },
  { code: 'it', name: 'Italiano', english: 'Italian', dir: 'ltr' },
  { code: 'pt', name: 'Português', english: 'Portuguese', dir: 'ltr' },
  { code: 'nl', name: 'Nederlands', english: 'Dutch', dir: 'ltr' },
  { code: 'pl', name: 'Polski', english: 'Polish', dir: 'ltr' },
  { code: 'sv', name: 'Svenska', english: 'Swedish', dir: 'ltr' },
  { code: 'el', name: 'Ελληνικά', english: 'Greek', dir: 'ltr' },
  { code: 'tr', name: 'Türkçe', english: 'Turkish', dir: 'ltr' },
  { code: 'ru', name: 'Русский', english: 'Russian', dir: 'ltr' },
  { code: 'uk', name: 'Українська', english: 'Ukrainian', dir: 'ltr' },
  { code: 'ar', name: 'العربية', english: 'Arabic', dir: 'rtl' },
  { code: 'he', name: 'עברית', english: 'Hebrew', dir: 'rtl' },
  { code: 'fa', name: 'فارسی', english: 'Persian', dir: 'rtl' },
  { code: 'ur', name: 'اردو', english: 'Urdu', dir: 'rtl' },
  { code: 'hi', name: 'हिन्दी', english: 'Hindi', dir: 'ltr' },
  { code: 'bn', name: 'বাংলা', english: 'Bengali', dir: 'ltr' },
  { code: 'zh', name: '中文', english: 'Chinese', dir: 'ltr' },
  { code: 'ja', name: '日本語', english: 'Japanese', dir: 'ltr' },
  { code: 'ko', name: '한국어', english: 'Korean', dir: 'ltr' },
  { code: 'id', name: 'Bahasa Indonesia', english: 'Indonesian', dir: 'ltr' },
  { code: 'vi', name: 'Tiếng Việt', english: 'Vietnamese', dir: 'ltr' },
  { code: 'th', name: 'ไทย', english: 'Thai', dir: 'ltr' },
  { code: 'sw', name: 'Kiswahili', english: 'Swahili', dir: 'ltr' },
]);

const KEY = 'rare-atlas-language';

const find = code => LANGUAGES.find(language => language.code === String(code || '').slice(0, 2).toLowerCase());

function initial() {
  let saved = '';
  // Storage can be blocked (private windows, some in-app browsers).
  try { saved = localStorage.getItem(KEY) || ''; } catch { /* use the browser's language */ }
  return find(saved) || find(navigator.language) || LANGUAGES[0];
}

function apply(language) {
  document.documentElement.lang = language.code;
  document.documentElement.dir = language.dir;
}

let current = initial();
apply(current);

export function getLanguage() {
  return current;
}

export function setLanguage(code) {
  const next = find(code);
  if (!next || next.code === current.code) return current;
  current = next;
  try { localStorage.setItem(KEY, next.code); } catch { /* the choice lasts for this visit only */ }
  apply(next);
  emit(EVENT.LANGUAGE_CHANGE, { language: next });
  return next;
}
