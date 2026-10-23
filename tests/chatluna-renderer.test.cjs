const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DefaultRenderer } = require('koishi-plugin-chatluna');
const { h } = require('koishi');
const { replaceMarkers } = require('../adapters/koishi/stickers.cjs');

test('ChatLuna 1.4.2 pure-text preserves sticker IDs for the before-send hook', async () => {
  const ctx = { scope: { isActive: false }, inject(_services, callback) { callback(this); } };
  const renderer = new DefaultRenderer(ctx, { outputMode: 'pure-text', splitMessage: 'none' });
  const result = await renderer.render({ content: '好吧。[[sticker:official-smile]]' });
  const elements = h.normalize(result[0].element);
  const text = elements.map(x => x.attrs.content || '').join('');
  assert(text.includes('[[sticker:official-smile]]'));
  // No approved catalog means the ID is removed before any platform delivery.
  assert.equal(replaceMarkers(text, '.', []).map(x => x.text || '').join(''), '好吧。');
});
