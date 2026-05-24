var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => CollectorsPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian7 = require("obsidian");

// src/DashboardView.ts
var import_obsidian5 = require("obsidian");

// src/parser.ts
var CHECKBOX_PATTERN = /<input type="checkbox"/;
async function parseCollectionFile(file, vault) {
  const content = await vault.read(file);
  let collectionType = "custom";
  let setCode;
  let scryfallQuery;
  let scryfallOrder;
  let autoUpdate = false;
  let collectionName = file.basename;
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fmLines = fmMatch[1].split("\n");
    for (const line of fmLines) {
      const [key, ...rest] = line.split(":");
      const val = rest.join(":").trim();
      switch (key.trim()) {
        case "collection-type":
          collectionType = val;
          break;
        case "collection-name":
          collectionName = val;
          break;
        case "set-code":
          setCode = val;
          break;
        case "scryfall-query":
          scryfallQuery = val;
          break;
        case "scryfall-order":
          scryfallOrder = val;
          break;
        case "auto-update":
          autoUpdate = val === "true";
          break;
      }
    }
  }
  if (!CHECKBOX_PATTERN.test(content)) return null;
  const cards = parseCards(content);
  if (cards.length === 0) return null;
  return {
    name: collectionName,
    path: file.path,
    type: collectionType,
    setCode,
    scryfallQuery,
    scryfallOrder,
    autoUpdate,
    cards,
    owned: cards.filter((c) => c.owned).length,
    total: cards.length
  };
}
function parseCards(content) {
  const cards = [];
  for (const line of content.split("\n")) {
    if (!CHECKBOX_PATTERN.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 7) continue;
    const checkboxCell = cells[0];
    const idMatch = checkboxCell.match(/id="([^"]+)"/);
    const id = idMatch ? idMatch[1] : Math.random().toString(36).slice(2);
    const owned = checkboxCell.includes("checked") && !checkboxCell.includes("unchecked");
    const imageMatch = cells[1].match(/!\[.*?\]\((.*?)\)/);
    const imageUrl = imageMatch ? imageMatch[1] : "";
    cards.push({
      id,
      owned,
      name: cells[2] || "",
      type: cells[3] || "",
      rarity: cells[4] || "",
      set: cells[5] || "",
      number: cells[6] || "",
      imageUrl,
      notes: cells[7] || ""
    });
  }
  return cards;
}
function finishSuffix(name, id) {
  if (id.endsWith("_f")) return "_f";
  if (id.endsWith("_n")) return "_n";
  if (name.includes("(Foil)")) return "_f";
  if (name.includes("(Normal)")) return "_n";
  return "";
}
function getExistingCardKeys(content) {
  const keys = /* @__PURE__ */ new Set();
  for (const line of content.split("\n")) {
    if (!CHECKBOX_PATTERN.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 7) continue;
    const set = cells[5].trim();
    const number = cells[6].trim();
    const idMatch = cells[0].match(/id="([^"]+)"/);
    const id = idMatch ? idMatch[1] : "";
    const name = cells[2].trim();
    const suffix = finishSuffix(name, id);
    keys.add(`${set}#${number}${suffix}`);
    if (suffix === "") {
      keys.add(`${set}#${number}_f`);
      keys.add(`${set}#${number}_n`);
    }
  }
  return keys;
}
async function appendCards(file, rows, vault) {
  if (rows.length === 0) return 0;
  const content = await vault.read(file);
  const existing = getExistingCardKeys(content);
  const newRows = rows.filter((row) => {
    const cells = row.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 7) return false;
    const set = cells[5].trim();
    const number = cells[6].trim();
    const idMatch = cells[0].match(/id="([^"]+)"/);
    const id = idMatch ? idMatch[1] : "";
    const name = cells[2].trim();
    const suffix = finishSuffix(name, id);
    return !existing.has(`${set}#${number}${suffix}`);
  });
  if (newRows.length === 0) return 0;
  const lines = content.split("\n");
  let lastTableLine = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().startsWith("|")) {
      lastTableLine = i;
      break;
    }
  }
  if (lastTableLine === -1) {
    await vault.modify(file, content + "\n" + newRows.join("\n"));
  } else {
    lines.splice(lastTableLine + 1, 0, ...newRows);
    await vault.modify(file, lines.join("\n"));
  }
  return newRows.length;
}
async function toggleCardOwned(file, cardId, owned, vault) {
  const content = await vault.read(file);
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(`id="${cardId}"`)) continue;
    if (owned) {
      lines[i] = lines[i].replace(
        `<input type="checkbox" unchecked id="${cardId}">`,
        `<input type="checkbox" checked id="${cardId}">`
      );
    } else {
      lines[i] = lines[i].replace(
        `<input type="checkbox" checked id="${cardId}">`,
        `<input type="checkbox" unchecked id="${cardId}">`
      );
    }
    break;
  }
  await vault.modify(file, lines.join("\n"));
}

// src/NewCollectionModal.ts
var import_obsidian2 = require("obsidian");

// src/ScryfallService.ts
var import_obsidian = require("obsidian");
var API = "https://api.scryfall.com";
var WEB_ONLY_PATTERN = /\b(?:prefer|display):\S+/g;
function parseScryfallInput(input) {
  var _a, _b;
  const trimmed = input.trim();
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
    try {
      const url = new URL(trimmed);
      const q = (_a = url.searchParams.get("q")) != null ? _a : "";
      const order = (_b = url.searchParams.get("order")) != null ? _b : void 0;
      const cleaned = q.replace(WEB_ONLY_PATTERN, "").replace(/\s{2,}/g, " ").trim();
      return { query: cleaned, order };
    } catch (e) {
    }
  }
  return { query: trimmed.replace(WEB_ONLY_PATTERN, "").trim() };
}
var setDateCache = /* @__PURE__ */ new Map();
function getSetDate(setCode) {
  return setDateCache.get(setCode.toLowerCase());
}
function cacheSetDate(card) {
  const key = card.set.toLowerCase();
  if (!setDateCache.has(key)) {
    setDateCache.set(key, card.released_at);
  }
}
async function fetchSetReleasedAt(setCode) {
  const key = setCode.toLowerCase();
  if (setDateCache.has(key)) return setDateCache.get(key);
  const res = await (0, import_obsidian.requestUrl)({ url: `${API}/sets/${key}`, headers: { Accept: "application/json" } });
  if (res.status < 200 || res.status >= 300) return "0000-00-00";
  const data = res.json;
  setDateCache.set(key, data.released_at);
  return data.released_at;
}
async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function fetchAllPages(url, onPage) {
  var _a;
  const cards = [];
  let nextUrl = url;
  let page = 1;
  while (nextUrl) {
    const res = await (0, import_obsidian.requestUrl)({ url: nextUrl, headers: { Accept: "application/json" } });
    if (res.status < 200 || res.status >= 300) {
      let details = "";
      try {
        details = (_a = res.json.details) != null ? _a : "";
      } catch (e) {
      }
      throw new Error(details || `Scryfall error ${res.status}`);
    }
    const list = res.json;
    list.data.forEach(cacheSetDate);
    cards.push(...list.data);
    onPage == null ? void 0 : onPage(page);
    if (list.has_more && list.next_page) {
      nextUrl = list.next_page;
      page++;
      await delay(500);
    } else {
      nextUrl = void 0;
    }
  }
  return cards;
}
async function fetchSetCards(setCode, onPage) {
  const q = encodeURIComponent(`e:${setCode.toLowerCase()} order:set`);
  return fetchAllPages(`${API}/cards/search?q=${q}&unique=prints`, onPage);
}
async function fetchSearchCards(query, onPage, order = "released") {
  const q = encodeURIComponent(query);
  return fetchAllPages(
    `${API}/cards/search?q=${q}&unique=prints&order=${order}&dir=asc`,
    onPage
  );
}
var priceCache = /* @__PURE__ */ new Map();
function getCardPrice(set, number, isFoil) {
  const key = `${set.toLowerCase()}#${number}`;
  if (!priceCache.has(key)) return void 0;
  const entry = priceCache.get(key);
  return isFoil ? entry.usd_foil : entry.usd;
}
function isPriceCached(set, number) {
  return priceCache.has(`${set.toLowerCase()}#${number}`);
}
async function fetchCardPrices(identifiers) {
  const seen = /* @__PURE__ */ new Set();
  const toFetch = identifiers.filter((id) => {
    const key = `${id.set.toLowerCase()}#${id.collector_number}`;
    if (priceCache.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (toFetch.length === 0) return;
  for (let i = 0; i < toFetch.length; i += 75) {
    const batch = toFetch.slice(i, i + 75);
    try {
      const res = await (0, import_obsidian.requestUrl)({
        url: `${API}/cards/collection`,
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ identifiers: batch })
      });
      if (res.status < 200 || res.status >= 300) continue;
      const data = res.json;
      for (const card of data.data) {
        priceCache.set(`${card.set.toLowerCase()}#${card.collector_number}`, {
          usd: card.prices.usd != null ? parseFloat(card.prices.usd) : null,
          usd_foil: card.prices.usd_foil != null ? parseFloat(card.prices.usd_foil) : null
        });
      }
    } catch (e) {
    }
  }
}
function cardToMarkdownRows(card) {
  var _a, _b, _c, _d, _e, _f;
  const imageUrl = (_f = (_e = (_a = card.image_uris) == null ? void 0 : _a.normal) != null ? _e : (_d = (_c = (_b = card.card_faces) == null ? void 0 : _b[0]) == null ? void 0 : _c.image_uris) == null ? void 0 : _d.normal) != null ? _f : "";
  const set = card.set.toUpperCase();
  const id8 = card.id.slice(0, 8);
  const rows = [];
  const finishes = card.finishes.filter((f) => f === "foil" || f === "nonfoil");
  for (const finish of finishes) {
    const label = finish === "foil" ? "Foil" : "Normal";
    const suffix = finish === "foil" ? "_f" : "_n";
    const rowId = `${id8}${suffix}`;
    const name = `${card.name} (${label})`;
    rows.push(
      `| <input type="checkbox" unchecked id="${rowId}"> | ![${name}](${imageUrl}) | ${name} | ${card.type_line} | ${card.rarity} | ${set} | ${card.collector_number} |  |`
    );
  }
  return rows;
}

// src/NewCollectionModal.ts
var GAMES = {
  mtg: {
    label: "MTG",
    icon: "\u2726",
    accent: "#bf9b30",
    bg: "linear-gradient(135deg, #1a1209 0%, #2e1f0a 100%)",
    tagline: ""
  },
  pokemon: {
    label: "Pok\xE9mon",
    icon: "\u26A1",
    accent: "#FFCB05",
    bg: "linear-gradient(135deg, #CC0000 0%, #3B4CCA 100%)",
    tagline: "Gotta catch 'em all"
  },
  onepiece: {
    label: "One Piece",
    icon: "\u2620",
    accent: "#F7941D",
    bg: "linear-gradient(135deg, #0d0d0d 0%, #8B0000 60%, #D62229 100%)",
    tagline: "I'm gonna be King of the Pirates"
  },
  yugioh: {
    label: "Yu-Gi-Oh!",
    icon: "\u{1F441}",
    accent: "#C9A44A",
    bg: "linear-gradient(135deg, #0a0014 0%, #1a0a2e 60%, #3d1a6e 100%)",
    tagline: "It's time to duel"
  }
};
var GAME_ORDER = ["mtg", "pokemon", "onepiece", "yugioh"];
var TYPE_LABELS = {
  "mtg-set": "MTG Set / Product",
  "mtg-theme": "MTG Theme Collection",
  "custom": "Custom Collection"
};
var TABLE_HEADERS = {
  "mtg-set": "| \xBFLa tengo? | Imagen | Nombre | Tipo | Rareza | Set | N\xFAmero | Notas |\n| --- | --- | --- | --- | --- | --- | --- | --- |",
  "mtg-theme": "| In Collection | Image | Name | Type | Rarity | Set | Number | Notes |\n| --- | --- | --- | --- | --- | --- | --- | --- |",
  "custom": "| In Collection | Image | Name | Type | Category | Set | Number | Notes |\n| --- | --- | --- | --- | --- | --- | --- | --- |"
};
var NewCollectionModal = class extends import_obsidian2.Modal {
  constructor(app, plugin, onCreated) {
    super(app);
    this.activeGame = "mtg";
    this.tabEls = /* @__PURE__ */ new Map();
    // MTG form state
    this.name = "";
    this.type = "mtg-set";
    this.setCode = "";
    this.scryfallQuery = "";
    this.scryfallOrder = "released";
    this.autoFetch = true;
    this.autoUpdate = false;
    this.plugin = plugin;
    this.onCreated = onCreated;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("ncm-modal");
    contentEl.createEl("h2", { cls: "ncm-title", text: "New Collection" });
    const tabBar = contentEl.createDiv({ cls: "ncm-tab-bar" });
    for (const game of GAME_ORDER) {
      const cfg = GAMES[game];
      const tab = tabBar.createEl("button", {
        cls: `ncm-tab ncm-tab-${game}${game === this.activeGame ? " ncm-tab-active" : ""}`
      });
      tab.createEl("span", { cls: "ncm-tab-icon", text: cfg.icon });
      tab.createEl("span", { cls: "ncm-tab-label", text: cfg.label });
      tab.addEventListener("click", () => {
        var _a;
        if (this.activeGame === game) return;
        (_a = this.tabEls.get(this.activeGame)) == null ? void 0 : _a.removeClass("ncm-tab-active");
        this.activeGame = game;
        tab.addClass("ncm-tab-active");
        this.renderGameContent();
      });
      this.tabEls.set(game, tab);
    }
    this.gameContentEl = contentEl.createDiv({ cls: "ncm-content" });
    this.renderGameContent();
  }
  onClose() {
    this.contentEl.empty();
  }
  renderGameContent() {
    this.gameContentEl.empty();
    this.gameContentEl.className = `ncm-content ncm-content-${this.activeGame}`;
    if (this.activeGame === "mtg") {
      this.renderMTGForm(this.gameContentEl);
    } else {
      this.renderComingSoon(this.gameContentEl, this.activeGame);
    }
  }
  // ── MTG form ────────────────────────────────────────────────────────────────
  renderMTGForm(el) {
    new import_obsidian2.Setting(el).setName("Collection name").setDesc("Display name for this collection").addText(
      (t) => t.setPlaceholder("e.g. Bloomburrow Token Boosters").setValue(this.name).onChange((v) => this.name = v.trim())
    );
    const setCodeSetting = new import_obsidian2.Setting(el).setName("Set code").setDesc("Scryfall set code (e.g. blb, tblb). Used to auto-fetch cards.").addText(
      (t) => t.setPlaceholder("e.g. tblb").setValue(this.setCode).onChange((v) => this.setCode = v.trim().toLowerCase())
    );
    const queryWrap = el.createDiv({ cls: "nm-query-wrap" });
    queryWrap.style.display = "none";
    const previewEl = queryWrap.createEl("div", { cls: "nm-query-preview" });
    previewEl.style.display = "none";
    new import_obsidian2.Setting(queryWrap).setName("Scryfall query or URL").setDesc("Paste a Scryfall search URL or type a query directly. Add game:paper to exclude digital-only cards.").addTextArea((t) => {
      t.setPlaceholder("Query: type:turtle game:paper\n\nURL: https://scryfall.com/search?q=...");
      t.inputEl.rows = 3;
      t.inputEl.addClass("nm-query-input");
      t.onChange((raw) => {
        var _a;
        const parsed = parseScryfallInput(raw);
        this.scryfallQuery = parsed.query;
        this.scryfallOrder = (_a = parsed.order) != null ? _a : "released";
        previewEl.textContent = parsed.query ? `Query: ${parsed.query}${parsed.order ? `  |  order: ${parsed.order}` : ""}` : "";
        previewEl.style.display = parsed.query ? "" : "none";
      });
    });
    queryWrap.appendChild(previewEl);
    const autoFetchSetting = new import_obsidian2.Setting(el).setName("Auto-fetch cards from Scryfall").setDesc("Populate collection with cards from Scryfall after creation.").addToggle((t) => t.setValue(this.autoFetch).onChange((v) => this.autoFetch = v));
    const autoUpdateSetting = new import_obsidian2.Setting(el).setName("Auto-update").setDesc("Check for new cards on Scryfall every time the dashboard opens. Ideal for theme collections.").addToggle((t) => t.setValue(this.autoUpdate).onChange((v) => this.autoUpdate = v));
    autoUpdateSetting.settingEl.style.display = "none";
    new import_obsidian2.Setting(el).setName("Type").addDropdown((d) => {
      for (const [val, label] of Object.entries(TYPE_LABELS)) {
        d.addOption(val, label);
      }
      d.setValue(this.type);
      d.onChange((v) => {
        this.type = v;
        const isSet = this.type === "mtg-set";
        setCodeSetting.settingEl.style.display = isSet ? "" : "none";
        queryWrap.style.display = isSet ? "none" : "";
        autoUpdateSetting.settingEl.style.display = isSet ? "none" : "";
      });
    });
    new import_obsidian2.Setting(el).addButton((btn) => btn.setButtonText("Create").setCta().onClick(() => this.create())).addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()));
  }
  // ── Coming soon ─────────────────────────────────────────────────────────────
  renderComingSoon(el, game) {
    const cfg = GAMES[game];
    const screen = el.createDiv({ cls: `ncm-soon ncm-soon-${game}` });
    screen.style.background = cfg.bg;
    const inner = screen.createDiv({ cls: "ncm-soon-inner" });
    inner.createEl("div", { cls: "ncm-soon-icon", text: cfg.icon });
    inner.createEl("h3", { cls: "ncm-soon-name", text: cfg.label }).style.color = cfg.accent;
    inner.createEl("p", { cls: "ncm-soon-badge", text: "Coming soon \xB7 Pr\xF3ximamente" });
    if (cfg.tagline) {
      inner.createEl("p", { cls: "ncm-soon-tagline", text: `"${cfg.tagline}"` });
    }
  }
  // ── Create ──────────────────────────────────────────────────────────────────
  async create() {
    if (!this.name) {
      new import_obsidian2.Notice("Collection name is required.");
      return;
    }
    const folder = this.plugin.settings.collectionsFolder;
    const filename = this.name.replace(/[\\/:*?"<>|]/g, "-") + ".md";
    const path = (0, import_obsidian2.normalizePath)(folder ? `${folder}/${filename}` : filename);
    if (this.app.vault.getAbstractFileByPath(path) instanceof import_obsidian2.TFile) {
      new import_obsidian2.Notice(`File already exists: ${path}`);
      return;
    }
    const isSet = this.type === "mtg-set";
    const needsFetch = this.autoFetch && (isSet ? !!this.setCode : !!this.scryfallQuery);
    const fmLines = [
      "---",
      `collection-type: ${this.type}`,
      `collection-name: ${this.name}`,
      isSet && this.setCode ? `set-code: ${this.setCode.toUpperCase()}` : "",
      !isSet && this.scryfallQuery ? `scryfall-query: ${this.scryfallQuery}` : "",
      !isSet && this.scryfallOrder && this.scryfallOrder !== "released" ? `scryfall-order: ${this.scryfallOrder}` : "",
      this.autoUpdate ? "auto-update: true" : "",
      "---"
    ].filter(Boolean);
    const content = `${fmLines.join("\n")}

${TABLE_HEADERS[this.type]}
`;
    try {
      if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
        await this.app.vault.createFolder(folder);
      }
      const file = await this.app.vault.create(path, content);
      this.close();
      if (needsFetch) {
        await this.fetchAndPopulate(file, isSet);
      }
      this.onCreated();
      await this.app.workspace.getLeaf(false).openFile(file);
    } catch (e) {
      new import_obsidian2.Notice(`Failed to create collection: ${e.message}`);
    }
  }
  async fetchAndPopulate(file, isSet) {
    new import_obsidian2.Notice("Fetching cards from Scryfall...");
    try {
      const cards = isSet ? await fetchSetCards(this.setCode, (p) => new import_obsidian2.Notice(`Fetching page ${p}...`)) : await fetchSearchCards(
        this.scryfallQuery,
        (p) => new import_obsidian2.Notice(`Fetching page ${p}...`),
        this.scryfallOrder
      );
      const rows = cards.flatMap(cardToMarkdownRows);
      const added = await appendCards(file, rows, this.app.vault);
      new import_obsidian2.Notice(`Added ${added} cards to "${this.name}".`);
    } catch (e) {
      new import_obsidian2.Notice(`Scryfall fetch failed: ${e.message}`);
    }
  }
};

// src/CardSearchModal.ts
var import_obsidian3 = require("obsidian");
var import_obsidian4 = require("obsidian");
var API2 = "https://api.scryfall.com";
async function autocomplete(q) {
  if (q.length < 2) return [];
  const res = await (0, import_obsidian3.requestUrl)({ url: `${API2}/cards/autocomplete?q=${encodeURIComponent(q)}` });
  if (res.status < 200 || res.status >= 300) return [];
  const data = res.json;
  return data.data.slice(0, 10);
}
async function fetchPrintings(name) {
  const q = encodeURIComponent(`!"${name}"`);
  const res = await (0, import_obsidian3.requestUrl)({
    url: `${API2}/cards/search?q=${q}&unique=prints&order=released&dir=asc`,
    headers: { Accept: "application/json" }
  });
  if (res.status < 200 || res.status >= 300) return [];
  const data = res.json;
  return data.data;
}
var CardSearchModal = class extends import_obsidian3.Modal {
  constructor(app, collection, onAdded) {
    super(app);
    this.query = "";
    this.debounce = null;
    this.selectedPrints = /* @__PURE__ */ new Set();
    this.printings = [];
    this.collection = collection;
    this.onAdded = onAdded;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("card-search-modal");
    contentEl.createEl("h2", { text: `Add card to "${this.collection.name}"` });
    const searchWrap = contentEl.createDiv({ cls: "csm-search-wrap" });
    const input = searchWrap.createEl("input", {
      cls: "csm-input",
      attr: { type: "text", placeholder: "Type card name...", autofocus: "true" }
    });
    this.suggestionsEl = searchWrap.createDiv({ cls: "csm-suggestions" });
    this.printingsEl = contentEl.createDiv({ cls: "csm-printings" });
    const footer = contentEl.createDiv({ cls: "csm-footer" });
    const countEl = footer.createEl("span", { cls: "csm-count", text: "0 selected" });
    this.addBtn = footer.createEl("button", {
      cls: "csm-add-btn",
      text: "Add to Collection",
      attr: { disabled: "true" }
    });
    this.addBtn.addEventListener("click", () => this.addSelected());
    input.addEventListener("input", () => {
      this.query = input.value.trim();
      this.suggestionsEl.empty();
      this.printingsEl.empty();
      this.selectedPrints.clear();
      this.updateCount(countEl);
      if (this.debounce) clearTimeout(this.debounce);
      if (!this.query) return;
      this.debounce = setTimeout(async () => {
        const names = await autocomplete(this.query);
        this.renderSuggestions(names, input, countEl);
      }, 250);
    });
  }
  onClose() {
    this.contentEl.empty();
  }
  renderSuggestions(names, input, countEl) {
    this.suggestionsEl.empty();
    if (names.length === 0) {
      this.suggestionsEl.createEl("div", { cls: "csm-no-results", text: "No matches" });
      return;
    }
    for (const name of names) {
      const item = this.suggestionsEl.createEl("div", { cls: "csm-suggestion", text: name });
      item.addEventListener("click", async () => {
        input.value = name;
        this.suggestionsEl.empty();
        this.selectedPrints.clear();
        this.printingsEl.empty();
        this.printingsEl.createEl("div", { cls: "csm-loading", text: "Loading printings..." });
        this.printings = await fetchPrintings(name);
        this.renderPrintings(this.printings, countEl);
      });
    }
  }
  renderPrintings(cards, countEl) {
    var _a, _b, _c, _d, _e, _f;
    this.printingsEl.empty();
    if (cards.length === 0) {
      this.printingsEl.createEl("div", { cls: "csm-no-results", text: "No printings found." });
      return;
    }
    this.printingsEl.createEl("p", {
      cls: "csm-hint",
      text: "Select printings to add (click to toggle):"
    });
    const grid = this.printingsEl.createDiv({ cls: "csm-print-grid" });
    for (const card of cards) {
      const imageUrl = (_f = (_e = (_a = card.image_uris) == null ? void 0 : _a.normal) != null ? _e : (_d = (_c = (_b = card.card_faces) == null ? void 0 : _b[0]) == null ? void 0 : _c.image_uris) == null ? void 0 : _d.normal) != null ? _f : "";
      const finishes = card.finishes.filter((f) => f === "foil" || f === "nonfoil");
      for (const finish of finishes) {
        const key = `${card.id}::${finish}`;
        const label = finish === "foil" ? "Foil" : "Normal";
        const tile = grid.createDiv({ cls: "csm-print-tile" });
        if (imageUrl) {
          tile.createEl("img", {
            cls: "csm-print-img",
            attr: { src: imageUrl, alt: card.name, loading: "lazy" }
          });
        }
        const info = tile.createDiv({ cls: "csm-print-info" });
        info.createEl("span", { cls: "csm-print-set", text: card.set.toUpperCase() });
        info.createEl("span", { cls: "csm-print-num", text: `#${card.collector_number}` });
        info.createEl("span", { cls: `csm-rarity csm-rarity-${card.rarity}`, text: card.rarity });
        info.createEl("span", { cls: "csm-finish", text: label });
        info.createEl("span", { cls: "csm-date", text: card.released_at });
        tile.addEventListener("click", () => {
          if (this.selectedPrints.has(key)) {
            this.selectedPrints.delete(key);
            tile.removeClass("csm-print-selected");
          } else {
            this.selectedPrints.add(key);
            tile.addClass("csm-print-selected");
          }
          this.updateCount(countEl);
        });
      }
    }
  }
  updateCount(countEl) {
    const n = this.selectedPrints.size;
    countEl.textContent = `${n} selected`;
    if (n > 0) {
      this.addBtn.removeAttribute("disabled");
    } else {
      this.addBtn.setAttribute("disabled", "true");
    }
  }
  async addSelected() {
    if (this.selectedPrints.size === 0) return;
    const rows = [];
    for (const key of this.selectedPrints) {
      const [cardId, finish] = key.split("::");
      const card = this.printings.find((c) => c.id === cardId);
      if (!card) continue;
      const allRows = cardToMarkdownRows(card);
      const matchRow = allRows.find(
        (r) => finish === "foil" ? r.includes("(Foil)") : r.includes("(Normal)")
      );
      if (matchRow) rows.push(matchRow);
    }
    const file = this.app.vault.getAbstractFileByPath(this.collection.path);
    if (!(file instanceof import_obsidian4.TFile)) return;
    const added = await appendCards(file, rows, this.app.vault);
    new import_obsidian3.Notice(added > 0 ? `Added ${added} card(s) to "${this.collection.name}".` : "All selected cards already in collection.");
    this.close();
    if (added > 0) this.onAdded();
  }
};

// src/DashboardView.ts
var DASHBOARD_VIEW_TYPE = "collectors-dashboard";
var DashboardView = class extends import_obsidian5.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.collections = [];
    this.screen = "list";
    this.selected = null;
    this.filter = "all";
    this.sortBy = "number";
    this.searchQuery = "";
    this.plugin = plugin;
  }
  getViewType() {
    return DASHBOARD_VIEW_TYPE;
  }
  getDisplayText() {
    return "Collectors";
  }
  getIcon() {
    return "layout-grid";
  }
  async onOpen() {
    await this.refresh();
  }
  async refresh() {
    this.collections = await this.loadCollections();
    if (this.selected) {
      const updated = this.collections.find((c) => c.path === this.selected.path);
      this.selected = updated != null ? updated : null;
      if (!this.selected) this.screen = "list";
    }
    this.render();
    this.runAutoUpdates();
    this.prefetchAllPrices();
  }
  // ── Price helpers ─────────────────────────────────────────────────────────────
  cardPrice(card) {
    return getCardPrice(card.set.toLowerCase(), card.number, card.id.endsWith("_f"));
  }
  fmt(val) {
    return `$${val.toFixed(2)}`;
  }
  collValues(cards) {
    let owned = 0, missing = 0, loaded = false;
    for (const card of cards) {
      if (!isPriceCached(card.set.toLowerCase(), card.number)) continue;
      loaded = true;
      const p = this.cardPrice(card);
      if (typeof p === "number") {
        if (card.owned) owned += p;
        else missing += p;
      }
    }
    return { owned, missing, loaded };
  }
  async prefetchAllPrices() {
    const ids = this.collections.flatMap(
      (c) => c.cards.map((card) => ({ set: card.set.toLowerCase(), collector_number: card.number }))
    );
    const needed = ids.filter((id) => !isPriceCached(id.set, id.collector_number));
    if (needed.length === 0) return;
    await fetchCardPrices(ids);
    this.render();
  }
  // ── Lifecycle ─────────────────────────────────────────────────────────────────
  runAutoUpdates() {
    const targets = this.collections.filter(
      (c) => c.autoUpdate && (c.setCode || c.scryfallQuery)
    );
    for (const coll of targets) {
      this.updateFromScryfall(coll, true).then((added) => {
        if (added > 0) this.refresh();
      });
    }
  }
  async loadCollections() {
    const { vault } = this.app;
    const folder = this.plugin.settings.collectionsFolder;
    let files;
    if (folder) {
      const abs = vault.getAbstractFileByPath(folder);
      if (abs && "children" in abs) {
        files = abs.children.filter(
          (f) => f instanceof import_obsidian5.TFile && f.extension === "md"
        );
      } else {
        files = vault.getMarkdownFiles();
      }
    } else {
      files = vault.getMarkdownFiles();
    }
    const results = await Promise.all(
      files.map((f) => parseCollectionFile(f, vault))
    );
    return results.filter((c) => c !== null).sort((a, b) => a.name.localeCompare(b.name));
  }
  render() {
    const content = this.containerEl.children[1];
    content.empty();
    content.addClass("collectors-root");
    if (this.screen === "detail" && this.selected) {
      this.renderDetail(content);
    } else {
      this.renderList(content);
    }
  }
  // ── List screen ───────────────────────────────────────────────────────────────
  renderList(root) {
    const header = root.createDiv({ cls: "col-header" });
    header.createEl("h2", { text: "Collectors", cls: "col-title" });
    const actions = header.createDiv({ cls: "col-actions" });
    const refreshBtn = actions.createEl("button", { cls: "col-btn-icon", attr: { title: "Refresh" } });
    refreshBtn.innerHTML = "\u21BB";
    refreshBtn.addEventListener("click", () => this.refresh());
    const newBtn = actions.createEl("button", { cls: "col-btn", text: "+ New" });
    newBtn.addEventListener(
      "click",
      () => new NewCollectionModal(this.app, this.plugin, () => this.refresh()).open()
    );
    if (this.collections.length === 0) {
      root.createDiv({ cls: "col-empty", text: "No collections found. Create one or configure the folder in settings." });
      return;
    }
    this.renderHeroStats(root);
    const grouped = this.groupByType(this.collections);
    const order = ["mtg-set", "mtg-theme", "custom"];
    const labels = {
      "mtg-set": "MTG Sets",
      "mtg-theme": "Theme Collections",
      "custom": "Custom Collections"
    };
    for (const type of order) {
      const colls = grouped[type];
      if (!(colls == null ? void 0 : colls.length)) continue;
      const section = root.createDiv({ cls: "col-section" });
      section.createEl("h3", { cls: "col-section-title", text: labels[type] });
      const grid = section.createDiv({ cls: "col-collection-grid" });
      for (const coll of colls) {
        this.renderCollectionCard(grid, coll);
      }
    }
  }
  renderHeroStats(root) {
    const allCards = this.collections.flatMap((c) => c.cards);
    const totalOwned = this.collections.reduce((s, c) => s + c.owned, 0);
    const totalCards = this.collections.reduce((s, c) => s + c.total, 0);
    let totalInvested = 0, totalMissing = 0, pricesLoaded = false;
    for (const card of allCards) {
      if (!isPriceCached(card.set.toLowerCase(), card.number)) continue;
      pricesLoaded = true;
      const p = this.cardPrice(card);
      if (typeof p === "number") {
        if (card.owned) totalInvested += p;
        else totalMissing += p;
      }
    }
    const hero = root.createDiv({ cls: "col-hero" });
    this.statBox(hero, String(this.collections.length), "Collections", "");
    this.statBox(hero, `${totalOwned} / ${totalCards}`, "Cards owned", "col-hero-owned");
    this.statBox(hero, pricesLoaded ? this.fmt(totalInvested) : "\u2026", "Invested", "col-hero-money");
    this.statBox(hero, pricesLoaded ? this.fmt(totalMissing) : "\u2026", "To complete", "col-hero-missing");
  }
  statBox(container, value, label, mod) {
    const box = container.createDiv({ cls: `col-hero-box${mod ? " " + mod : ""}` });
    box.createEl("span", { cls: "col-hero-value", text: value });
    box.createEl("span", { cls: "col-hero-label", text: label });
  }
  renderCollectionCard(container, coll) {
    var _a, _b;
    const pct = coll.total > 0 ? Math.round(coll.owned / coll.total * 100) : 0;
    const missing = coll.total - coll.owned;
    const { owned: ownedVal, missing: missingVal, loaded: pricesLoaded } = this.collValues(coll.cards);
    const card = container.createDiv({ cls: "col-card" });
    const thumb = card.createDiv({ cls: "col-card-thumb" });
    const thumbCard = coll.cards.find((c) => c.imageUrl);
    if (thumbCard == null ? void 0 : thumbCard.imageUrl) {
      const img = thumb.createEl("img", {
        cls: "col-card-thumb-img",
        attr: { src: thumbCard.imageUrl, alt: coll.name, loading: "lazy" }
      });
      img.addEventListener("error", () => {
        var _a2, _b2;
        img.remove();
        thumb.createEl("div", { cls: "col-card-thumb-fallback", text: (_b2 = (_a2 = coll.name[0]) == null ? void 0 : _a2.toUpperCase()) != null ? _b2 : "?" });
      });
    } else {
      thumb.createEl("div", { cls: "col-card-thumb-fallback", text: (_b = (_a = coll.name[0]) == null ? void 0 : _a.toUpperCase()) != null ? _b : "?" });
    }
    const info = card.createDiv({ cls: "col-card-info" });
    const nameRow = info.createDiv({ cls: "col-card-name-row" });
    nameRow.createEl("span", { cls: "col-card-name", text: coll.name });
    if (coll.setCode) nameRow.createEl("span", { cls: "col-badge", text: coll.setCode });
    const progressWrap = info.createDiv({ cls: "col-progress-wrap" });
    const bar = progressWrap.createDiv({ cls: "col-progress-bar" });
    bar.createDiv({ cls: "col-progress-fill" }).style.width = `${pct}%`;
    progressWrap.createEl("span", { cls: "col-pct", text: `${pct}%` });
    const stats = info.createDiv({ cls: "col-stats" });
    stats.createEl("span", { cls: "col-stat-owned", text: `${coll.owned} owned` });
    stats.createEl("span", { cls: "col-dot", text: "\xB7" });
    stats.createEl("span", { text: `${coll.total} total` });
    if (missing > 0) {
      stats.createEl("span", { cls: "col-dot", text: "\xB7" });
      stats.createEl("span", { cls: "col-stat-missing", text: `${missing} missing` });
    }
    if (pricesLoaded) {
      const priceRow = info.createDiv({ cls: "col-price-row" });
      priceRow.createEl("span", { cls: "col-price-invested", text: `${this.fmt(ownedVal)} invested` });
      if (missingVal > 0) {
        priceRow.createEl("span", { cls: "col-dot", text: "\xB7" });
        priceRow.createEl("span", { cls: "col-price-missing", text: `${this.fmt(missingVal)} to complete` });
      }
    }
    const cardActions = info.createDiv({ cls: "col-card-actions" });
    const detailBtn = cardActions.createEl("button", { cls: "col-btn col-btn-view", attr: { title: "View cards" } });
    detailBtn.innerHTML = "\u229E View";
    detailBtn.addEventListener("click", () => {
      this.selected = coll;
      this.screen = "detail";
      this.filter = "all";
      this.searchQuery = "";
      this.render();
    });
    if (coll.setCode || coll.scryfallQuery) {
      const updateBtn = cardActions.createEl("button", { cls: "col-btn-icon", attr: { title: "Update from Scryfall" } });
      updateBtn.innerHTML = "\u27F3";
      updateBtn.addEventListener("click", async () => {
        updateBtn.disabled = true;
        await this.updateFromScryfall(coll);
        updateBtn.disabled = false;
      });
    }
    const openBtn = cardActions.createEl("button", { cls: "col-btn-icon", attr: { title: "Open file" } });
    openBtn.innerHTML = "\u2197";
    openBtn.addEventListener("click", () => this.openFile(coll.path));
  }
  // ── Detail screen ─────────────────────────────────────────────────────────────
  renderDetail(root) {
    const coll = this.selected;
    const header = root.createDiv({ cls: "col-header" });
    const backBtn = header.createEl("button", { cls: "col-btn-icon", attr: { title: "Back" } });
    backBtn.innerHTML = "\u2190";
    backBtn.addEventListener("click", () => {
      this.screen = "list";
      this.selected = null;
      this.render();
    });
    const titleWrap = header.createDiv({ cls: "col-header-title" });
    titleWrap.createEl("h2", { cls: "col-title", text: coll.name });
    if (coll.setCode) titleWrap.createEl("span", { cls: "col-badge", text: coll.setCode });
    const headerActions = header.createDiv({ cls: "col-actions" });
    if (coll.setCode || coll.scryfallQuery) {
      const updateBtn = headerActions.createEl("button", { cls: "col-btn-icon", attr: { title: "Update from Scryfall" } });
      updateBtn.innerHTML = "\u27F3";
      updateBtn.addEventListener("click", async () => {
        updateBtn.disabled = true;
        await this.updateFromScryfall(coll);
        updateBtn.disabled = false;
        await this.refresh();
      });
    }
    const addCardBtn = headerActions.createEl("button", { cls: "col-btn", text: "+ Card" });
    addCardBtn.addEventListener("click", () => {
      new CardSearchModal(this.app, coll, () => this.refresh()).open();
    });
    const openBtn = headerActions.createEl("button", { cls: "col-btn-icon", attr: { title: "Open file" } });
    openBtn.innerHTML = "\u2197";
    openBtn.addEventListener("click", () => this.openFile(coll.path));
    this.renderDetailHero(root, coll);
    const controls = root.createDiv({ cls: "col-controls" });
    const searchInput = controls.createEl("input", {
      cls: "col-search",
      attr: { type: "text", placeholder: "Search cards...", value: this.searchQuery }
    });
    const row2 = controls.createDiv({ cls: "col-controls-row" });
    const tabs = row2.createDiv({ cls: "col-tabs" });
    const filterValues = ["all", "owned", "missing"];
    const tabLabels = { all: "All", owned: "Owned", missing: "Missing" };
    for (const f of filterValues) {
      const tab = tabs.createEl("button", {
        cls: `col-tab${this.filter === f ? " col-tab-active" : ""}`,
        text: tabLabels[f]
      });
      tab.addEventListener("click", () => {
        this.filter = f;
        this.renderCards(grid, coll);
        tabs.querySelectorAll(".col-tab").forEach((t) => t.removeClass("col-tab-active"));
        tab.addClass("col-tab-active");
      });
    }
    const sortWrap = row2.createDiv({ cls: "col-sort-wrap" });
    sortWrap.createEl("span", { cls: "col-sort-label", text: "Sort:" });
    const sortSelect = sortWrap.createEl("select", { cls: "col-sort-select" });
    const sortOptions = [
      { value: "number", label: "Number" },
      { value: "name", label: "Name" },
      { value: "price-desc", label: "Price \u2193" },
      { value: "price-asc", label: "Price \u2191" },
      { value: "release-desc", label: "Newest first" },
      { value: "release-asc", label: "Oldest first" }
    ];
    for (const opt of sortOptions) {
      const o = sortSelect.createEl("option", { value: opt.value, text: opt.label });
      if (opt.value === this.sortBy) o.selected = true;
    }
    sortSelect.addEventListener("change", () => {
      this.sortBy = sortSelect.value;
      this.renderCards(grid, coll);
    });
    const grid = root.createDiv({ cls: "col-card-grid" });
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value;
      this.renderCards(grid, coll);
    });
    this.renderCards(grid, coll);
    const needsFetch = coll.cards.some((c) => !isPriceCached(c.set.toLowerCase(), c.number));
    if (needsFetch) {
      const ids = coll.cards.map((c) => ({ set: c.set.toLowerCase(), collector_number: c.number }));
      fetchCardPrices(ids).then(() => this.render());
    }
  }
  renderDetailHero(root, coll) {
    const pct = coll.total > 0 ? Math.round(coll.owned / coll.total * 100) : 0;
    const { owned: ownedVal, missing: missingVal, loaded: pricesLoaded } = this.collValues(coll.cards);
    const hero = root.createDiv({ cls: "col-detail-hero" });
    this.statBox(hero, `${coll.owned} / ${coll.total}`, "Cards owned", "col-hero-owned");
    const progBox = hero.createDiv({ cls: "col-hero-box col-hero-progress" });
    const progWrap = progBox.createDiv({ cls: "col-progress-wrap" });
    progWrap.createDiv({ cls: "col-progress-bar" }).createDiv({ cls: "col-progress-fill" }).style.width = `${pct}%`;
    progBox.createEl("span", { cls: "col-hero-value col-hero-pct", text: `${pct}%` });
    if (pricesLoaded) {
      this.statBox(hero, this.fmt(ownedVal), "Invested", "col-hero-money");
      this.statBox(hero, this.fmt(missingVal), "To complete", "col-hero-missing");
    }
  }
  renderCards(grid, coll) {
    grid.empty();
    const filtered = coll.cards.filter((card) => {
      if (this.filter === "owned" && !card.owned) return false;
      if (this.filter === "missing" && card.owned) return false;
      if (this.searchQuery) {
        return card.name.toLowerCase().includes(this.searchQuery.toLowerCase());
      }
      return true;
    });
    this.sortCards(filtered).then((sorted) => {
      if (sorted.length === 0) {
        grid.createDiv({ cls: "col-empty", text: "No cards match this filter." });
        return;
      }
      for (const card of sorted) {
        this.renderCardTile(grid, card, coll);
      }
    });
  }
  async sortCards(cards) {
    if (this.sortBy === "name") {
      return [...cards].sort((a, b) => a.name.localeCompare(b.name));
    }
    if (this.sortBy === "number") {
      return [...cards].sort((a, b) => {
        if (a.set !== b.set) return a.set.localeCompare(b.set);
        return parseInt(a.number) - parseInt(b.number) || a.number.localeCompare(b.number);
      });
    }
    if (this.sortBy === "price-desc" || this.sortBy === "price-asc") {
      const dir2 = this.sortBy === "price-desc" ? -1 : 1;
      return [...cards].sort((a, b) => {
        var _a, _b;
        const pa = (_a = this.cardPrice(a)) != null ? _a : -1;
        const pb = (_b = this.cardPrice(b)) != null ? _b : -1;
        return (pa - pb) * dir2;
      });
    }
    const uniqueSets = [...new Set(cards.map((c) => c.set.toLowerCase()))];
    const missing = uniqueSets.filter((s) => !getSetDate(s));
    await Promise.all(missing.map((s) => fetchSetReleasedAt(s)));
    const dir = this.sortBy === "release-desc" ? -1 : 1;
    return [...cards].sort((a, b) => {
      var _a, _b;
      const da = (_a = getSetDate(a.set)) != null ? _a : "0000-00-00";
      const db = (_b = getSetDate(b.set)) != null ? _b : "0000-00-00";
      if (da !== db) return da < db ? -dir : dir;
      return parseInt(a.number) - parseInt(b.number) || a.number.localeCompare(b.number);
    });
  }
  renderCardTile(grid, card, coll) {
    var _a, _b, _c;
    const tile = grid.createDiv({ cls: `col-tile${card.owned ? " col-tile-owned" : ""}` });
    if (card.imageUrl) {
      const img = tile.createEl("img", {
        cls: "col-tile-img",
        attr: { src: card.imageUrl, alt: card.name, loading: "lazy" }
      });
      img.addEventListener("error", () => {
        var _a2;
        img.style.display = "none";
        tile.createEl("div", { cls: "col-tile-img-fallback", text: (_a2 = card.name[0]) != null ? _a2 : "?" });
      });
    } else {
      tile.createDiv({ cls: "col-tile-img-fallback", text: (_a = card.name[0]) != null ? _a : "?" });
    }
    const tileFooter = tile.createDiv({ cls: "col-tile-footer" });
    tileFooter.createEl("span", { cls: "col-tile-name", text: card.name });
    const meta = tileFooter.createDiv({ cls: "col-tile-meta" });
    meta.createEl("span", { cls: `col-rarity col-rarity-${card.rarity}`, text: (_c = (_b = card.rarity[0]) == null ? void 0 : _b.toUpperCase()) != null ? _c : "" });
    meta.createEl("span", { text: `${card.set} #${card.number}` });
    const isCached = isPriceCached(card.set.toLowerCase(), card.number);
    if (isCached) {
      const p = this.cardPrice(card);
      const priceText = typeof p === "number" ? this.fmt(p) : "\u2014";
      tileFooter.createEl("span", { cls: "col-tile-price", text: priceText });
    }
    const toggleBtn = tile.createEl("button", {
      cls: `col-toggle${card.owned ? " col-toggle-owned" : ""}`,
      attr: { title: card.owned ? "Mark as missing" : "Mark as owned" }
    });
    toggleBtn.innerHTML = card.owned ? "\u2713" : "+";
    toggleBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const file = this.app.vault.getAbstractFileByPath(coll.path);
      if (!(file instanceof import_obsidian5.TFile)) return;
      const newOwned = !card.owned;
      await toggleCardOwned(file, card.id, newOwned, this.app.vault);
      card.owned = newOwned;
      coll.owned = coll.cards.filter((c) => c.owned).length;
      tile.toggleClass("col-tile-owned", newOwned);
      toggleBtn.toggleClass("col-toggle-owned", newOwned);
      toggleBtn.innerHTML = newOwned ? "\u2713" : "+";
      toggleBtn.setAttribute("title", newOwned ? "Mark as missing" : "Mark as owned");
      this.refreshDetailHero(coll);
    });
  }
  refreshDetailHero(coll) {
    const root = this.containerEl.children[1];
    const pct = coll.total > 0 ? Math.round(coll.owned / coll.total * 100) : 0;
    const { owned: ov, missing: mv } = this.collValues(coll.cards);
    const fill = root.querySelector(".col-progress-fill");
    if (fill) fill.style.width = `${pct}%`;
    const pctEl = root.querySelector(".col-hero-pct");
    if (pctEl) pctEl.textContent = `${pct}%`;
    const heroValues = root.querySelectorAll(".col-hero-value");
    if (heroValues[0]) heroValues[0].textContent = `${coll.owned} / ${coll.total}`;
    if (heroValues[2]) heroValues[2].textContent = this.fmt(ov);
    if (heroValues[3]) heroValues[3].textContent = this.fmt(mv);
  }
  // ── Scryfall update ───────────────────────────────────────────────────────────
  async updateFromScryfall(coll, silent = false) {
    var _a;
    if (!silent) new import_obsidian5.Notice(`Fetching cards for "${coll.name}"...`);
    try {
      const cards = coll.setCode ? await fetchSetCards(coll.setCode, (p) => {
        if (!silent) new import_obsidian5.Notice(`Fetching page ${p}...`);
      }) : await fetchSearchCards(
        coll.scryfallQuery,
        (p) => {
          if (!silent) new import_obsidian5.Notice(`Fetching page ${p}...`);
        },
        (_a = coll.scryfallOrder) != null ? _a : "released"
      );
      const file = this.app.vault.getAbstractFileByPath(coll.path);
      if (!(file instanceof import_obsidian5.TFile)) return 0;
      const rows = cards.flatMap(cardToMarkdownRows);
      const added = await appendCards(file, rows, this.app.vault);
      if (!silent) {
        new import_obsidian5.Notice(
          added > 0 ? `Added ${added} new cards to "${coll.name}".` : `"${coll.name}" is already up to date.`
        );
      } else if (added > 0) {
        new import_obsidian5.Notice(`Auto-update: added ${added} new cards to "${coll.name}".`);
      }
      return added;
    } catch (e) {
      if (!silent) new import_obsidian5.Notice(`Scryfall update failed: ${e.message}`);
      return 0;
    }
  }
  // ── Helpers ───────────────────────────────────────────────────────────────────
  groupByType(collections) {
    var _a, _b;
    const result = {};
    for (const c of collections) {
      ((_b = result[_a = c.type]) != null ? _b : result[_a] = []).push(c);
    }
    return result;
  }
  async openFile(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof import_obsidian5.TFile) {
      await this.app.workspace.getLeaf(false).openFile(file);
    }
  }
};

// src/types.ts
var DEFAULT_SETTINGS = {
  collectionsFolder: "",
  autoDetect: true
};

// src/settings.ts
var import_obsidian6 = require("obsidian");
var CollectorsSettingTab = class extends import_obsidian6.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Collectors Settings" });
    new import_obsidian6.Setting(containerEl).setName("Collections folder").setDesc(
      'Folder to scan for collection files. Leave empty to scan the entire vault. Example: "004 MTG"'
    ).addText(
      (t) => t.setPlaceholder("e.g. 004 MTG").setValue(this.plugin.settings.collectionsFolder).onChange(async (v) => {
        this.plugin.settings.collectionsFolder = v.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian6.Setting(containerEl).setName("Auto-detect collections").setDesc("Detect collection files by their checkbox table format, not only by frontmatter.").addToggle(
      (t) => t.setValue(this.plugin.settings.autoDetect).onChange(async (v) => {
        this.plugin.settings.autoDetect = v;
        await this.plugin.saveSettings();
      })
    );
  }
};

// src/main.ts
var CollectorsPlugin = class extends import_obsidian7.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    await this.loadSettings();
    this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, this));
    this.addRibbonIcon("layout-grid", "Collectors Dashboard", () => this.activateDashboard());
    this.addCommand({
      id: "open-dashboard",
      name: "Open Dashboard",
      callback: () => this.activateDashboard()
    });
    this.addCommand({
      id: "new-collection",
      name: "New Collection",
      callback: () => new NewCollectionModal(this.app, this, () => this.refreshDashboard()).open()
    });
    this.addSettingTab(new CollectorsSettingTab(this.app, this));
  }
  onunload() {
    this.app.workspace.detachLeavesOfType(DASHBOARD_VIEW_TYPE);
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async activateDashboard() {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
    if (leaves.length > 0) {
      workspace.revealLeaf(leaves[0]);
      return;
    }
    const leaf = workspace.getLeaf("tab");
    await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
  }
  async refreshDashboard() {
    for (const leaf of this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)) {
      if (leaf.view instanceof DashboardView) {
        await leaf.view.refresh();
      }
    }
  }
};
