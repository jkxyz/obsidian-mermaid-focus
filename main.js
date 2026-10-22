const { Plugin, ItemView, MarkdownRenderer, Notice, Platform, setIcon } = require("obsidian");
const { EditorView } = require("@codemirror/view");
const VIEW = "mermaid-focus-view";
let labelId = 0;

function iconButton(parent, label, icon, action) {
	const el = parent.createEl("button", { cls: "clickable-icon", attr: { type: "button", "aria-label": label, "data-tooltip-position": "top" } });
	setIcon(el, icon);
	el.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		action();
	});
	return el;
}

// Native scrolling supplies bounded panning. Half a viewport of space on each
// side lets even an edge of the diagram reach the center, without an endless canvas.
class DiagramCanvas {
	constructor(host, svg, { embedded = false, open } = {}) {
		this.host = host;
		this.svg = svg;
		this.embedded = embedded;
		this.scale = 1;
		this.fitted = true;
		const box = svg.viewBox.baseVal;
		this.size = { width: box.width || svg.getBoundingClientRect().width, height: box.height || svg.getBoundingClientRect().height };
		host.addClass("mermaid-focus-surface");
		this.label = host.createSpan({ cls: "mermaid-focus-sr", text: `Mermaid diagram. Drag to pan. ${embedded ? "Hold Control or Command and scroll to zoom. " : "Scroll to zoom. "}Plus and minus zoom, F fits, zero restores actual size.`, attr: { id: `mf-label-${++labelId}` } });
		// aria-labelledby provides an accessible name without Obsidian's aria-label tooltip.
		this.viewport = host.createDiv({ cls: "mermaid-focus-canvas", attr: { tabindex: "0", role: "region", "aria-labelledby": this.label.id } });
		this.stage = this.viewport.createDiv({ cls: "mermaid-focus-stage" });
		this.stage.appendChild(svg);
		if (embedded) this.hint = host.createDiv({ cls: "mermaid-focus-hint", text: `Hold ${Platform.isMacOS ? "⌘" : "Ctrl"} to zoom`, attr: { "aria-hidden": "true" } });
		this.toolbar = host.createDiv({ cls: "mermaid-focus-toolbar", attr: { role: "toolbar" } });
		iconButton(this.toolbar, "Zoom out", "minus", () => this.zoom(this.scale / 1.25));
		this.fitButton = iconButton(this.toolbar, "Fit diagram", "scan", () => this.fit());
		iconButton(this.toolbar, "Zoom in", "plus", () => this.zoom(this.scale * 1.25));
		if (open) this.toolbar.createSpan({ cls: "mermaid-focus-separator" });
		if (open) this.openButton = iconButton(this.toolbar, "Open diagram in new tab", "external-link", open);
		this.toolbar.addEventListener("mousedown", (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		this.viewport.addEventListener("wheel", (event) => {
			if (embedded && !event.ctrlKey && !event.metaKey) {
				this.showHint();
				return; // overflow:hidden lets the note receive the browser's normal scroll.
			}
			event.preventDefault();
			this.hideHint();
			const rect = this.viewport.getBoundingClientRect();
			const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 300 : 1);
			this.zoom(this.scale * Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.003), event.clientX - rect.left, event.clientY - rect.top);
		}, { passive: false });
		this.viewport.addEventListener("keydown", (event) => {
			if (event.key === "+" || event.key === "=") this.zoom(this.scale * 1.25);
			else if (event.key === "-") this.zoom(this.scale / 1.25);
			else if (event.key === "0") this.zoom(1);
			else if (event.key.toLowerCase() === "f") this.fit();
			else return;
			event.preventDefault();
			event.stopPropagation();
		});
		this.viewport.addEventListener("pointerdown", (event) => {
			if (event.button !== 0 || event.target.closest("a")) return;
			event.preventDefault();
			event.stopPropagation();
			this.hideHint();
			this.viewport.focus({ preventScroll: true });
			this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: this.viewport.scrollLeft, top: this.viewport.scrollTop };
			this.viewport.setPointerCapture(event.pointerId);
			this.viewport.addClass("is-panning");
		});
		this.viewport.addEventListener("pointermove", (event) => {
			if (this.drag?.id !== event.pointerId) return;
			this.viewport.scrollLeft = this.drag.left + this.drag.x - event.clientX;
			this.viewport.scrollTop = this.drag.top + this.drag.y - event.clientY;
		});
		this.viewport.addEventListener("lostpointercapture", () => {
			this.drag = null;
			this.viewport.removeClass("is-panning");
		});
		this.viewport.addEventListener("scroll", () => this.updateEdges(), { passive: true });
		const win = this.win = host.ownerDocument.defaultView;
		this.resize = new win.ResizeObserver(() => {
			if (!this.viewport.clientWidth || !this.viewport.clientHeight) return;
			if (this.fitted) this.fit();
			else this.draw();
		});
		this.resize.observe(this.viewport);
	}

	fit() {
		if (!this.viewport.clientWidth || !this.viewport.clientHeight) return;
		this.scale = Math.max(0.01, Math.min(1, this.viewport.clientWidth / this.size.width, (this.viewport.clientHeight - 96) / this.size.height));
		this.fitted = true;
		this.draw();
		this.viewport.scrollLeft = this.size.width * this.scale / 2;
		this.viewport.scrollTop = this.size.height * this.scale / 2;
		this.updateEdges();
	}

	draw() {
		this.stage.style.setProperty("--mf-diagram-width", `${this.size.width * this.scale}px`);
		this.stage.style.setProperty("--mf-diagram-height", `${this.size.height * this.scale}px`);
		this.stage.style.setProperty("--mf-padding-x", `${this.viewport.clientWidth / 2}px`);
		this.stage.style.setProperty("--mf-padding-y", `${this.viewport.clientHeight / 2}px`);
		this.fitButton.setAttribute("aria-label", `Fit diagram · ${Math.round(this.scale * 100)}%`);
		this.updateEdges();
	}

	zoom(value, x = this.viewport.clientWidth / 2, y = this.viewport.clientHeight / 2) {
		const worldX = (this.viewport.scrollLeft + x - this.viewport.clientWidth / 2) / this.scale;
		const worldY = (this.viewport.scrollTop + y - this.viewport.clientHeight / 2) / this.scale;
		this.scale = Math.max(0.01, Math.min(8, value));
		this.fitted = false;
		this.draw();
		this.viewport.scrollLeft = worldX * this.scale + this.viewport.clientWidth / 2 - x;
		this.viewport.scrollTop = worldY * this.scale + this.viewport.clientHeight / 2 - y;
		this.updateEdges();
	}

	updateEdges() {
		const { clientHeight: height, scrollTop } = this.viewport;
		const top = height / 2 - scrollTop;
		const clipped = { top: top < -1, bottom: top + this.size.height * this.scale > height + 1 };
		for (const [edge, hidden] of Object.entries(clipped)) this.viewport.style.setProperty(`--mf-fade-${edge}`, hidden ? "28px" : "0px");
	}

	showHint() {
		if (!this.hint) return;
		this.win.clearTimeout(this.hintTimer);
		this.hint.addClass("is-visible");
		this.hintTimer = this.win.setTimeout(() => this.hideHint(), 1400);
	}

	hideHint() {
		this.win?.clearTimeout(this.hintTimer);
		this.hint?.removeClass("is-visible");
	}

	destroy() {
		this.resize.disconnect();
		this.hideHint();
		if (this.stage.contains(this.svg)) this.viewport.before(this.svg);
		this.viewport.remove();
		this.toolbar.remove();
		this.label.remove();
		this.hint?.remove();
		this.host.removeClass("mermaid-focus-surface");
	}
}

class DiagramView extends ItemView {
	getViewType() { return VIEW; }
	getIcon() { return "workflow"; }
	getDisplayText() { return this.state?.sourcePath ? `${this.state.sourcePath.split("/").pop().replace(/\.md$/, "")} · Diagram` : "Diagram"; }
	getState() { return this.state || {}; }

	async setState(state, result) {
		const generation = this.generation = (this.generation || 0) + 1;
		this.state = state;
		this.canvas?.destroy();
		this.contentEl.empty();
		this.contentEl.addClass("mermaid-focus-view");
		if (state.source) {
			await MarkdownRenderer.render(this.app, state.source, this.contentEl, state.sourcePath || "", this);
			if (generation !== this.generation) return;
			const svg = this.contentEl.querySelector(".mermaid > svg");
			if (svg) {
				const host = svg.parentElement;
				this.canvas = new DiagramCanvas(host, svg);
			}
		} else this.contentEl.createDiv({ text: "Open a diagram from a note to view it here." });
		await super.setState(state, result);
	}

	async onClose() { this.generation = (this.generation || 0) + 1; this.canvas?.destroy(); }
}

module.exports = class MermaidFocus extends Plugin {
	onload() {
		this.views = new Map();
		this.records = new Map();
		this.contexts = new WeakMap();
		this.stopped = false;
		this.registerView(VIEW, (leaf) => new DiagramView(leaf));
		this.registerMarkdownPostProcessor((el, ctx) => this.contexts.set(el, ctx));
		this.registerEvent(this.app.workspace.on("layout-change", () => this.watchViews()));
		this.app.workspace.onLayoutReady(() => {
			if (this.stopped) return;
			this.watchViews();
			// Populate section contexts for notes that were already open on plugin load.
			for (const leaf of this.app.workspace.getLeavesOfType("markdown")) leaf.view.previewMode?.rerender(true);
		});
	}

	watchViews() {
		const roots = new Set();
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view.getViewType() !== "markdown") return;
			const root = leaf.view.contentEl;
			if (!root) return;
			roots.add(root);
			if (this.views.has(root)) return;
			const win = root.ownerDocument.defaultView;
			const state = { win, leaf, frame: null };
			state.schedule = () => {
				if (state.frame !== null || this.stopped) return;
				state.frame = win.requestAnimationFrame(() => { state.frame = null; this.scan(root); });
			};
			state.mutations = new win.MutationObserver(state.schedule);
			state.mutations.observe(root, { childList: true, subtree: true });
			state.resize = new win.ResizeObserver(state.schedule);
			state.resize.observe(root);
			this.views.set(root, state);
		});
		for (const [root, state] of this.views) {
			if (roots.has(root)) state.schedule();
			else {
				state.mutations.disconnect();
				state.resize.disconnect();
				state.win.cancelAnimationFrame(state.frame);
				this.views.delete(root);
			}
		}
		for (const record of this.records.values()) if (!roots.has(record.root)) this.remove(record);
	}

	scan(root) {
		for (const record of this.records.values()) {
			if (record.root === root && (!root.contains(record.el) || !record.canvas.stage.contains(record.svg) || !record.el.contains(record.canvas.viewport))) this.remove(record);
		}
		for (const el of root.querySelectorAll(".mermaid")) {
			if (!el.getBoundingClientRect().width) continue;
			let record = this.records.get(el);
			if (!record) {
				const svg = el.querySelector(":scope > svg");
				if (!svg || !svg.viewBox.baseVal.width || !svg.viewBox.baseVal.height) continue;
				const block = el.closest(".cm-preview-code-block, .el-pre") || el;
				const pane = el.closest(".cm-scroller, .markdown-preview-view");
				if (!pane) continue;
				el.addClass("mermaid-focus-embed");
				block.addClass("mermaid-focus-block");
				record = { root, el, svg, block, pane };
				record.canvas = new DiagramCanvas(el, svg, { embedded: true, open: () => this.openDiagram(record) });
				this.records.set(el, record);
			}
			this.attachCodeButton(record);
			this.layout(record);
		}
	}

	attachCodeButton(record) {
		if (record.code) return;
		const code = record.block.querySelector(".edit-block-button");
		if (!code) {
			if (!record.codeProxy && !record.pane.matches(".cm-scroller")) {
				record.codeProxy = iconButton(record.canvas.toolbar, "View code", "code-2", () => this.editSource(record));
				record.canvas.toolbar.insertBefore(record.codeProxy, record.canvas.openButton);
			}
			return;
		}
		record.codeProxy?.remove();
		record.code = { el: code, parent: code.parentElement, next: code.nextSibling, role: code.getAttribute("role"), tabindex: code.getAttribute("tabindex"), tooltip: code.getAttribute("data-tooltip-position") };
		code.setAttribute("role", "button");
		code.setAttribute("tabindex", "0");
		code.setAttribute("data-tooltip-position", "top");
		record.code.keydown = (event) => {
			if (event.key === "Enter" || event.key === " ") { event.preventDefault(); code.click(); }
		};
		code.addEventListener("keydown", record.code.keydown);
		record.canvas.toolbar.insertBefore(code, record.canvas.openButton);
	}

	layout({ block, pane, canvas }) {
		if (!pane.clientWidth) return;
		const win = block.ownerDocument.defaultView;
		const margin = parseFloat(win.getComputedStyle(block).marginLeft) || 0;
		const shift = margin + pane.getBoundingClientRect().left + pane.clientLeft - block.getBoundingClientRect().left - pane.scrollLeft;
		const width = pane.clientWidth;
		block.style.setProperty("--mf-width", `${width}px`);
		block.style.setProperty("--mf-offset", `${shift}px`);
		block.style.setProperty("--mf-height", `${Math.max(180, Math.min(640, pane.clientHeight * 0.7, canvas.size.height + 96))}px`);
	}

	sourceFor(record) {
		let text, line;
		const view = this.views.get(record.root).leaf.view;
		if (record.pane.matches(".cm-scroller")) {
			const editor = EditorView.findFromDOM(record.block);
			line = editor.state.doc.lineAt(editor.posAtDOM(record.block)).number - 1;
			text = editor.state.doc.toString();
		} else {
			for (let el = record.el; el && el !== record.root; el = el.parentElement) {
				const ctx = this.contexts.get(el);
				const info = ctx?.getSectionInfo(el);
				if (info) { text = info.text; line = info.lineStart; break; }
			}
		}
		if (text == null || line == null) throw new Error("Reopen the note to refresh this diagram's source location.");
		const lines = text.split("\n");
		const fence = lines[line]?.match(/^\s*(`{3,}|~{3,})mermaid\s*$/i);
		if (!fence) throw new Error("The diagram source has changed. Reopen the note and try again.");
		const close = new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`);
		let end = line + 1;
		while (end < lines.length && !close.test(lines[end])) end++;
		return { sourcePath: view.file.path, line, source: lines.slice(line, end + 1).join("\n") };
	}

	async openDiagram(record) {
		try {
			const state = this.sourceFor(record);
			const existing = this.app.workspace.getLeavesOfType(VIEW).find((leaf) => {
				const saved = leaf.getViewState().state;
				return saved?.sourcePath === state.sourcePath && saved?.source === state.source;
			});
			const leaf = existing || this.app.workspace.getLeaf("tab");
			if (!existing) await leaf.setViewState({ type: VIEW, state });
			await this.app.workspace.revealLeaf(leaf);
		} catch (error) { new Notice(error.message); }
	}

	async editSource(record) {
		try {
			const source = this.sourceFor(record);
			const leaf = this.views.get(record.root).leaf;
			await leaf.setViewState({ type: "markdown", state: { file: source.sourcePath, mode: "source", source: false } });
			await this.app.workspace.revealLeaf(leaf);
			const pos = { line: source.line + 1, ch: 0 };
			leaf.view.editor.setCursor(pos);
			leaf.view.editor.scrollIntoView({ from: pos, to: pos }, true);
		} catch (error) { new Notice(error.message); }
	}

	remove(record) {
		if (record.code) {
			const { el, parent, next, role, tabindex, tooltip, keydown } = record.code;
			el.removeEventListener("keydown", keydown);
			if (role === null) el.removeAttribute("role"); else el.setAttribute("role", role);
			if (tabindex === null) el.removeAttribute("tabindex"); else el.setAttribute("tabindex", tabindex);
			if (tooltip === null) el.removeAttribute("data-tooltip-position"); else el.setAttribute("data-tooltip-position", tooltip);
			parent.insertBefore(el, next?.parentNode === parent ? next : null);
		}
		record.canvas.destroy();
		record.el.removeClass("mermaid-focus-embed");
		record.block.removeClass("mermaid-focus-block");
		for (const prop of ["--mf-width", "--mf-offset", "--mf-height"]) record.block.style.removeProperty(prop);
		this.records.delete(record.el);
	}

	onunload() {
		this.stopped = true;
		for (const state of this.views.values()) {
			state.mutations.disconnect();
			state.resize.disconnect();
			state.win.cancelAnimationFrame(state.frame);
		}
		for (const record of this.records.values()) this.remove(record);
		this.views.clear();
	}
};
