# Approved design and acceptance criteria

Approved by the owner on 2026-10-23 (Asia/Tokyo). Implementation follows the previously presented modular roleplay skill plan, with these additions: Koishi compatibility is required; sticker candidates prioritize official releases and demonstrably common community memes; every candidate must identify its emotion, source, selection reason, and usage rationale for owner review.

## Deliverables

1. A new repository at D:\Code\arknights-character-skills, published privately as Karaik/arknights-character-skills.
2. A compact Arturia SKILL.md plus separate identity, personality, voice, relationships, lore, behavioral, and example references.
3. Research from PRTS operator profile, voice records, modules and directly relevant story sources. Facts, interpretations, and original group-chat adaptations remain distinguishable.
4. Approximately 20–40 useful sticker candidates, quality permitting. Actual files, hashes, provenance and emotion metadata; visual contact sheets and a review catalog. Pending items never enter live exports.
5. A deterministic exporter for ordinary ChatLuna presets and world lore, a standard Skills package, and a MemesLuna-compatible approved image collection. A local Koishi adapter handles controlled sticker selection and rendering without giving arbitrary file or shell access.
6. Meaningful checks of source coverage, link integrity, image decoding, review gating, deterministic generation, and actual ChatLuna preset parsing; model behavior checks separate from structural validation.
7. No live server deployment, plugin installation, config reload, context deletion, or QQ test messages.

## Design

Keep one canonical modular source. Common runtime personality is always present in ordinary ChatLuna exports; detailed lore is triggered by relevant keywords. SKILL.md routes to references progressively. Group-specific state and credentials are local overlays excluded from Git. Sticker policy references a candidate manifest and only exposes owner-approved items.

The repository is a roleplay skill library. It is not a replacement for Koishi/NapCat, an unrestricted agent, or a guarantee of identical model behavior.
