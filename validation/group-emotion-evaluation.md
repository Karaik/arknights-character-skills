# Group emotion and image frequency evaluation

All dialogue in these tracked cases and results is invented synthetic content. No private group transcripts, group identifiers or credentials were used as committed fixtures. Training examples and probe phrases differ. No QQ message was sent; no production database or conversation was opened or cleared.

The revised goal is one suitable image in ordinary replies, including brief follow-ups and casual factual questions. An explicit opt-out, strict machine-readable/text-only output, serious loss/conflict, or a real emergency remains image-free. This deliberately replaces the historic assumption that all factual questions should omit images.

## Paired matrix

`group-emotion-cases.json` was fixed before baseline/candidate generation: 28 positive phrases repeated twice and 8 exclusions once (64 final responses per preset). The same real `gpt-6-luna` provider/model and installed native Skills, permissions, StructuredTool and core prompt stages were used. Parallel API requests were capped at three.

| Category | Baseline correct | Candidate correct | Candidate images |
|---|---:|---:|---:|
| deadpan | 12/20 | 20/20 | 20/20 |
| shy | 6/6 | 6/6 | 6/6 |
| knowing | 6/6 | 6/6 | 6/6 |
| smug | 4/4 | 4/4 | 4/4 |
| confused | 2/4 | 3/4 | 4/4 |
| wry | 4/4 | 4/4 | 4/4 |
| gif | 4/4 | 4/4 | 4/4 |
| casual-factual | 0/4 | 4/4 | 4/4 |
| brief-followup | 3/4 | 4/4 | 4/4 |
| explicit-optout | 1/1 | 1/1 | 0/1 |
| exact-format | 4/4 | 4/4 | 0/4 |
| serious-loss | 1/1 | 1/1 | 0/1 |
| medical-emergency | 1/1 | 1/1 | 0/1 |
| serious-conflict | 1/1 | 1/1 | 0/1 |

- Ordinary replies: image presence rose from **47/56 to 56/56**. Strict selection correctness rose from **41/56 to 55/56**.
- Tasteless/oily/entitled/repeated-joke cases: exact `arturia-react-04` rose from **12/20 to 20/20**. Baseline had four missing images and four other emotions.
- Both presets kept **8/8 true exclusion cases** image-free.
- The sole final candidate mismatch used the wry `arturia-react-02` when a request to summon an unspecified person was scored as confused `arturia-react-01`. The text asked for the missing identity. This is an adjacent-expression ambiguity, retained as a strict mismatch; the case expectation was not relaxed after seeing results.

## Transport interruption and retained attempts

The initial candidate run completed 15 responses, then 49 samples ended with `fetch failed` before final output. `group-emotion-candidate-interrupted.json` preserves every original success and transport error. A credential-safe reachability check later returned HTTP 200; the specific earlier network cause was not established.

The resume process asserted identical preset/module/case hashes, retained all 15 completed responses without regenerating them, and retried only the 49 samples without a final response, once each. The final `group-emotion-candidate.json` records `transportAttempts` (1 for retained responses; 2 for retried failures) and resume metadata. All resumed samples completed. No bad model answer was resampled or removed. The first run therefore remains a failed transport run, not a silently replaced all-pass run.

## Fresh one-shot contrasts

`group-emotion-heldout-cases.json` added 10 distinct invented cases before its first generation: praise addressed to another Doctor, other people mutually praising each other, quoted rude language for analysis, polite wording around an entitled demand, repeated boundary pushing, fake urgency, an ordinary follow-up, explicit image opt-out, serious workplace distress and a real fire emergency.

The 7 image-appropriate cases selected an allowed image; the 3 true exclusions omitted images: **10/10** marker targets met. Compliments addressed to another Doctor were not mistaken for Arturia being praised; analysis of a quoted rude phrase did not trigger an annoyed response toward the asking Doctor.

## Limits

These counts are small-sample observations, not calibrated long-term production probabilities. Automated correctness measures only the number and ID of sticker markers, not complete literary quality or every factual/safety detail in the response. Some contrast cases intentionally permit adjacent expressions via an expected-ID array.

The harness uses the actual native modules and core prompt stages with synthetic isolated history and the formal sender wrapper. Literal-template rendering is approximated by an identity renderer. It does not exercise live group history, the full running Agent loop, runtime retries, trigger admission, context-cache invalidation, or final OneBot transport. No forced tool choice is used. Tool invocations are recorded, but a correct marker does not require an extra Skill call when the formal preset already supplies the mapping.

## Hashes

- Baseline preset: `3ff3d20e4844d0b62a05497250ad18f95a5583b1e1595df61b790eb37ce0692c`
- Candidate preset: `78f6b664a521694de7f0863eef6369dd0b2eb2f198e2cbb104094f1fa810ac0d`
- Paired matrix payload: `030ae8159bfa0a11f37ec437266db8c3cc2d91cca3c9888087a203825bf679f9`
- Held-out matrix payload: `1365a8dccdada46495cefda8e52b191b4400d31abb479af8b6e1a1b9cd64b6e5`
- Installed Agent bundle: `c65b66ba6eea85fc1c7f69037a1065f7a29872ba3fa9dae76effd983d808ea11`
