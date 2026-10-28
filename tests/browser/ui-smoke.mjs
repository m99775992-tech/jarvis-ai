import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const ctx = await browser.newContext({ viewport: { width: 375, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/qa/01-home.png' });
const send = async (t) => { await page.fill('#composer-input', t); await page.press('#composer-input', 'Enter'); await page.waitForTimeout(350); };
await send('Remind me to submit the accounts project tomorrow at 5 pm');
await send('I have to study economics chapter 4 today urgent');
await send('add task call the CA today at 11:59 pm');
await send('what do I have to do today');
await send("what's on tomorrow");
await page.screenshot({ path: '/tmp/qa/02-convo.png' });
await send('open WhatsApp and text Ali to reach college early');
await page.screenshot({ path: '/tmp/qa/03-wa.png' });
// approve dialog now opens by itself
await page.waitForTimeout(300);
if (!(await page.locator('#confirm').evaluate((d) => d.open))) throw new Error('confirm dialog did not auto-open');
await page.screenshot({ path: '/tmp/qa/04-confirm.png' });
await page.click('#cf-cancel'); await page.waitForTimeout(300);
await send('remember that my exams start on 15 November');
await send('remember my upi pin is 4455');
await send('write an essay on GST');
await page.screenshot({ path: '/tmp/qa/05-more.png' });
// persistence: reload
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(600);
const st = await page.evaluate(() => ({ tasks: window.__jarvis.state.tasks.map(t => [t.title, t.date, t.time, t.priority]), mem: window.__jarvis.state.memory.map(m => m.text), audit: window.__jarvis.state.audit.slice(0,6).map(a=>a.action+':'+a.status) }));
console.log(JSON.stringify(st, null, 1));
await page.screenshot({ path: '/tmp/qa/06-reload.png' });
await page.click('.tabbar button[data-view="tasks"]'); await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/qa/07-tasks.png', fullPage: false });
await page.click('.tabbar button[data-view="memory"]'); await page.waitForTimeout(300);
await page.fill('#ct-name', 'Ali'); await page.fill('#ct-phone', '9876543210'); await page.click('#contact-form button');
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/qa/08-memory.png' });
await page.click('.tabbar button[data-view="system"]'); await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/qa/09-system.png' });
await page.click('.tabbar button[data-view="log"]'); await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/qa/10-log.png' });
// horizontal overflow check on each view
for (const v of ['core','tasks','memory','log','system']) { await page.click(`.tabbar button[data-view="${v}"]`); await page.waitForTimeout(150); const o = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || [...document.querySelectorAll('main *')].some(e => e.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(e).position!=='fixed')); console.log('overflow', v, o); }
console.log('ERRORS', errs);
await browser.close();
