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
  const item = catalog.find(x => x.id === id && x.review === 'approved' && ['generic','arturia'].includes(x.subject_scope));
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
    if (data) {
      const item = catalog.find(x => x.id === match[1] && x.review === 'approved');
      const mime = { '.png':'image/png', '.gif':'image/gif', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp' }[path.extname(item.file).toLowerCase()];
      if (mime) { output.push({ type: 'image', data, id: match[1], mime }); images++; }
    }
    previous = match.index + match[0].length;
  }
  if (previous < text.length) output.push({ type: 'text', text: text.slice(previous) });
  return output;
}

function apply(ctx, config) {
  const manifestFile = path.resolve(ctx.baseDir, config.manifestPath);
  const bundleRoot = path.dirname(manifestFile);
  const readManifest = () => {
    const data = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (data.schema_version !== 1 || !Array.isArray(data.stickers)) throw new Error('Unsupported sticker manifest');
    return data.stickers;
  };
  readManifest(); // Fail clearly if the initial configuration is invalid.
  const allowed = new Set(config.allowedGuilds || []);
  const hasMarker = elements => elements.some(e => e.type === 'text' ? (e.attrs.content || '').includes('[[sticker:') : hasMarker(e.children || []));
  const meaningful = elements => elements.some(e => {
    if (e.type === 'quote') return false;
    if (e.type === 'text') return !!(e.attrs.content || '').trim();
    if (['message','p','span'].includes(e.type)) return meaningful(e.children || []);
    return true;
  });
  ctx.on('before-send', session => {
    if (session.platform !== 'onebot' || !allowed.has(session.guildId)) return;
    if (!hasMarker(session.elements || [])) return;
    let catalog;
    try { catalog = readManifest(); } catch { catalog = []; } // A revoked or broken manifest never reuses old approval.
    let used = false;
    const transform = elements => elements.flatMap(element => {
      if (element.type === 'text') {
        return replaceMarkers(element.attrs.content || '', bundleRoot, catalog).flatMap(part => {
          if (part.type === 'text') return h.text(part.text);
          if (used) return [];
          used = true;
          return h.image(part.data, part.mime);
        });
      }
      if (element.children?.length) element.children = transform(element.children);
      return element;
    });
    session.elements = transform(session.elements || []);
    if (!meaningful(session.elements)) return true;
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
