#!/usr/bin/env node
// Capture full-page screenshots of a URL at desktop + mobile viewports.
// Usage: node scripts/audit-page.mjs <url> <output-dir>
// Outputs: <output-dir>/desktop.png and <output-dir>/mobile.png

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const url = process.argv[2];
const outDir = process.argv[3];

if (!url || !outDir) {
  console.error('Usage: node scripts/audit-page.mjs <url> <output-dir>');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

for (const [name, viewport] of [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile',  { width: 390,  height: 844 }],
]) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(500); // settle animations
    const outPath = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`✓ ${name}: ${outPath}`);
  } catch (err) {
    console.error(`✗ ${name}: ${err.message}`);
  } finally {
    await ctx.close();
  }
}

await browser.close();
