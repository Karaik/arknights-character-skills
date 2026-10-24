# Natural sticker selection evaluation

Baseline preset SHA256: `5051ba6f7d19467f2d2fb0422a5fc59bac11ea88c953fb41a8f7100ca00d2745`.
Candidate preset SHA256: `18bcc39bd177bdb5c244dcc3ec07a83e26b4ba20c3641be84bfbbf8ab494ed24`.

The 54-case matrix was fixed before candidate generations. Each sticker has three natural positive utterances with two independent generations. Controls and contextual cases each have one generation. Supplemental candidate-only boundaries were separately fixed before their generations. No prompt used explicit image commands or a forced Skill call.

| Expected sticker | Baseline correct | Candidate correct | Candidate image selected |
|---|---:|---:|---:|
| arturia-react-01 | 0/6 | 5/6 | 5/6 |
| arturia-react-02 | 0/6 | 4/6 | 6/6 |
| arturia-react-03 | 1/6 | 5/6 | 6/6 |
| arturia-react-04 | 0/6 | 6/6 | 6/6 |
| arturia-react-05 | 1/6 | 6/6 | 6/6 |
| arturia-react-06 | 0/6 | 6/6 | 6/6 |
| arturia-sway-01 | 0/6 | 6/6 | 6/6 |

Baseline positive exact selection was 2/42; candidate was 38/42, with 41/42 producing one approved image. Text-only controls were 8/8 for both; primary contextual cases improved from 2/4 to 4/4. Supplemental candidate-only boundaries were 11/11. Zero API/tool-loop errors were observed.

## Remaining ambiguity and miss

- `confused-1`, first candidate attempt: model gave a useful clarification request without an image. Second attempt selected react-01.
- `wry-3`, both attempts: selected react-05 instead of predeclared react-02. The phrase ends with a teasing “拿我没办法了吧”; the model plausibly turns it back on the speaker. It remains counted as wrong under the fixed exact-label rubric.
- `shy-2`, second attempt: selected react-06 instead of react-03 while openly acknowledging care. That is an adjacent plausible interpretation; it remains counted as wrong under the fixed exact-label rubric.

## Runtime scope and limits

The harness executes installed native Skills, permissions, StructuredTool, tool catalog and core prompt assembly (system/history/authors-note/injections), with the formal sender wrapper. Literal preset/note rendering uses an identity adapter; synthetic sender fields replace only the three asserted placeholders. Model route credentials are read in memory and are never logged or saved.

The process does not load a live Koishi plugin, read chat databases, send QQ messages, modify production configuration, force tool choice, or reset chat history. Native tool calls use undefined conversationId, preventing persistent activation state. Temporary module state is removed on exit.

These are small synthetic, independent conversation samples on the configured gpt-6-luna route. They are evidence of improved prompt behavior, not a calibrated production probability or an end-to-end QQ delivery guarantee. Existing long group histories, cache and production retry logic can differ. Supplemental cases include ten alternating text-only history turns, opt-outs, quoted requests, real help, repeated image behavior and separate Doctor identities.

## Rule refinement candidate v2

Preset SHA256: `54e06d9e64120f6287720f7129c233e719c0b31c8c45d7ac3c0c694ff2d2d4a3`. The first candidate evidence above remains unchanged; v2 was a rule-level refinement and no test sentences were added as training examples.

| Expected sticker | Candidate v1 correct | Candidate v2 correct |
|---|---:|---:|
| arturia-react-01 | 5/6 | 6/6 |
| arturia-react-02 | 4/6 | 3/6 |
| arturia-react-03 | 5/6 | 6/6 |
| arturia-react-04 | 6/6 | 6/6 |
| arturia-react-05 | 6/6 | 6/6 |
| arturia-react-06 | 6/6 | 6/6 |
| arturia-sway-01 | 6/6 | 6/6 |

V2 exact positive selection was 39/42, with 41/42 producing an image. All 8 text-only controls and all 4 primary context cases passed. The supplemental boundary set was 10/11: greeting plus an HTTP 502 question included an unwanted welcome GIF. The factual answer itself was correct. This is a prompt-selection regression, not a transport failure.

A separate 9-case fresh paraphrase set was fixed before v2 generations: react-01 2/3, react-02 2/3, react-03 3/3. The missed cases asked about a shared confusing riddle and described mixing up salt and sugar in coffee; both produced relevant prose without an image. The latter loaded comfort despite being a minor mishap. Across the v2 positive matrix plus fresh paraphrases, exact selection was 46/51.

V2 residual misses: one minor spilled-tea story omitted react-02; the teasing late-sleeper sentence selected react-04/react-05 in two samples instead of the predeclared react-02. Original labels were retained. These show remaining overlap between gentle teasing, wry frustration and comfort, and do not justify claiming reliable exact routing for every natural utterance.

## Reproducing an isolated run

Use `python validation/run-natural-sticker-probe.py --preset <formal-yml> --modules <native-root> --cases <case-json> --output <result-json> --label <label> --host <saved-ssh-alias>`. It streams the payload and script through stdin, creates no remote script/preset, and caps API concurrency at three. Result hashes bind each run to its preset, seven native modules, matrix, and installed native Agent bundle.

## Final bounded refinement candidate v3

Preset SHA256: `3ff3d20e4844d0b62a05497250ad18f95a5583b1e1595df61b790eb37ce0692c`. V3 adds a distinction between harmless social mishaps and genuine distress, a separate minor-mishap example, a mixed greeting/factual-question negative example, and a short authors-note selection check. No evaluation sentence was copied into a training example.

| Expected sticker | Baseline correct | V1 correct | V2 correct | V3 correct | V3 image selected |
|---|---:|---:|---:|---:|---:|
| arturia-react-01 | 0/6 | 5/6 | 6/6 | 6/6 | 6/6 |
| arturia-react-02 | 0/6 | 4/6 | 3/6 | 6/6 | 6/6 |
| arturia-react-03 | 1/6 | 5/6 | 6/6 | 5/6 | 6/6 |
| arturia-react-04 | 0/6 | 6/6 | 6/6 | 5/6 | 6/6 |
| arturia-react-05 | 1/6 | 6/6 | 6/6 | 6/6 | 6/6 |
| arturia-react-06 | 0/6 | 6/6 | 6/6 | 6/6 | 6/6 |
| arturia-sway-01 | 0/6 | 6/6 | 6/6 | 6/6 | 6/6 |

The fixed 54-case regression suite produced 40/42 exact positive selections, with 42/42 containing one approved image; all 8 text-only controls and all 4 primary contextual cases passed. The 11 supplemental boundaries passed, including greeting plus factual question and long text-only histories. No request/tool-loop errors occurred.

The two remaining exact-label disagreements were adjacent emotions: one exposed-care response selected knowing-smile react-06 instead of shy react-03; one running-video joke selected wry react-02 instead of deadpan react-04. They are retained as wrong markers in the strict rubric. No resampling was used to replace them.

A new separately predeclared 9-case set, not used for v3 prompt refinement, passed 9/9: three new confused paraphrases, three new harmless-mishap/impossible-request paraphrases, and three mixed factual requests. Across the fixed and fresh v3 positive samples, exact selection was 46/48 with 48/48 containing an image. These totals combine a regression set with a fresh set and are not a production probability.

The 54-case matrix was independently fixed before v1, but v2/v3 refinements explicitly used earlier failure categories. It should therefore be read as a fixed regression suite for those later versions, not an untouched blind test. The fresh v3 9-case set provides limited independent paraphrase evidence. Earlier version failures and boundary regressions remain in their original JSON files.
