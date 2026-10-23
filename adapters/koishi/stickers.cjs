'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { h, Schema } = require('koishi');

const inside = (root, file) => {
  const relative = path.relative(root, file);
  return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
};

function resolveSticker(root, catalog, id) {
  const item = catalog.find(x => x.id === id && x.review === 'approved');
  if (!item || typeof item.file !== 'string' || !/^[a-z0-9-]+$/.test(id)) return null;
  try {
    const base = fs.realpathSync(root);
    const target = fs.realpathSync(path.resolve(base, item.file));
    if (!inside(base, target) || fs.statSync(target).size > 5 * 1024 * 1024) return null;
    const bytes = fs.readFileSync(target);
    const actual = crypto.createHash('sha256').update(bytes).digest('hex');
    return actual === item.sha256 ? bytes : null;
  } catch { return null; }
}

function replaceMarkers(text, root, catalog) {
  const output = [];
  const marker = /\[\[sticker:([^\]\r\n]{0,256})\]\]/g;
  let previous = 0, images = 0;
  for (const match of text.matchAll(marker)) {
    if (match.index > previous) output.push({ type: 'text', text: text.slice(previous, match.index) });
    const data = images ? null : resolveSticker(root, catalog, match[1]);
    if (data) { output.push({ type: 'image', data, id: match[1] }); images++; }
    previous = match.index + match[0].length;
  }
  if (previous < text.length) output.push({ type: 'text', text: text.slice(previous) });
  return output;
}

function apply(ctx, config) {
  const manifestFile = path.resolve(ctx.baseDir, config.manifestPath);
  const bundleRoot = path.dirname(manifestFile);
  const data = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (data.schema_version !== 1 || !Array.isArray(data.stickers)) throw new Error('Unsupported sticker manifest');
  const allowed = new Set(config.allowedGuilds || []);
  ctx.on('before-send', session => {
    if (session.platform !== 'onebot' || !allowed.has(session.guildId)) return;
    let used = false;
    const transform = elements => elements.flatMap(element => {
      if (element.type === 'text') {
        return replaceMarkers(element.attrs.content || '', bundleRoot, data.stickers).flatMap(part => {
          if (part.type === 'text') return h.text(part.text);
          if (used) return [];
          used = true;
          return h.image(part.data, 'image/png');
        });
      }
      if (element.children?.length) element.children = transform(element.children);
      return element;
    });
    session.elements = transform(session.elements || []);
    if (!session.elements.length) return true;
  });
}

exports.name = 'arturia-reviewed-stickers';
exports.Config = Schema.object({
  manifestPath: Schema.string().required().description('Approved runtime manifest, resolved relative to Koishi baseDir'),
  allowedGuilds: Schema.array(Schema.string()).default([]).description('Only these OneBot groups; empty means disabled')
});
exports.apply = apply;
exports.resolveSticker = resolveSticker;
exports.replaceMarkers = replaceMarkers;
