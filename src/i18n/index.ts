import { moment } from 'obsidian';
import { en, type I18nKey, type Locale } from './en';
import { es } from './es';
import { fr } from './fr';
import { de } from './de';
import { pt } from './pt';
import { ja } from './ja';
import { zh } from './zh';
import { zhTW } from './zh-TW';

const localeMap: Record<string, Locale> = {
  es,
  fr,
  de,
  pt,
  'pt-br': pt,
  ja,
  zh,
  'zh-cn': zh,
  'zh-tw': zhTW,
  'zh-hk': zhTW,
};

function resolveLocale(): Locale {
  const raw = moment.locale().toLowerCase();
  if (localeMap[raw]) return localeMap[raw];
  const base = raw.split('-')[0];
  return localeMap[base] ?? {};
}

export function t(key: I18nKey, vars?: Record<string, string | number>): string {
  const locale = resolveLocale();
  let str: string = (locale[key] ?? en[key]) as string;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}
