import { chromium } from 'playwright';
import fs from 'fs';
const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const ctx = await browser.newContext({ viewport: { width: 375, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type()==='error' && errs.push(m.text()));
const R = (k, v) => console.log((v ? 'PASS ' : 'FAIL ') + k);
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
const send = async (t) => { await page.fill('#composer-input', t); await page.press('#composer-input', 'Enter'); await page.waitForTimeout(300); };
const S = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__jarvis.state)));
await send('add task pay electricity bill today');
await send('add task buy notebook tomorrow');
// delete requires approval: cancel first
await send('delete task electricity');
R('delete proposed, not executed', (await S()).tasks.length === 2);
await page.locator('.card .btn').last().click(); await page.waitForTimeout(200);
await page.click('#cf-cancel'); await page.waitForTimeout(200);
R('cancel keeps task', (await S()).tasks.length === 2);
await page.locator('.card .btn').last().click(); await page.waitForTimeout(200);
await page.click('#cf-ok'); await page.waitForTimeout(300);
R('authorize deletes task', (await S()).tasks.length === 1);
// complete via list checkbox
await send("what's on tomorrow");
await page.locator('.msg.jarvis').last().locator('.check').first().click(); await page.waitForTimeout(200);
R('checkbox completes task', (await S()).tasks[0].status === 'done');
await send('switch to meeting mode');
R('meeting mode chip', (await page.textContent('#chip-mode')).includes('MEETING'));
await send('switch to normal mode');
// open app card href
await page.evaluate(() => { window.__opened = []; window.__jarvisTestOpen = (h) => window.__opened.push(h); });
await send('open instagram'); await page.waitForTimeout(300);
R('open app launches immediately (no extra tap)', (await page.evaluate(() => window.__opened)).some((h) => h.includes('package=com.instagram.android')));
await send('Open Whatsapp And Text To reach at college early'); await page.waitForTimeout(300);
R('whatsapp message opens approve dialog immediately', await page.locator('#confirm').evaluate((d) => d.open));
R('nothing opened before approval', !(await page.evaluate(() => window.__opened)).some((h) => h.includes('whatsapp')));
await page.click('#confirm button[value="ok"], #cf-ok').catch(() => {});
await page.waitForTimeout(300);
R('whatsapp opens with text after one Approve tap', (await page.evaluate(() => window.__opened)).some((h) => h.startsWith('intent://send?text=Reach%20at%20college%20early') && h.includes('package=com.whatsapp')));
// backup: plain
await page.click('.tabbar button[data-view="memory"]');
await page.fill('#mem-input', 'Favourite subject is Accountancy'); await page.click('#mem-form button'); await page.waitForTimeout(200);
await page.click('.tabbar button[data-view="system"]'); await page.waitForTimeout(400);
let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bk-create')]);
const plainPath = '/tmp/qa/backup-plain.json'; await dl.saveAs(plainPath);
await page.fill('#bk-pass', 'mizan-secure-2026');
[dl] = await Promise.all([page.waitForEvent('download'), page.click('#bk-create')]);
const encPath = '/tmp/qa/backup-enc.json'; await dl.saveAs(encPath);
const enc = fs.readFileSync(encPath, 'utf8');
R('encrypted backup hides memory text', !enc.includes('Accountancy') && JSON.parse(enc).encrypted === true);
R('backup recorded', (await S()).backups.history.length === 2);
await page.screenshot({ path: '/tmp/qa/11-backup.png' });
// change data, then restore plain
await page.click('.tabbar button[data-view="core"]');
await send('add task this should vanish after restore today');
const before = (await S()).tasks.length;
await page.click('.tabbar button[data-view="system"]'); await page.waitForTimeout(300);
await page.setInputFiles('#bk-file', plainPath); await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/qa/12-restore-confirm.png' });
await page.click('#cf-ok'); await page.waitForTimeout(500);
const after = await S();
R('restore replaced data', after.tasks.length === before - 1 && !after.tasks.some(t => t.title.includes('vanish')));
R('memory restored', after.memory.some(m => m.text.includes('Accountancy')));
// undo restore
await page.click('#bk-revert'); await page.waitForTimeout(200); await page.click('#cf-ok'); await page.waitForTimeout(400);
R('undo restore brings back newer data', (await S()).tasks.some(t => t.title.includes('vanish')));
// tampered file rejected
const t = JSON.parse(fs.readFileSync(plainPath, 'utf8')); t.payload.tasks[0].title = 'HACKED'; fs.writeFileSync('/tmp/qa/tampered.json', JSON.stringify(t));
const pre = await S();
await page.setInputFiles('#bk-file', '/tmp/qa/tampered.json'); await page.waitForTimeout(500);
R('tampered rejected (toast)', (await page.textContent('#toast')).includes('Integrity'));
R('tampered did not change data', JSON.stringify((await S()).tasks) === JSON.stringify(pre.tasks));
// encrypted restore with wrong then right passphrase
await page.fill('#bk-pass', 'wrong-pass-123'); await page.setInputFiles('#bk-file', encPath); await page.waitForTimeout(1200);
R('wrong passphrase rejected', (await page.textContent('#toast')).toLowerCase().includes('passphrase'));
await page.fill('#bk-pass', 'mizan-secure-2026'); await page.setInputFiles('#bk-file', encPath); await page.waitForTimeout(1200);
R('encrypted restore dialog shown', await page.locator('#confirm[open]').count() === 1);
await page.click('#cf-ok'); await page.waitForTimeout(400);
R('encrypted restore ok', (await S()).memory.some(m => m.text.includes('Accountancy')));
// garbage file
fs.writeFileSync('/tmp/qa/garbage.json', 'hello');
await page.setInputFiles('#bk-file', '/tmp/qa/garbage.json'); await page.waitForTimeout(400);
R('garbage rejected', (await page.textContent('#toast')).includes('not valid JSON'));
// reminder fires: task due in past minute
await page.evaluate(() => { const s = window.__jarvis.state; const d = new Date(); d.setMinutes(d.getMinutes() - 1); const p = n => String(n).padStart(2, '0'); s.tasks.push({ id: 'rem1', title: 'Drink water', date: `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}`, priority: 'normal', status: 'pending', reminder: true, notified: false, createdAt: new Date().toISOString(), doneAt: null, source: 'text' }); });
await page.click('.tabbar button[data-view="core"]');
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await page.waitForTimeout(400);
R('reminder alert shown', !(await page.locator('#alert').isHidden()) && (await page.textContent('#alert-body')).includes('Drink water'));
await page.screenshot({ path: '/tmp/qa/13-reminder.png' });
await page.click('#alert-done'); await page.waitForTimeout(200);
R('alert mark done', (await S()).tasks.find(t => t.id === 'rem1').status === 'done');
// erase all requires typing DELETE
await page.click('.tabbar button[data-view="system"]'); await page.waitForTimeout(300);
await page.click('#erase-all'); await page.waitForTimeout(200);
R('erase button disabled until DELETE typed', await page.isDisabled('#cf-ok'));
await page.screenshot({ path: '/tmp/qa/14-erase.png' });
await page.fill('#cf-extra input', 'delete'); await page.click('#cf-ok'); await page.waitForTimeout(400);
R('erase all wiped', (await S()).tasks.length === 0 && (await S()).memory.length === 0);
// XSS attempt
await page.click('.tabbar button[data-view="core"]');
await send('add task <img src=x onerror=alert(1)> today');
R('xss rendered as text', await page.locator('.msg img').count() === 0);
// offline
await ctx.setOffline(true); await page.reload(); await page.waitForTimeout(800);
R('loads offline', (await page.textContent('#chip-net')).includes('OFFLINE'));
await send('what do I have to do today');
R('commands work offline', (await page.locator('.msg.jarvis').last().textContent()).includes('Sir'));
await ctx.setOffline(false);
console.log('ERRORS', errs);
// desktop shot
const p2 = await browser.newPage({ viewport: { width: 1280, height: 800 } }); await p2.goto('http://localhost:8765/'); await p2.waitForTimeout(600); await p2.screenshot({ path: '/tmp/qa/15-desktop.png' });
// light theme
await page.evaluate(() => { window.__jarvis.state.settings.theme = 'light'; });
await page.click('.tabbar button[data-view="system"]'); await page.check('#theme'); await page.click('.tabbar button[data-view="core"]'); await page.waitForTimeout(300); await page.screenshot({ path: '/tmp/qa/16-light.png' });
await browser.close();
