// All user-facing text, in Bulgarian. Keep wording short and plain:
// the app is used on deck by people with different levels of tech experience.
import type { ErrorCode, EventKind } from '../domain/satka';

export const t = {
  appName: 'Ферма за стриди',
  satka: 'Сатка',
  back: 'Назад',
  save: 'Запази',
  cancel: 'Отказ',
  confirm: 'Потвърди',
  close: 'Затвори',
  loading: 'Зареждане…',
  none: '—',

  nav: {
    search: 'Намери сатка',
    scan: 'Сканирай QR',
    map: 'Карта на фермата',
    inventory: 'Инвентар',
    add: 'Добави сатка',
    recent: 'Последни действия',
    admin: 'Админ',
    sync: 'Синхронизация',
  },

  fields: {
    code: 'Номер',
    size: 'Размер',
    status: 'Състояние',
    position: 'Позиция',
    line: 'Линия',
    section: 'Секция',
    slot: 'Позиция',
    lastProcessed: 'Последна обработка',
    note: 'Бележка (по избор)',
    date: 'Дата',
    reason: 'Причина',
    archived: 'Архивирана',
  },

  actions: {
    process: 'Обработка',
    move: 'Премести',
    archive: 'Архивирай',
    correct: 'Корекция (админ)',
    showQr: 'Покажи QR код',
    printLabel: 'Печат на етикет',
    showOnMap: 'Покажи на картата',
    history: 'История',
  },

  events: {
    created: 'Добавена',
    processed: 'Обработка',
    moved: 'Преместена',
    corrected: 'Корекция',
    archived: 'Архивирана',
  } satisfies Record<EventKind, string>,

  errors: {
    NOT_AUTHORIZED: 'Профилът ви още не е одобрен или сте излезли от системата.',
    NOT_ADMIN: 'Само администратор може да направи това.',
    NOT_FOUND: 'Сатката не е намерена.',
    ARCHIVED: 'Сатката е архивирана и не може да се променя.',
    POSITION_TAKEN: 'Тази позиция вече е заета от друга сатка.',
    SAME_POSITION: 'Сатката вече е на тази позиция.',
    INVALID_POSITION: 'Невалидна позиция (линия 1–6, секция 1–25, позиция 1–4).',
    INVALID_DATE: 'Невалидна дата — не може да е в бъдещето.',
    REASON_REQUIRED: 'Моля, въведете причина.',
    LAST_ADMIN: 'Трябва да остане поне един активен администратор.',
  } satisfies Record<ErrorCode, string>,

  sync: {
    online: 'Онлайн',
    offline: 'Без връзка',
    syncing: 'Синхронизиране…',
    pending: (n: number) => `${n} ${n === 1 ? 'промяна чака' : 'промени чакат'} изпращане`,
    failed: (n: number) => `${n} ${n === 1 ? 'проблем' : 'проблема'} — натиснете`,
    allSaved: 'Всичко е запазено',
    savedOffline: 'Запазено на телефона. Ще се изпрати, когато има връзка.',
    saved: 'Запазено.',
  },
};

export function errorText(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code && code in t.errors) return t.errors[code as ErrorCode];
  return 'Възникна грешка. Опитайте отново.';
}
