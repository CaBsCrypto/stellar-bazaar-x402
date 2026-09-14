import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as delivery from '../lib/deliverable.ts';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../components/DeliverableViewer.tsx', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,
  { module, exports: module.exports, URL, require: name => name === "./RecoveryStatus" ? {RecoveryStatus:()=>null} : name === '@/lib/deliverable' ? delivery : require(name) });
const { prepareReportQuestion, cleanQuestionText } = module.exports;
const manifest = { title: 'Informe', summary: 'Resumen del proveedor', originalResult: { provider: 'website-intelligence', mode: 'live', requestedUrl: 'https://example.com/', fetchedAt: '2026-09-08T05:57:55.303Z', receipt: 'NEVER INCLUDE', token: 'NEVER INCLUDE' }, content: { kind: 'report', sections: [{ id: 'one', title: 'Descripción ausente', body: 'Añadir descripción.', findings: ['description=(ausente)'] }, { id: 'two', title: 'Otro hallazgo', body: 'Otro contenido' }] } };
const question = prepareReportQuestion(manifest, 'understand', 'one');
assert.match(question.text, /Análisis de example.com/); assert.match(question.text, /description=\(ausente\)/);
assert.doesNotMatch(question.text, /Otro hallazgo|NEVER INCLUDE/); assert.match(question.text, /2026-09-08/);
for (const intent of ['understand', 'prioritize', 'improve']) assert.ok(prepareReportQuestion(manifest, intent).text.length <= 6000);
const huge = prepareReportQuestion({ ...manifest, summary: 'Texto '.repeat(4000) }, 'prioritize');
assert.equal(huge.truncated, true); assert.equal(huge.text.length, 6000); assert.match(huge.text, /Contexto recortado/);
assert.throws(() => prepareReportQuestion(manifest, 'understand', 'missing'));
const sensitive = 'token: shhh\nAuthorization: Bearer abc\nhttps://files.example.com/image?X-Amz-Signature=private\n' + 'S' + 'A'.repeat(55) + '\n' + 'a'.repeat(64);
assert.doesNotMatch(cleanQuestionText(sensitive), /shhh|Bearer abc|X-Amz|SA{55}|a{64}/);
assert.doesNotMatch(cleanQuestionText('x-vercel-protection-bypass: short-private-value'), /short-private-value/);
console.log('PASS: selected context, intents, 6000-character limit, redaction, no receipt or credentials');

if (process.argv.includes('--browser')) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXE ? { executablePath: process.env.BROWSER_EXE } : {}) });
  try {
    const access = JSON.parse(readFileSync('work/private-website-report-pilot/access.json', 'utf8'));
    for (const viewport of [{width:1280,height:900}, {width:390,height:844}]) {
      const page = await browser.newPage({ viewport });
      const writes = [];
      page.on('request', request => { if (request.method() !== 'GET') writes.push(request.method() + ' ' + request.url()); });
      await page.goto('http://127.0.0.1:3214/history');
      await page.locator('#history-access-token').fill(access.readToken);
      await page.getByRole('button', {name:'Consultar historial',exact:true}).click();
      await page.getByRole('button').filter({hasText: 'Informe · contenido real'}).first().click();
      await page.getByRole('heading', {name:'Análisis de example.com',exact:true}).waitFor();
      assert.equal(await page.getByText('Pasos de la tarea', {exact:true}).count(), 0);
      await page.getByRole('button', {name:'Preparar pregunta sobre Descripción para buscadores',exact:true}).click();
      const dialog = page.getByRole('dialog'); await dialog.waitFor();
      const textarea = dialog.getByLabel('Pregunta y contexto', {exact:true});
      assert.match(await textarea.inputValue(), /description=\(ausente\)/);
      assert.doesNotMatch(await textarea.inputValue(), /headings=1/);
      await dialog.getByLabel('¿Qué quieres conversar?').selectOption('improve');
      assert.match(await textarea.inputValue(), /Qué cambio propondrías/);
      await textarea.fill((await textarea.inputValue()) + '\nMi pregunta adicional.');
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__copiedQuestion = text; } } }));
      await dialog.getByRole('button', {name:'Copiar pregunta y contexto',exact:true}).click();
      await dialog.getByText('Copiado. Pégalo en el chat de tu agente', {exact:true}).waitFor();
      assert.match(await page.evaluate(() => window.__copiedQuestion), /Mi pregunta adicional/);
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw Error('denied'); } } }));
      await dialog.getByRole('button', {name:'Copiar pregunta y contexto',exact:true}).click();
      await dialog.getByText('No se pudo copiar. Selecciona el texto y cópialo manualmente.', {exact:true}).waitFor();
      assert.equal(await textarea.evaluate(el => el.selectionEnd - el.selectionStart), (await textarea.inputValue()).length);
      await page.keyboard.press('Tab');
      assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)));
      await page.keyboard.press('Escape'); await dialog.waitFor({state:'hidden'});
      await page.getByRole('button', {name:'Preparar pregunta sobre el informe',exact:true}).click();
      assert.doesNotMatch(await textarea.inputValue(), /Mi pregunta adicional/);
      assert.ok(await dialog.evaluate(el => el.getBoundingClientRect().width <= innerWidth));
      // Simulate an authorization-driven lock while a modal is open.
      await page.getByRole('button', {name:'Bloquear y borrar vista',exact:true}).evaluate(el => el.click());
      await dialog.waitFor({state:'detached'});
      assert.equal(await page.getByRole('heading', {name:'Análisis de example.com',exact:true}).count(), 0);
      await page.locator('#history-access-token').fill(access.readToken);
      await page.getByRole('button', {name:'Consultar historial',exact:true}).click();
      await page.getByRole('button').filter({hasText: 'Informe · contenido real'}).first().click();
      await page.getByRole('heading', {name:'Análisis de example.com',exact:true}).waitFor();
      assert.equal(writes.length, 0, JSON.stringify(writes));
      await page.close();
      console.log('PASS browser ' + viewport.width + ': result-first, edit, copy/fallback, keyboard, lock, recovery; zero write requests');
    }
  } finally { await browser.close(); }
}
