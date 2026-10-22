# Mermaid Focus

A small Obsidian plugin for rendered Mermaid diagrams in Live Preview and Reading view

- Diagrams fit the full pane width, with no side padding or border
- Hover or use keyboard focus to reveal the bottom toolbar: zoom out, fit, zoom in, view code, open in a new tab
- Extra space around each diagram lets you bring its edges to the center; embeds fade clipped top and bottom edges, while diagram tabs have no fades
- In embeds, drag to pan and hold Ctrl/Cmd while scrolling to zoom under the pointer; ordinary scrolling moves the note and briefly shows a reminder
- In diagram tabs, drag to pan and scroll to zoom without a modifier; the toolbar contains only zoom and fit controls
- Keyboard: Tab to the diagram, `+` / `-` to zoom, `0` for 100%, `F` to fit
- Diagram tabs use Obsidian's normal tab controls and can move into a separate window

## Install manually

1. Download this repository
2. Create `.obsidian/plugins/mermaid-focus/` inside your vault
3. Copy `main.js`, `styles.css`, and `manifest.json` into that folder
4. Restart Obsidian and enable **Mermaid Focus** in Settings → Community plugins

No build step is needed: `main.js` is the readable source. To update, copy the three files again and reload the plugin

## Status

An early version developed and tested on Obsidian 1.14.4 for Windows. Mobile and older Obsidian versions have not been verified. This repository provides manual installation; the plugin is not listed in the community directory

Uses Obsidian's Mermaid renderer, CodeMirror, and plugin API. No external dependencies, network requests, telemetry, or note writes. Disabling the plugin removes its controls and restores the original diagram elements and code buttons

Diagram tabs retain the selected Mermaid source in their workspace state so they reopen after a restart. Reopen a diagram from its note to pick up source edits

Rendered blocks depend on Obsidian's DOM structure, so future Obsidian or theme updates may need a small compatibility adjustment. Source mode remains the ordinary Markdown editor

API references: [Plugin lifecycle](https://docs.obsidian.md/plugins/guides/lifecycle-management) · [Obsidian API](https://github.com/obsidianmd/obsidian-api)
