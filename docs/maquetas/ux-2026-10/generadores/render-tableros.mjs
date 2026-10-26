import { chromium } from './comun.mjs';
import fs from 'fs';
const dir = process.argv[2], out = process.argv[3];
const b = await chromium.launch();
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.dc.html'))) {
  const s = fs.readFileSync(`${dir}/${f}`, 'utf8');
  const inner = s.slice(s.indexOf('</helmet>') + 9, s.indexOf('</x-dc>'));
  const style = (s.match(/<style>([\s\S]*?)<\/style>/) || [,''])[1];
  const p = await b.newPage({ viewport: { width: 1800, height: 1200 } });
  await p.setContent(`<!doctype html><meta charset="utf-8"><style>${style}</style>${inner}`);
  const el = await p.$('body > div');
  // detectar desbordes: hijos cuyo scrollWidth supera el ancho
  const desb = await p.evaluate(() => [...document.querySelectorAll('*')].filter(e => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible' || e.scrollHeight > e.clientHeight + 1 && e === document.querySelector('body > div')).map(e => (e.textContent||'').trim().slice(0,50)));
  if (desb.length) console.log(f, 'DESBORDE', desb.slice(0,5));
  await el.screenshot({ path: `${out}/${f.replace('.dc.html','.png')}` });
  await p.close();
}
await b.close();
