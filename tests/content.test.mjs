import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { TERMS, CATS } from '../learn/terms.js';
import { SOURCES } from '../crate/sources.js';
import { SEEDS } from '../desk/projects.js';
import { ROBOTS } from '../robots-data.js';

test('learn/terms.js data integrity', () => {
  const ids = new Set();
  const learnHtml = fs.readFileSync('learn/index.html', 'utf8');

  for (const t of TERMS) {
    // unique ids
    assert.ok(!ids.has(t.id), `Duplicate term ID: ${t.id}`);
    ids.add(t.id);

    // every category valid
    assert.ok(CATS[t.cat], `Invalid category ${t.cat} in term ${t.id}`);

    // every 'see' link is https or a relative path that exists
    if (t.see) {
      if (t.see.href.startsWith('http')) {
        assert.match(t.see.href, /^https:\/\//, `Link must be HTTPS: ${t.see.href}`);
      } else {
        const p = path.join('learn', t.see.href);
        const resolved = path.resolve(p);
        assert.ok(fs.existsSync(resolved) || fs.existsSync(resolved.replace(/#.*$/, '')), `Relative link does not exist: ${t.see.href}`);
      }
    }

    // plain definition is at most 2 sentences, each at most 22 words
    const sentences = t.plain.split(/(?<=[.!?])\s+/);
    assert.ok(sentences.length <= 2, `Definition for ${t.id} has more than 2 sentences.`);
    for (const s of sentences) {
      const words = s.split(/\s+/).filter(Boolean);
      assert.ok(words.length <= 22, `Sentence in ${t.id} is too long (${words.length} words): ${s}`);
    }

    // no term id collides with learn/index.html ids
    assert.ok(!learnHtml.includes(`id="${t.id}"`), `Term ID ${t.id} collides with an ID in learn/index.html`);
  }

  // every robot term in robots.js exists in terms.js
  for (const r of ROBOTS) {
    assert.ok(ids.has(r.term), `Robot term not found in glossary: ${r.term}`);
  }
});

test('crate/sources.js data integrity', () => {
  const ids = new Set();
  for (const s of SOURCES) {
    assert.ok(!ids.has(s.id), `Duplicate source ID: ${s.id}`);
    ids.add(s.id);
    assert.ok(['high', 'check', 'age', 'make'].includes(s.trust), `Invalid trust level: ${s.trust} in ${s.id}`);
    
    if (s.url) {
      assert.match(s.url, /^https:\/\//, `Link must be HTTPS: ${s.url}`);
    }

    if (s.trust === 'high') {
      assert.ok(s.how, `High trust source ${s.id} needs a 'how'`);
      assert.ok(s.warn || s.id === 'make' || s.id === 'ccmixter', `High trust source ${s.id} needs a 'warn' or documented reason`);
    }
  }
});

test('desk/projects.js against tools/hub/hub_data.py counts', () => {
  const hubData = fs.readFileSync('tools/hub/hub_data.py', 'utf8');
  
  // Very simple parsing of the python file just to count dicts in each list
  const countDicts = (varName) => {
    const match = hubData.match(new RegExp(`${varName}\\s*=\\s*\\[(.*?)\\]`, 's'));
    if (!match) return 0;
    return (match[1].match(/dict\(/g) || []).length;
  };

  const mainCount = countDicts('MAIN');
  const wipCount = countDicts('WIP');
  const soonCount = countDicts('SOON');
  const heroCount = 1; // DEVELOPDROP is a single dict

  const seedCounts = {
    'featured': 0,
    'on the line': 0,
    'in the trays': 0,
    'roadmap': 0
  };

  for (const s of SEEDS) {
    if (seedCounts[s.group] !== undefined) {
      seedCounts[s.group]++;
    }
  }

  assert.equal(seedCounts['featured'], heroCount, 'Featured count mismatch');
  assert.equal(seedCounts['on the line'], mainCount, 'Main count mismatch');
  assert.equal(seedCounts['in the trays'], wipCount, 'WIP count mismatch');
  assert.equal(seedCounts['roadmap'], soonCount, 'Roadmap count mismatch');
});

test('No shipped JS or HTML contains eval, new Function, document.write, or inline events', () => {
  const checkFile = (filepath) => {
    const content = fs.readFileSync(filepath, 'utf8');
    assert.ok(!/(^|[^\w.])eval\(/.test(content), `eval() found in ${filepath}`);
    assert.ok(!content.includes('new Function('), `new Function() found in ${filepath}`);
    assert.ok(!content.includes('document.write('), `document.write() found in ${filepath}`);
    // Check for inline on*= events in HTML tags
    if (filepath.endsWith('.html')) {
        assert.ok(!/<[^>]+?\\son[a-z]+=/i.test(content), `Inline event handler found in ${filepath}`);
    }
  };

  // Only the pages this repository ships for the hub and its tools. Never backups, docs, other projects or dependencies.
  const ROOTS = ['kit', 'learn', 'desk', 'crate', 'vr'];
  const SKIP = new Set(['tests', 'node_modules', '.git']);
  const walk = (dir) => {
    for (const file of fs.readdirSync(dir)) {
      const p = path.join(dir, file);
      if (SKIP.has(file)) continue;
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.js') || p.endsWith('.mjs') || p.endsWith('.html')) checkFile(p);
    }
  };
  for (const r of ROOTS) if (fs.existsSync(r)) walk(r);
  for (const f of fs.readdirSync('.')) if (/\.(js|html)$/.test(f)) checkFile(f);                 // the root pages and scripts, not folders
});
