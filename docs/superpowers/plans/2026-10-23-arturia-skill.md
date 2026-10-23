# Arturia modular skill implementation plan

> For agentic workers: execute the approved design inline with verification checkpoints. Independent agents may evaluate skill behavior in isolated temporary directories. Do not deploy to a server.

**Goal:** Deliver a PRTS-grounded Arturia skill with independently maintainable character modules, classified sticker candidates, and working Koishi/ChatLuna exports in a private GitHub repository.

**Architecture:** Canonical Markdown modules and JSON manifests generate ChatLuna YAML and approved-only sticker mappings. A small Koishi adapter converts bounded sticker IDs into image messages. Pending candidates are visible in review artifacts only.

**Tech stack:** Python 3.11+, PyYAML, Pillow, requests/BeautifulSoup for research; JavaScript/Koishi for message rendering; pinned ChatLuna package parsing in offline validation.

**Spec:** ../../design.md

## Constraints

- Koishi compatibility is required.
- Official assets and community use evidence have separate classifications.
- The owner decides sticker suitability. Pending is the default.
- No server mutations, API key export, private group transcript publication, or artificial QQ traffic.

## Tasks

- [ ] Research PRTS revisions and extract source-bounded personality evidence into sources and references.
- [ ] Collect and decode 20–40 sticker candidates; generate per-item emotion, context, reason, provenance and hashes.
- [ ] Record baseline behavior failures from the earlier prompt and independent evaluation; implement concise behavior modules and scenario cases.
- [ ] Test approval gating, path bounds, marker rendering, and deterministic build before implementing exporter and Koishi adapter.
- [ ] Build skill, ChatLuna preset/world lore, candidate preview catalog and approved-only runtime bundle.
- [ ] Parse export with pinned ChatLuna package; independently evaluate roleplay and approval boundaries; repair observed issues.
- [ ] Inspect every image visually; run all checks, publish private repository and verify remote visibility and commit.
