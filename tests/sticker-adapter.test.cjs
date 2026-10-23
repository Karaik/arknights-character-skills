const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { resolveSticker, replaceMarkers } = require('../adapters/koishi/stickers.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arturia-stickers-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'smile.png'), 'fixture-image');
  const item = { id: 'official-smile', file: 'smile.png', review: 'pending',
    sha256: crypto.createHash('sha256').update('fixture-image').digest('hex') };
  return { root, item };
}

test('pending or rejected assets are never rendered, even with a forged marker', t => {
  const { root, item } = fixture(t);
  for (const review of ['pending', 'rejected', undefined]) {
    assert.equal(resolveSticker(root, [{ ...item, review }], item.id), null);
  }
  assert.deepEqual(replaceMarkers('[[sticker:official-smile]]', root, [item]), []);
});

test('an approved ID resolves to verified bytes, not a filesystem or public URL', t => {
  const { root, item } = fixture(t);
  item.review = 'approved';
  assert.deepEqual(resolveSticker(root, [item], item.id), Buffer.from('fixture-image'));
  const out = replaceMarkers('好吧。[[sticker:official-smile]]', root, [item]);
  assert.equal(out[0].type, 'text');
  assert.equal(out[1].type, 'image');
  assert.equal(out[1].id, item.id);
});

test('path traversal and edited images cannot bypass approval', t => {
  const { root, item } = fixture(t);
  item.review = 'approved';
  assert.equal(resolveSticker(root, [{ ...item, file: '../escape.png' }], item.id), null);
  fs.writeFileSync(path.join(root, 'smile.png'), 'changed');
  assert.equal(resolveSticker(root, [item], item.id), null);
});

test('unknown marker IDs do not become arbitrary URLs or leak marker syntax', t => {
  const { root } = fixture(t);
  assert.deepEqual(replaceMarkers('[[sticker:unknown]]', root, []), []);
  assert.deepEqual(replaceMarkers('[[sticker:https://evil.test/x]]', root, []), []);
});

test('each reply has at most one sticker and preserves surrounding text', t => {
  const { root, item } = fixture(t);
  item.review = 'approved';
  const out = replaceMarkers('前[[sticker:official-smile]]后[[sticker:official-smile]]', root, [item]);
  assert.equal(out.filter(x => x.type === 'image').length, 1);
  assert.equal(out.filter(x => x.type === 'text').map(x => x.text).join(''), '前后');
});
