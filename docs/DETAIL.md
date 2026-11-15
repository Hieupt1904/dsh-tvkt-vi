# Vietnamese technical standard (TVKT-100)

This bundle applies a controlled Vietnamese technical-writing standard to every agent in the profile, and adds an agent mode for writing and reviewing Vietnamese documents.

## What it changes

**Every mode.** A system-prompt section named `tvkt-vi:language-contract` is inserted at order `10150` — after the tool guidance, before the deployment persona suffix. It keeps identifiers untranslated, requires the four normative levels (`PHẢI`, `KHÔNG ĐƯỢC`, `NÊN`, `ĐƯỢC PHÉP`), bans machine-translation calques, and requires unverified claims to be labelled. Modes that replace the persona entirely still receive it.

**On-demand rules.** The `tvkt-vi` skill carries the 30 writing rules, 70 terms and the linter invocation. It is registered through a skill provider, so the body is read on every load: editing the skill on disk takes effect at the next load without a restart.

**The `tvkt-vi` mode.** Its preset composes the `standard` toolset plus `tool-executor-ptc`, and pairs it with a persona defining three disciplines: draft, review (report only, never edit), and rewrite (diff, approve, then apply).

## Artifacts on disk

| Path | Purpose |
|---|---|
| `skills/tvkt-vi/SKILL.md` | rule summary, three modes, output contract |
| `skills/tvkt-vi/references/` | term table, conversational extension |
| `skills/tvkt-vi/scripts/lint-text.py` | lint a passage from stdin |
| `vendor/tvkt/` | TVKT-100 v1.0 linter and its term configuration |
| `scripts/check-drift.mjs` | compares the preset with the installed `standard` and `ptc` presets |

## Verifying the install

```bash
dsh --profile <profile> --dump-config | grep -A1 'id: dsh-tvkt-vi'
node node_modules/dsh-tvkt-vi/scripts/check-drift.mjs
python3 node_modules/dsh-tvkt-vi/skills/tvkt-vi/scripts/lint-text.py --quiet README.md
```

In a session, `/skill tvkt-vi` must resolve to `node_modules/dsh-tvkt-vi/skills/tvkt-vi`. If it resolves to `~/.dsh/skills/tvkt-vi`, a hand-copied skill is shadowing the bundle's provider — remove the copy.

## Limits

The linter covers 7 of the 30 rules; the rest need reading. It counts "tiếng" by whitespace, so compound words count as several units and the 30/40-unit thresholds are guidance, not a hard rule. A passing run does not prove a document is technically correct.

The preset composition must track the `standard` preset of the installed DSH. After upgrading DSH, run `check-drift.mjs`; a row that names a module the release dropped makes the whole preset fail to load.
