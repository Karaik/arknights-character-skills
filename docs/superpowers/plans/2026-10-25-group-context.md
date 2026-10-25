# Group context implementation plan

**Goal:** In the existing Arturia ChatLuna conversations, retain the preceding 40 ordinary group messages and supply them when a user invokes the bot. All operational controls must be editable in Koishi's Web configuration. The owner authorized implementation, deployment and restart in this conversation.

**Architecture:** Add a normal local Koishi plugin, `arturia-group-context`, using ChatLuna 1.4.2's public `chatluna/message-observed` event and `contextManager.pipeline`. Preserve the current preset, native Skills, sticker renderer and reply triggers. Store only a bounded recent-message cache in Koishi's existing database; no private messages or cross-group context. Do not replace the conversation system with the separate character frontend.

**Defaults:** 40 preceding messages, 30-minute age limit, 500 characters per message, 8,000 characters per context block. Scope deployment to the same five groups as the current sticker integration. Keep passive collection free of model calls. Show Chinese field descriptions in the standard plugin configuration page.

## Tasks

- [x] Add failing synthetic tests for ten passive messages followed by an invocation, isolation, duplicate/current-message exclusion, count/age/character limits, restart restoration and prompt assembly.
- [x] Implement the plugin and its schema, bounded database storage, disposal and count-only diagnostics using installed package APIs. Mark background chatter as quoted context, keeping each sender distinct.
- [x] Verify the actual ChatLuna prompt pipeline and the Skill tool continuation with isolated synthetic inputs. Preserve current-message image input and existing conversation history.
- [x] Package the plugin as a local tarball, install with the existing Yarn runtime and enable it alongside ChatLuna. Read existing group scope on the server; never commit group identifiers or live configuration.
- [x] Restart only Koishi, verify console availability, running plugin and schema, existing native Skills/sticker assets, original history rows and bounded cache restoration.
- [x] Verify the normal Web configuration schema and authenticated save interface, and perform two isolated model comprehension tests without sending a QQ group message. The browser's fresh session was not logged in; verification uses the same console APIs, rather than claiming visual inspection of an authenticated form. Record sanitized evidence and document the Web controls.

## Verification boundaries

Synthetic tests and isolated real model calls must not create production test presets, send group messages, or clear chat history. Live readback should report counts and hashes, not transcripts, credentials or group identifiers. Read-only status must never reveal cached text.
