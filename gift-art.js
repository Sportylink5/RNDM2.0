/** RNDM gift artwork map. Only filenames bundled with the website are allowed. */
import {esc} from './core.js?v=64.0.0';

const ART_IDS=new Set(["balloon", "bear", "butterfly", "cake", "candy", "car", "cat", "celestial_crown", "coffee", "comet", "cookie", "cosmic_gate", "crown", "diamond", "eternal_flame", "firework", "flower", "galaxy", "gift_box", "gold", "gold_dragon", "heart", "lucky_cat", "magic_orb", "moon", "mythic_mask", "neon_star", "owl", "paw", "rainbow", "relic_cat", "rndm_relic", "rocket", "rose", "sparkle", "sun", "trophy", "unicorn", "violet_comet"]);
/** Render a real WebP where available, with an emoji fallback for unknown or failed assets. */
export function giftArt(gift,extra=''){
 const object=typeof gift==='object'&&gift!==null?gift:{gift_id:gift};
 const id=String(object.gift_id??object.id??'').trim().toLowerCase();
 const emoji=String(object.gift_emoji??object.emoji??'🎁');
 const title=String(object.gift_name??object.name??'Подарок');
 const cls=String(extra).replace(/[^a-z0-9_ -]/gi,'').trim();
 const img=ART_IDS.has(id)?`<img src="./gift-${id}.webp" alt="" loading="lazy" decoding="async">`:'';
 return `<span class="gift-art ${cls}" role="img" aria-label="${esc(title)}"><span class="gift-art-fallback" aria-hidden="true">${esc(emoji)}</span>${img}</span>`;
}
// A failed request must not hide the emoji fallback (offline/older cached installs).
document.addEventListener('error',event=>{
 const target=event.target;
 if(target instanceof HTMLImageElement&&target.closest('.gift-art'))target.hidden=true;
},true);
