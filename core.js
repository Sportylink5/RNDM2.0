export const $ = (selector, parent = document) => parent.querySelector(selector);
export const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const sid = value => String(value ?? '');
export function safeURL(value) {
  const text=String(value || '').trim();if(!text)return '';
  try { const url = new URL(text, location.href); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
export function richText(value) {
  return String(value || '').split(/(https?:\/\/[^\s<>]+)/g).map(part => {
    if (!/^https?:\/\//.test(part)) return esc(part);
    const url = safeURL(part); return url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(part)}</a>` : esc(part);
  }).join('');
}
export function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0,2).map(x => [...x][0] || '').join('').toUpperCase(); }
export function avatar(person, size = '', kind = '') {
  const name = person?.display_name || person?.name || person?.title || person?.username || 'RNDM';
  const url = safeURL(person?.avatar_url);
  let hash = 0; for (const char of name) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return `<span class="avatar ${size} tone-${Math.abs(hash) % 5}">${url ? `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : kind ? icon(kind) : esc(initials(name))}</span>`;
}
const atlas = ['chats','contacts','channels','saved','settings','search','attach','emoji','mic','send','plus','back'];
const paths = {
  admin:'M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4M8 12l3 3 5-6', shield:'M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4M8 12l3 3 5-6',
  phone:'M5 3h4l1 5-2 2a14 14 0 0 0 6 6l2-2 5 1v4c0 2-3 2-5 1A22 22 0 0 1 4 8C3 6 3 3 5 3z', calls:'M5 3h4l1 5-2 2a14 14 0 0 0 6 6l2-2 5 1v4c0 2-3 2-5 1A22 22 0 0 1 4 8C3 6 3 3 5 3z',
  video:'M3 5h12v14H3zM15 9l6-4v14l-6-4', clips:'M4 3h16v18H4zM10 8l6 4-6 4z', heart:'M12 21C-5 10 5-2 12 7c7-9 17 3 0 14z', volume:'M3 9h4l5-5v16l-5-5H3zM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14',
  close:'M6 6l12 12M18 6L6 18', more:'M5 12h.01M12 12h.01M19 12h.01',
  pin:'M9 3h6l-1 5 4 4v2H6v-2l4-4-1-5M12 14v7',
  archive:'M4 8h16v12H4zM3 4h18v4H3zM10 12h4',
  check:'M5 12l4 4L19 6', double:'M2 12l4 4L16 6M10 14l2 2L22 6',
  moon:'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11z',
  sun:'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  info:'M12 11v6M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  reply:'M9 5l-6 6 6 6M3 11h10a7 7 0 0 1 7 7',
  forward:'M15 5l6 6-6 6M21 11H11a7 7 0 0 0-7 7',
  edit:'M4 16l-1 5 5-1L20 8l-4-4L4 16zM14 6l4 4',
  trash:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
  copy:'M8 8h12v13H8zM16 8V3H3v13h5',
  file:'M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h5',
  download:'M12 3v12M7 10l5 5 5-5M4 17v4h16v-4',
  bell:'M5 16h14l-2-3V9a5 5 0 0 0-10 0v4l-2 3M10 20h4',
  mute:'M18 5l-2 2M3 3l18 18M6 8v5l-2 3h12M10 20h4M10 4a5 5 0 0 1 7 5v4',
  logout:'M9 3H4v18h5M10 12h11M17 8l4 4-4 4',
  chevron:'M9 5l7 7-7 7', down:'M6 9l6 6 6-6',
  image:'M3 4h18v16H3zM3 16l6-6 5 5 3-3 4 4M16 8h.01',
  refresh:'M20 6v5h-5M4 18v-5h5M5 9a7 7 0 0 1 12-4l3 3M19 15a7 7 0 0 1-12 4l-3-3',
  lock:'M5 10h14v11H5zM8 10V7a4 4 0 0 1 8 0v3M12 14v3',
  stop:'M5 5h14v14H5z', folder:'M3 7V4h7l2 3h9v13H3z',
  keyboard:'M2 5h20v14H2zM6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10',
  tapolka:'M12 3v4M7 5l2 3M17 5l-2 3M5 10h14v10H5zM8 13h8M8 16h5',
  tap:'M12 3v7M8 5l4 5 4-5M5 13h14v8H5zM9 17h6'
};
export function icon(name, extra = '') {
  const idx = atlas.indexOf(name);
  return idx >= 0 ? `<span class="icon atlas a${idx} ${extra}" aria-hidden="true"></span>` : `<svg class="icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.file}"/></svg>`;
}
export function ib(name, label, action, extra = '') { return `<button type="button" class="icon-button ${extra}" data-action="${esc(action)}" aria-label="${esc(label)}" title="${esc(label)}">${icon(name)}</button>`; }
export function time(value) { const date = new Date(value); return isNaN(date) ? '' : date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}); }
export function day(value) {
  const date = new Date(value), today = new Date();
  if (isNaN(date)) return '';
  if (date.toDateString() === today.toDateString()) return 'Сегодня';
  today.setDate(today.getDate()-1); if (date.toDateString() === today.toDateString()) return 'Вчера';
  return date.toLocaleDateString('ru-RU',{day:'numeric',month:'long',...(date.getFullYear() !== new Date().getFullYear() ? {year:'numeric'} : {})});
}
export function preview(message) { return message?.deleted_at ? 'Сообщение удалено' : message?.body || message?.attachment_name || 'Новое сообщение'; }
export function bytes(n) { return n < 1024*1024 ? `${Math.ceil(n/1024)} КБ` : `${(n/1024/1024).toFixed(1)} МБ`; }
export function errorText(error) {
  const text = String(error?.message || error || 'Не удалось выполнить действие.');
  if (/invalid login credentials/i.test(text)) return 'Неверная почта или пароль.';
  if (/email not confirmed/i.test(text)) return 'Подтверди почту по ссылке из письма.';
  if (/already registered/i.test(text)) return 'Эта почта уже зарегистрирована. Войди в аккаунт.';
  if (/rate limit|too many requests/i.test(text)) return 'Слишком много попыток. Подожди немного и повтори.';
  if (/fetch|network|load failed|abort|timeout/i.test(text)) return 'Не удалось подтвердить действие. Проверь соединение и обнови чат перед повторной отправкой.';
  if (/row.level|permission denied|unauthorized|42501/i.test(text)) return 'Недостаточно прав для этого действия. Попробуй войти заново.';
  if (/bucket.*not found/i.test(text)) return 'Хранилище файлов недоступно. Проверь настройки прежнего проекта Supabase.';
  if (/23505|duplicate key/i.test(text)) return 'Такая запись уже существует.';
  return text;
}
export function unique(rows) { return [...new Map(rows.map(row=>[sid(row.id),row])).values()]; }
export function readLocal(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
export function writeLocal(key, value) { try { localStorage.setItem(key,JSON.stringify(value)); return true; } catch { return false; } }
export function timeoutFetch(input, init = {}) {
  const controller = new AbortController(); const stop = () => controller.abort();
  const outer = init.signal; if (outer?.aborted) stop(); else outer?.addEventListener('abort',stop,{once:true});
  const timer = setTimeout(stop, String(input?.url || input).includes('/storage/v1/object') ? 180000 : 18000);
  return fetch(input,{...init,signal:controller.signal}).finally(()=>{clearTimeout(timer);outer?.removeEventListener('abort',stop);});
}
