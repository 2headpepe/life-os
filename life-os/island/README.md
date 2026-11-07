# Life OS Island

Native macOS companion for Life OS. It presents a centred, Dynamic-Island-inspired space for personal shortcuts and future context modules.

## Run

```bash
cd life-os/island
swift run
```

The first launch copies the editable action configuration to:

```text
~/Library/Application Support/LifeOSIsland/actions.json
```

The compact state is transparent, preserving the menu bar. Hover over the camera-housing area to morph into a compact shortcut strip; moving the pointer away closes it after a short delay. On a notched MacBook, shortcut controls are automatically placed below the camera housing rather than behind it. Press Escape to collapse it. The ellipsis button reveals the configuration in Finder.

## Action configuration

Each action has `url` or `command` kind. Commands run locally through `zsh -lc`; add only commands you trust.

```json
{
  "id": "daily-note",
  "title": "Daily note",
  "subtitle": "Open Obsidian note",
  "icon": "note.text",
  "kind": "command",
  "value": "open -a Obsidian"
}
```

This first prototype intentionally does not change or manage macOS system menu items or items owned by other applications.
