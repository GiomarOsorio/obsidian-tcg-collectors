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
var import_obsidian10 = require("obsidian");

// src/DashboardView.ts
var import_obsidian5 = require("obsidian");

// src/parser.ts
var SUFFIX_PATTERN = /_([nrhf]e?)$/;
var CHECKBOX_PATTERN = /<input type="checkbox"/;
function yamlStr(s) {
  if (/[:#\[\]{},]/.test(s) || s.startsWith('"') || s.startsWith("'")) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}
function unquoteYaml(s) {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return s;
}
async function parseCollectionFile(file, vault) {
  const content = await vault.read(file);
  let collectionType = "mtg-theme";
  let setCode;
  let scryfallQuery;
  let scryfallOrder;
  let autoUpdate = false;
  let finishImport;
  let allPrints;
  let collectionFormat = "paper";
  let lastFetched;
  let pluginVersion;
  let collectionName = file.basename;
  let tcgdexSetId;
  let pokemonVariantImport;
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fmLines = fmMatch[1].split("\n");
    for (const line of fmLines) {
      const [key, ...rest] = line.split(":");
      const val = unquoteYaml(rest.join(":").trim());
      switch (key.trim()) {
        case "collection-type":
          collectionType = val === "custom" ? "mtg-theme" : val;
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
        case "finish-import":
          finishImport = val;
          break;
        case "all-prints":
          allPrints = val === "true";
          break;
        case "last-fetched":
          lastFetched = val;
          break;
        case "plugin-version":
          pluginVersion = val;
          break;
        case "collection-format":
          collectionFormat = val;
          break;
        case "tcgdex-set-id":
          tcgdexSetId = val;
          break;
        case "pokemon-variant-import":
          pokemonVariantImport = val;
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
    format: collectionFormat,
    setCode,
    tcgdexSetId,
    pokemonVariantImport,
    scryfallQuery,
    scryfallOrder,
    autoUpdate,
    finishImport,
    allPrints,
    lastFetched,
    pluginVersion,
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
    const countMatch = checkboxCell.match(/data-count="(\d+)"/);
    const count = countMatch ? parseInt(countMatch[1]) : owned ? 1 : 0;
    const imageMatch = cells[1].match(/!\[.*?\]\((.*?)\)/);
    const imageUrl = imageMatch ? imageMatch[1] : "";
    cards.push({
      id,
      owned,
      count,
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
  const m = id.match(SUFFIX_PATTERN);
  if (m) return `_${m[1]}`;
  if (name.includes("(Foil)")) return "_f";
  if (name.includes("(Normal)")) return "_n";
  return "";
}
function extractIdSuffix(id) {
  const m = id.match(SUFFIX_PATTERN);
  return m ? `_${m[1]}` : "_n";
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
async function setCardCount(file, cardId, count, vault) {
  const content = await vault.read(file);
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(`id="${cardId}"`)) continue;
    let line = lines[i];
    const owned = count > 0;
    if (owned) {
      line = line.replace(`unchecked id="${cardId}"`, `checked id="${cardId}"`);
    } else {
      line = line.replace(`checked id="${cardId}"`, `unchecked id="${cardId}"`);
    }
    if (count > 1) {
      if (line.includes('data-count="')) {
        line = line.replace(/data-count="\d+"/, `data-count="${count}"`);
      } else {
        line = line.replace(`id="${cardId}"`, `id="${cardId}" data-count="${count}"`);
      }
    } else {
      line = line.replace(/\s*data-count="\d+"/, "");
    }
    lines[i] = line;
    break;
  }
  await vault.modify(file, lines.join("\n"));
}
async function replaceFrontmatter(file, fmLines, vault) {
  const content = await vault.read(file);
  const fmEnd = content.indexOf("\n---", 4);
  if (content.startsWith("---\n") && fmEnd !== -1) {
    const body = content.slice(fmEnd + 4);
    await vault.modify(file, fmLines.join("\n") + body.replace(/^\n*/, "\n\n"));
  } else {
    await vault.modify(file, fmLines.join("\n") + "\n\n" + content);
  }
}
function extractOwnedMap(content) {
  var _a;
  const map = /* @__PURE__ */ new Map();
  for (const line of content.split("\n")) {
    if (!CHECKBOX_PATTERN.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 7) continue;
    const checkboxCell = cells[0];
    const isOwned = checkboxCell.includes("checked") && !checkboxCell.includes("unchecked");
    if (!isOwned) continue;
    const countMatch = checkboxCell.match(/data-count="(\d+)"/);
    const count = countMatch ? parseInt(countMatch[1]) : 1;
    const set = cells[5].trim().toLowerCase();
    const number = cells[6].trim();
    const idMatch = checkboxCell.match(/id="([^"]+)"/);
    const id = (_a = idMatch == null ? void 0 : idMatch[1]) != null ? _a : "";
    const suffix = extractIdSuffix(id);
    map.set(`${set}#${number}${suffix}`, count);
  }
  return map;
}
async function clearCardRows(file, vault) {
  const content = await vault.read(file);
  const lines = content.split("\n");
  const filtered = lines.filter((line) => !CHECKBOX_PATTERN.test(line));
  await vault.modify(file, filtered.join("\n").trimEnd() + "\n");
}
function applyOwnedStates(rows, ownedMap) {
  return rows.map((row) => {
    var _a;
    const cells = row.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 7) return row;
    const set = cells[5].trim().toLowerCase();
    const number = cells[6].trim();
    const idMatch = cells[0].match(/id="([^"]+)"/);
    const id = (_a = idMatch == null ? void 0 : idMatch[1]) != null ? _a : "";
    const suffix = extractIdSuffix(id);
    const prevCount = ownedMap.get(`${set}#${number}${suffix}`);
    if (prevCount && prevCount > 0) {
      return row.replace(
        `unchecked id="${id}"`,
        prevCount > 1 ? `checked id="${id}" data-count="${prevCount}"` : `checked id="${id}"`
      );
    }
    return row;
  });
}
async function patchFrontmatter(file, key, value, vault) {
  const content = await vault.read(file);
  const fmEnd = content.indexOf("\n---", 4);
  if (!content.startsWith("---\n") || fmEnd === -1) return;
  const lines = content.split("\n");
  const endIdx = lines.findIndex((l, i) => i > 0 && l === "---");
  if (endIdx === -1) return;
  const existing = lines.findIndex((l) => l.trimStart().startsWith(`${key}:`));
  const serialized = `${key}: ${yamlStr(value)}`;
  if (existing !== -1 && existing < endIdx) {
    lines[existing] = serialized;
  } else {
    lines.splice(endIdx, 0, serialized);
  }
  await vault.modify(file, lines.join("\n"));
}

// src/migrations.ts
function semverGt(a, b) {
  var _a, _b;
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = ((_a = pa[i]) != null ? _a : 0) - ((_b = pb[i]) != null ? _b : 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}
var MIGRATIONS = [
  {
    // Introduced: cssclasses, finish-import, all-prints
    toVersion: "0.2.0",
    run: async (file, content, vault) => {
      if (!/cssclasses:/.test(content)) {
        await patchFrontmatter(file, "cssclasses", "collectors-file", vault);
        content = await vault.read(file);
      }
      if (/collection-type:\s*mtg-set/.test(content) && !/finish-import:/.test(content)) {
        await patchFrontmatter(file, "finish-import", "all", vault);
        await patchFrontmatter(file, "all-prints", "true", vault);
      }
    }
  }
];
async function migrateCollection(file, fileVersion, currentVersion, vault) {
  if (fileVersion === currentVersion) return false;
  if (fileVersion && !semverGt(currentVersion, fileVersion)) return false;
  const pending = fileVersion ? MIGRATIONS.filter((m) => semverGt(m.toVersion, fileVersion)) : [...MIGRATIONS];
  if (pending.length === 0) {
    await patchFrontmatter(file, "plugin-version", currentVersion, vault);
    return true;
  }
  let content = await vault.read(file);
  for (const m of pending) {
    await m.run(file, content, vault);
    content = await vault.read(file);
  }
  await patchFrontmatter(file, "plugin-version", currentVersion, vault);
  return true;
}

// src/NewCollectionModal.ts
var import_obsidian4 = require("obsidian");

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
async function fetchAllPages(url, onPage, onRateLimit) {
  var _a, _b, _c;
  const cards = [];
  let nextUrl = url;
  let page = 1;
  while (nextUrl) {
    let res = await (0, import_obsidian.requestUrl)({ url: nextUrl, headers: { Accept: "application/json" } });
    if (res.status === 429) {
      const retryAfter = parseInt((_b = (_a = res.headers) == null ? void 0 : _a["retry-after"]) != null ? _b : "30") || 30;
      onRateLimit == null ? void 0 : onRateLimit(retryAfter);
      await delay(retryAfter * 1e3);
      res = await (0, import_obsidian.requestUrl)({ url: nextUrl, headers: { Accept: "application/json" } });
    }
    if (res.status < 200 || res.status >= 300) {
      let details = "";
      try {
        details = (_c = res.json.details) != null ? _c : "";
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
async function fetchSetCards(setCode, onPage, unique = "prints", onRateLimit) {
  const q = encodeURIComponent(`e:${setCode.toLowerCase()} order:set`);
  return fetchAllPages(`${API}/cards/search?q=${q}&unique=${unique}`, onPage, onRateLimit);
}
async function fetchSearchCards(query, onPage, order = "released", onRateLimit) {
  const q = encodeURIComponent(query);
  return fetchAllPages(
    `${API}/cards/search?q=${q}&unique=prints&order=${order}&dir=asc`,
    onPage,
    onRateLimit
  );
}
var scryfallCache = /* @__PURE__ */ new Map();
function getScryfallData(set, number) {
  return scryfallCache.get(`${set.toLowerCase()}#${number}`);
}
function isScryfallCached(set, number) {
  return scryfallCache.has(`${set.toLowerCase()}#${number}`);
}
async function fetchScryfallData(identifiers, onRateLimit) {
  var _a, _b, _c, _d;
  const seen = /* @__PURE__ */ new Set();
  const toFetch = identifiers.filter((id) => {
    const key = `${id.set.toLowerCase()}#${id.collector_number}`;
    if (scryfallCache.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (toFetch.length === 0) return;
  const NULL_ENTRY = { usd: null, usd_foil: null, eur: null, eur_foil: null, tcgplayer_id: null, cardmarket_id: null };
  for (let i = 0; i < toFetch.length; i += 75) {
    if (i > 0) await delay(500);
    const batch = toFetch.slice(i, i + 75);
    let retries = 0;
    let success = false;
    while (retries < 3) {
      try {
        const res = await (0, import_obsidian.requestUrl)({
          url: `${API}/cards/collection`,
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ identifiers: batch })
        });
        if (res.status === 429) {
          const retryAfter = parseInt((_b = (_a = res.headers) == null ? void 0 : _a["retry-after"]) != null ? _b : "30") || 30;
          onRateLimit == null ? void 0 : onRateLimit(retryAfter);
          await delay(retryAfter * 1e3);
          retries++;
          continue;
        }
        if (res.status < 200 || res.status >= 300) {
          console.error(`[Collectors] Scryfall /cards/collection returned ${res.status}`);
          break;
        }
        const data = res.json;
        const foundKeys = /* @__PURE__ */ new Set();
        for (const card of data.data) {
          const key = `${card.set.toLowerCase()}#${card.collector_number}`;
          foundKeys.add(key);
          const p = card.prices;
          scryfallCache.set(key, {
            usd: p.usd != null ? parseFloat(p.usd) : null,
            usd_foil: p.usd_foil != null ? parseFloat(p.usd_foil) : null,
            eur: p.eur != null ? parseFloat(p.eur) : null,
            eur_foil: p.eur_foil != null ? parseFloat(p.eur_foil) : null,
            tcgplayer_id: (_c = card.tcgplayer_id) != null ? _c : null,
            cardmarket_id: (_d = card.cardmarket_id) != null ? _d : null
          });
        }
        for (const id of batch) {
          const key = `${id.set.toLowerCase()}#${id.collector_number}`;
          if (!foundKeys.has(key)) scryfallCache.set(key, { ...NULL_ENTRY });
        }
        success = true;
        break;
      } catch (e) {
        console.error("[Collectors] Scryfall price fetch failed:", e);
        break;
      }
    }
    if (!success) {
      for (const id of batch) {
        const key = `${id.set.toLowerCase()}#${id.collector_number}`;
        if (!scryfallCache.has(key)) scryfallCache.set(key, { ...NULL_ENTRY });
      }
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

// src/TCGDexService.ts
var import_obsidian2 = require("obsidian");
var API2 = "https://api.tcgdex.net/v2/en";
var setsCache = null;
async function fetchAllSets() {
  var _a;
  if (setsCache) return setsCache;
  const res = await (0, import_obsidian2.requestUrl)({ url: `${API2}/sets`, headers: { Accept: "application/json" } });
  if (res.status < 200 || res.status >= 300) return [];
  setsCache = (_a = res.json) != null ? _a : [];
  return setsCache;
}
var VARIANT_DEFS = [
  { key: "normal", suffix: "_n", label: "Normal" },
  { key: "reverse", suffix: "_r", label: "Reverse Holo" },
  { key: "holo", suffix: "_h", label: "Holo" },
  { key: "firstEdition", suffix: "_fe", label: "1st Edition" }
];
var cardCache = /* @__PURE__ */ new Map();
async function delay2(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function fetchPokemonCard(cardId) {
  return fetchCardById(cardId);
}
async function fetchCardById(cardId) {
  if (cardCache.has(cardId)) return cardCache.get(cardId);
  try {
    const res = await (0, import_obsidian2.requestUrl)({
      url: `${API2}/cards/${cardId}`,
      headers: { Accept: "application/json" }
    });
    if (res.status < 200 || res.status >= 300) return null;
    const card = res.json;
    cardCache.set(cardId, card);
    return card;
  } catch (e) {
    return null;
  }
}
async function fetchPokemonSetCards(setId, onProgress) {
  var _a;
  const setRes = await (0, import_obsidian2.requestUrl)({
    url: `${API2}/sets/${setId}`,
    headers: { Accept: "application/json" }
  });
  if (setRes.status < 200 || setRes.status >= 300) {
    throw new Error(`TCGdex set "${setId}" not found (${setRes.status})`);
  }
  const setData = setRes.json;
  const briefs = (_a = setData.cards) != null ? _a : [];
  const total = briefs.length;
  const results = [];
  const BATCH = 10;
  for (let i = 0; i < briefs.length; i += BATCH) {
    if (i > 0) await delay2(50);
    const batch = briefs.slice(i, i + BATCH);
    const cards = await Promise.all(batch.map((b) => fetchCardById(b.id)));
    for (const card of cards) {
      if (card) results.push(card);
    }
    onProgress == null ? void 0 : onProgress(Math.min(i + BATCH, total), total);
  }
  return results;
}
function pokemonCardToMarkdownRows(card) {
  var _a;
  const variants = card.variants;
  const enabled = VARIANT_DEFS.filter((v) => variants == null ? void 0 : variants[v.key]);
  const toRender = enabled.length > 0 ? enabled : [VARIANT_DEFS[0]];
  const imageBase = (_a = card.image) != null ? _a : "";
  const setId = card.set.id.toLowerCase();
  const typeStr = card.types && card.types.length > 0 ? card.types.join("/") : card.category;
  return toRender.map(({ suffix, label }) => {
    var _a2;
    const rowId = `${card.id}${suffix}`;
    const name = `${card.name} (${label})`;
    const imageCell = imageBase ? `![${name}](${imageBase}/high.webp)` : "";
    return `| <input type="checkbox" unchecked id="${rowId}"> | ${imageCell} | ${name} | ${typeStr} | ${(_a2 = card.rarity) != null ? _a2 : ""} | ${setId} | ${card.localId} |  |`;
  });
}
function getTCGPlayerPrice(card, suffix) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
  const t2 = card.tcgplayer;
  if (!t2) return null;
  switch (suffix) {
    case "_n":
      return (_b = (_a = t2.normal) == null ? void 0 : _a.marketPrice) != null ? _b : null;
    case "_r":
      return (_d = (_c = t2["reverse-holofoil"]) == null ? void 0 : _c.marketPrice) != null ? _d : null;
    case "_h":
      return (_f = (_e = t2.holofoil) == null ? void 0 : _e.marketPrice) != null ? _f : null;
    case "_fe":
      return (_j = (_i = (_g = t2["1st-edition-holofoil"]) == null ? void 0 : _g.marketPrice) != null ? _i : (_h = t2.holofoil) == null ? void 0 : _h.marketPrice) != null ? _j : null;
    default:
      return null;
  }
}
function getCardmarketPrice(card, suffix) {
  var _a, _b, _c, _d, _e;
  const cm = card.cardmarket;
  if (!cm) return null;
  if (suffix === "_h") {
    return (_c = (_b = (_a = cm["trend-holo"]) != null ? _a : cm["avg-holo"]) != null ? _b : cm.trend) != null ? _c : null;
  }
  return (_e = (_d = cm.trend) != null ? _d : cm.avg) != null ? _e : null;
}

// src/i18n/index.ts
var import_obsidian3 = require("obsidian");

// src/i18n/en.ts
var en = {
  // Commands / ribbon
  cmd_open_dashboard: "Open Dashboard",
  cmd_new_collection: "New Collection",
  ribbon_dashboard: "Collectors Dashboard",
  // Dashboard header
  dashboard_title: "Collectors",
  btn_refresh: "Refresh",
  btn_new_collection: "+ New Collection",
  empty_no_collections: "No collections found. Create one or configure the folder in settings.",
  // Hero stats
  stat_collections: "Collections",
  stat_cards_owned: "Cards owned",
  stat_invested: "Invested \xB7 {source}",
  stat_to_complete: "To complete",
  // Collection groups
  group_mtg_sets: "MTG Sets",
  group_theme: "Theme Collections",
  // Collection card
  badge_arena: "Arena",
  card_owned_count: "{count} owned",
  card_total_count: "{count} total",
  card_missing_count: "{count} missing",
  card_invested: "{value} invested",
  card_to_complete: "{value} to complete",
  btn_view: "\u229E View",
  btn_view_title: "View cards",
  btn_update_scryfall: "Update from Scryfall",
  btn_edit_collection: "Edit collection",
  // Collection view
  collection_display_text: "Collection",
  loading: "Loading\u2026",
  loading_prices: "Loading prices\u2026",
  loading_rate_limited: "Rate limited \u2014 retrying in {seconds}s\u2026",
  loading_fetching: "Fetching cards from Scryfall\u2026",
  loading_updating: "Updating\u2026",
  loading_page: "Fetching page {page}\u2026",
  // Filters / sort
  filter_all: "All",
  filter_owned: "Owned",
  filter_missing: "Missing",
  finish_foil: "\u2726 Foil",
  finish_normal: "\u25C7 Normal",
  sort_label: "Sort:",
  sort_number: "Number",
  sort_name: "Name",
  sort_price_desc: "Price \u2193",
  sort_price_asc: "Price \u2191",
  sort_newest: "Newest first",
  sort_oldest: "Oldest first",
  search_placeholder: "Search cards...",
  no_cards_match: "No cards match this filter.",
  // Card tile buttons
  btn_add_card: "+ Card",
  btn_remove_copy: "Remove one copy",
  btn_add_copy: "Add one copy",
  price_digital: "Digital",
  // Notices — Scryfall updates
  notice_fetching_for: 'Fetching cards for "{name}"...',
  notice_fetching_page: "Fetching page {page}...",
  notice_rate_limit: "\u23F3 Scryfall rate limit hit \u2014 waiting {seconds}s before retrying.",
  notice_cards_added: 'Added {count} new cards to "{name}".',
  notice_up_to_date: '"{name}" is already up to date.',
  notice_auto_updated: 'Auto-update: added {count} new cards to "{name}".',
  notice_scryfall_failed: "Scryfall update failed: {error}",
  // New collection modal
  modal_new_title: "New Collection",
  modal_edit_title: "Edit Collection",
  coming_soon: "Coming soon",
  field_name: "Collection name",
  field_name_desc: "Display name for this collection",
  field_name_placeholder: "e.g. Bloomburrow Token Boosters",
  field_set_code: "Set code",
  field_set_code_desc: "Scryfall set code (e.g. blb, tblb). Used to auto-fetch cards.",
  field_set_code_ph: "e.g. tblb",
  field_finish: "Print finish",
  field_finish_desc: "Which finish to import from this set.",
  finish_all: "All",
  finish_nonfoil: "Non-foil only",
  finish_foil_only: "Foil only",
  field_all_prints: "All printed cards",
  field_all_prints_desc: "Include all variants: showcase, borderless, extended art, etc. Turn off to import only the main set list.",
  field_query: "Scryfall query or URL",
  field_query_desc: "Paste a Scryfall search URL or type a query directly. Add game:paper to exclude digital-only cards.",
  field_query_ph: "Query: type:turtle game:paper\n\nURL: https://scryfall.com/search?q=...",
  field_autofetch: "Auto-fetch cards from Scryfall",
  field_autofetch_desc: "Populate collection with cards from Scryfall after creation.",
  field_refetch: "Re-fetch cards from Scryfall",
  field_refetch_desc: "Replace all cards with a fresh import. Use when the query or set code changed.",
  refetch_warning: "\u26A0 All cards will be replaced by the new Scryfall results. Previously owned cards matching the new query will have their status preserved.",
  field_auto_update: "Auto-update",
  field_auto_update_desc: "Check for new cards on Scryfall every time the dashboard opens. Ideal for theme collections.",
  field_type: "Type",
  type_mtg_set: "MTG Set / Product",
  type_mtg_theme: "MTG Theme Collection",
  field_format: "Format",
  field_format_desc: "Physical cards or MTG Arena digital.",
  format_paper: "\u{1F0CF} Paper",
  format_arena: "\u{1F5A5} MTG Arena",
  btn_save: "Save",
  btn_create: "Create",
  btn_cancel: "Cancel",
  notice_name_required: "Collection name is required.",
  notice_saved: "Collection saved.",
  notice_save_failed: "Failed to save: {error}",
  notice_file_exists: "File already exists: {path}",
  notice_create_failed: "Failed to create collection: {error}",
  notice_fetch_failed: "Scryfall fetch failed: {error}",
  notice_added_to: 'Added {count} cards to "{name}".',
  notice_reimported: "Re-imported {count} cards. {preserved}/{total} owned entries preserved.",
  notice_reimported_simple: "Re-imported {count} cards.",
  // Card search modal
  csm_title: 'Add card to "{name}"',
  csm_placeholder: "Type card name...",
  csm_no_matches: "No matches",
  csm_loading_printings: "Loading printings...",
  csm_no_printings: "No printings found.",
  csm_hint: "Select printings to add (click to toggle):",
  csm_selected: "{count} selected",
  csm_add_btn: "Add to Collection",
  notice_cards_added_csm: 'Added {count} card(s) to "{name}".',
  notice_already_in_coll: "All selected cards already in collection.",
  // Settings
  settings_tab_general: "General",
  settings_tab_mtg: "Magic: The Gathering",
  settings_tab_pokemon: "Pok\xE9mon",
  settings_tab_onepiece: "One Piece",
  settings_tab_yugioh: "Yu-Gi-Oh!",
  settings_section_collections: "Collections",
  settings_folder: "Collections folder",
  settings_folder_desc: "Folder to scan for .collection files. Leave empty to scan the entire vault.",
  settings_folder_ph: "e.g. 004 MTG",
  settings_section_card_data: "Card Data",
  settings_card_data_desc: "Source used to fetch card lists and images.",
  settings_source: "Source",
  settings_section_prices: "Prices",
  settings_prices_desc: "Choose where to fetch card prices. If a provider has no API key configured, Scryfall USD is used as fallback.",
  settings_provider: "Provider",
  settings_price_scryfall_usd: "Scryfall \u2014 USD",
  settings_price_scryfall_eur: "Scryfall \u2014 EUR",
  settings_price_tcgplayer: "TCGPlayer (API key required)",
  settings_price_cardmarket: "Cardmarket (credentials required)",
  settings_section_tcgplayer: "TCGPlayer",
  settings_tcgplayer_desc: "Get your public API key at developer.tcgplayer.com. Uses market price (USD).",
  settings_tcgplayer_key: "Public API key",
  settings_tcgplayer_key_desc: "Bearer token for TCGPlayer API v1.39.0.",
  settings_tcgplayer_ph: "Paste your public key here",
  settings_section_cardmarket: "Cardmarket",
  settings_cardmarket_desc: "OAuth 1.0a credentials from your Cardmarket developer account. Uses TREND price (EUR).",
  settings_cm_app_token: "App token",
  settings_cm_app_secret: "App secret",
  settings_cm_access_token: "Access token",
  settings_cm_access_secret: "Access token secret",
  settings_enable_game: "Enable {game}",
  settings_enable_game_desc: "Show this game as an option when creating new collections.",
  settings_no_card_data: "No card data source available for {game} yet.",
  settings_no_price_data: "No price data available for {game} yet.",
  // Collection groups — Pokémon
  group_pokemon_sets: "Pok\xE9mon Sets",
  // Collection type label
  type_pokemon_set: "Pok\xE9mon Set",
  // Pokemon settings tab
  settings_pokemon_price_source: "Price source",
  settings_pokemon_price_source_desc: "Prices are fetched via TCGdex. Choose currency.",
  settings_pokemon_tcgplayer: "TCGPlayer \xB7 USD",
  settings_pokemon_cardmarket: "Cardmarket \xB7 EUR",
  settings_pokemon_sponsor: "Powered by TCGdex (open source)",
  settings_pokemon_sponsor_desc: "TCGdex provides free Pok\xE9mon card data and prices. Consider sponsoring!",
  // Pokémon new-collection modal
  field_name_ph_pokemon: "e.g. Sword & Shield\u2014Darkness Ablaze",
  pokemon_form_type_catalog: "Set catalog",
  pokemon_form_type_custom: "Custom (enter ID)",
  pokemon_set_search_ph: "Search by name or ID\u2026",
  pokemon_set_loading: "Loading sets\u2026",
  pokemon_set_no_results: "No sets found.",
  pokemon_set_load_failed: "Failed to load sets.",
  pokemon_set_card_count: "{count} cards",
  field_tcgdex_set_id: "TCGdex set ID",
  field_pokemon_variant: "Print finish",
  field_pokemon_variant_desc: "Which variants to import from this set.",
  pokemon_variant_all: "All",
  pokemon_variant_normal: "Normal only",
  pokemon_variant_reverse: "Reverse Holo only",
  pokemon_variant_holo: "Holo only",
  pokemon_variant_first_edition: "1st Edition only",
  field_tcgdex_set_id_desc: "The TCGdex set identifier. Find it at tcgdex.dev.",
  field_tcgdex_set_id_ph: "e.g. swsh1, sv10, base1",
  // Pokémon notices
  refetch_warning_pokemon: "\u26A0 All cards will be replaced with cards from the new set. Previously owned cards will have their status preserved.",
  notice_fetching_pokemon: 'Fetching Pok\xE9mon cards for "{name}"\u2026',
  notice_fetching_pokemon_progress: "Fetching {fetched}/{total} cards\u2026",
  notice_pokemon_added: 'Added {count} new Pok\xE9mon cards to "{name}".',
  notice_pokemon_up_to_date: '"{name}" is already up to date.',
  notice_pokemon_failed: "Pok\xE9mon fetch failed: {error}",
  // Pokémon variant filter buttons
  variant_normal: "\u25C7 Normal",
  variant_reverse_holo: "\u21BA Reverse Holo",
  variant_holo: "\u2726 Holo",
  variant_first_edition: "\u2460 1st Edition"
};

// src/i18n/es.ts
var es = {
  cmd_open_dashboard: "Abrir Dashboard",
  cmd_new_collection: "Nueva Colecci\xF3n",
  ribbon_dashboard: "Dashboard de Collectors",
  dashboard_title: "Collectors",
  btn_refresh: "Actualizar",
  btn_new_collection: "+ Nueva Colecci\xF3n",
  empty_no_collections: "No se encontraron colecciones. Crea una o configura la carpeta en ajustes.",
  stat_collections: "Colecciones",
  stat_cards_owned: "Cartas pose\xEDdas",
  stat_invested: "Invertido \xB7 {source}",
  stat_to_complete: "Para completar",
  group_mtg_sets: "Sets de MTG",
  group_theme: "Colecciones Tem\xE1ticas",
  badge_arena: "Arena",
  card_owned_count: "{count} pose\xEDdas",
  card_total_count: "{count} total",
  card_missing_count: "{count} faltantes",
  card_invested: "{value} invertido",
  card_to_complete: "{value} para completar",
  btn_view: "\u229E Ver",
  btn_view_title: "Ver cartas",
  btn_update_scryfall: "Actualizar desde Scryfall",
  btn_edit_collection: "Editar colecci\xF3n",
  collection_display_text: "Colecci\xF3n",
  loading: "Cargando\u2026",
  loading_prices: "Cargando precios\u2026",
  loading_rate_limited: "L\xEDmite de peticiones \u2014 reintentando en {seconds}s\u2026",
  loading_fetching: "Obteniendo cartas de Scryfall\u2026",
  loading_updating: "Actualizando\u2026",
  loading_page: "Obteniendo p\xE1gina {page}\u2026",
  filter_all: "Todas",
  filter_owned: "Pose\xEDdas",
  filter_missing: "Faltantes",
  finish_foil: "\u2726 Foil",
  finish_normal: "\u25C7 Normal",
  sort_label: "Ordenar:",
  sort_number: "N\xFAmero",
  sort_name: "Nombre",
  sort_price_desc: "Precio \u2193",
  sort_price_asc: "Precio \u2191",
  sort_newest: "M\xE1s nuevas primero",
  sort_oldest: "M\xE1s antiguas primero",
  search_placeholder: "Buscar cartas...",
  no_cards_match: "Ninguna carta coincide con este filtro.",
  btn_add_card: "+ Carta",
  btn_remove_copy: "Quitar una copia",
  btn_add_copy: "Agregar una copia",
  price_digital: "Digital",
  notice_fetching_for: 'Obteniendo cartas para "{name}"...',
  notice_fetching_page: "Obteniendo p\xE1gina {page}...",
  notice_rate_limit: "\u23F3 L\xEDmite de Scryfall alcanzado \u2014 esperando {seconds}s antes de reintentar.",
  notice_cards_added: 'Se agregaron {count} cartas nuevas a "{name}".',
  notice_up_to_date: '"{name}" ya est\xE1 actualizada.',
  notice_auto_updated: 'Auto-actualizaci\xF3n: {count} cartas nuevas agregadas a "{name}".',
  notice_scryfall_failed: "Error al actualizar desde Scryfall: {error}",
  modal_new_title: "Nueva Colecci\xF3n",
  modal_edit_title: "Editar Colecci\xF3n",
  coming_soon: "Pr\xF3ximamente",
  field_name: "Nombre de la colecci\xF3n",
  field_name_desc: "Nombre que se mostrar\xE1 para esta colecci\xF3n",
  field_name_placeholder: "ej. Bloomburrow Token Boosters",
  field_set_code: "C\xF3digo de set",
  field_set_code_desc: "C\xF3digo de set de Scryfall (ej. blb, tblb). Se usa para obtener cartas autom\xE1ticamente.",
  field_set_code_ph: "ej. tblb",
  field_finish: "Acabado",
  field_finish_desc: "Qu\xE9 acabado importar de este set.",
  finish_all: "Todos",
  finish_nonfoil: "Solo normal",
  finish_foil_only: "Solo foil",
  field_all_prints: "Todas las variantes",
  field_all_prints_desc: "Incluye variantes: showcase, sin borde, extended art, etc. Desactiva para importar solo la lista principal del set.",
  field_query: "Query o URL de Scryfall",
  field_query_desc: "Pega una URL de Scryfall o escribe una query. Agrega game:paper para excluir cartas digitales.",
  field_query_ph: "Query: type:turtle game:paper\n\nURL: https://scryfall.com/search?q=...",
  field_autofetch: "Auto-obtener cartas de Scryfall",
  field_autofetch_desc: "Llenar la colecci\xF3n con cartas de Scryfall al crearla.",
  field_refetch: "Volver a obtener cartas de Scryfall",
  field_refetch_desc: "Reemplazar todas las cartas con una importaci\xF3n nueva. Usar cuando cambi\xF3 la query o el c\xF3digo de set.",
  refetch_warning: "\u26A0 Todas las cartas ser\xE1n reemplazadas con los nuevos resultados. Las cartas pose\xEDdas que coincidan conservar\xE1n su estado.",
  field_auto_update: "Auto-actualizar",
  field_auto_update_desc: "Buscar nuevas cartas en Scryfall cada vez que se abre el dashboard. Ideal para colecciones tem\xE1ticas.",
  field_type: "Tipo",
  type_mtg_set: "Set / Producto MTG",
  type_mtg_theme: "Colecci\xF3n Tem\xE1tica MTG",
  field_format: "Formato",
  field_format_desc: "Cartas f\xEDsicas o MTG Arena digital.",
  format_paper: "\u{1F0CF} F\xEDsico",
  format_arena: "\u{1F5A5} MTG Arena",
  btn_save: "Guardar",
  btn_create: "Crear",
  btn_cancel: "Cancelar",
  notice_name_required: "El nombre de la colecci\xF3n es obligatorio.",
  notice_saved: "Colecci\xF3n guardada.",
  notice_save_failed: "Error al guardar: {error}",
  notice_file_exists: "El archivo ya existe: {path}",
  notice_create_failed: "Error al crear la colecci\xF3n: {error}",
  notice_fetch_failed: "Error al obtener de Scryfall: {error}",
  notice_added_to: 'Se agregaron {count} cartas a "{name}".',
  notice_reimported: "Se reimportaron {count} cartas. {preserved}/{total} entradas pose\xEDdas conservadas.",
  notice_reimported_simple: "Se reimportaron {count} cartas.",
  csm_title: 'Agregar carta a "{name}"',
  csm_placeholder: "Escribe el nombre de la carta...",
  csm_no_matches: "Sin resultados",
  csm_loading_printings: "Cargando ediciones...",
  csm_no_printings: "No se encontraron ediciones.",
  csm_hint: "Selecciona ediciones para agregar (clic para alternar):",
  csm_selected: "{count} seleccionadas",
  csm_add_btn: "Agregar a la Colecci\xF3n",
  notice_cards_added_csm: 'Se agregaron {count} carta(s) a "{name}".',
  notice_already_in_coll: "Todas las cartas seleccionadas ya est\xE1n en la colecci\xF3n.",
  settings_tab_general: "General",
  settings_tab_mtg: "Magic: The Gathering",
  settings_section_collections: "Colecciones",
  settings_folder: "Carpeta de colecciones",
  settings_folder_desc: "Carpeta para buscar archivos .collection. Dejar vac\xEDo para buscar en todo el vault.",
  settings_folder_ph: "ej. 004 MTG",
  settings_section_card_data: "Datos de cartas",
  settings_card_data_desc: "Fuente para obtener listas de cartas e im\xE1genes.",
  settings_source: "Fuente",
  settings_section_prices: "Precios",
  settings_prices_desc: "Elige d\xF3nde obtener precios. Si no hay clave de API configurada, se usa Scryfall USD.",
  settings_provider: "Proveedor",
  settings_price_scryfall_usd: "Scryfall \u2014 USD",
  settings_price_scryfall_eur: "Scryfall \u2014 EUR",
  settings_price_tcgplayer: "TCGPlayer (requiere clave)",
  settings_price_cardmarket: "Cardmarket (requiere credenciales)",
  settings_section_tcgplayer: "TCGPlayer",
  settings_tcgplayer_desc: "Obt\xE9n tu clave p\xFAblica en developer.tcgplayer.com. Usa precio de mercado (USD).",
  settings_tcgplayer_key: "Clave p\xFAblica",
  settings_tcgplayer_key_desc: "Token Bearer para TCGPlayer API v1.39.0.",
  settings_tcgplayer_ph: "Pega tu clave p\xFAblica aqu\xED",
  settings_section_cardmarket: "Cardmarket",
  settings_cardmarket_desc: "Credenciales OAuth 1.0a de tu cuenta de desarrollador de Cardmarket. Usa precio TREND (EUR).",
  settings_cm_app_token: "Token de app",
  settings_cm_app_secret: "Secreto de app",
  settings_cm_access_token: "Token de acceso",
  settings_cm_access_secret: "Secreto del token de acceso",
  settings_enable_game: "Activar {game}",
  settings_enable_game_desc: "Mostrar este juego al crear nuevas colecciones.",
  settings_no_card_data: "No hay fuente de datos de cartas para {game} a\xFAn.",
  settings_no_price_data: "No hay datos de precios para {game} a\xFAn.",
  group_pokemon_sets: "Sets de Pok\xE9mon",
  type_pokemon_set: "Set de Pok\xE9mon",
  settings_pokemon_price_source: "Fuente de precios",
  settings_pokemon_price_source_desc: "Los precios se obtienen v\xEDa TCGdex. Elige la moneda.",
  settings_pokemon_sponsor: "Desarrollado por TCGdex (c\xF3digo abierto)",
  settings_pokemon_sponsor_desc: "TCGdex provee datos y precios gratuitos de Pok\xE9mon. \xA1Considera patrocinar!",
  field_tcgdex_set_id: "ID del set de TCGdex",
  field_pokemon_variant: "Acabado de impresi\xF3n",
  field_pokemon_variant_desc: "Qu\xE9 variantes importar de este set.",
  pokemon_variant_all: "Todas",
  pokemon_variant_normal: "Solo Normal",
  pokemon_variant_reverse: "Solo Reverse Holo",
  pokemon_variant_holo: "Solo Holo",
  pokemon_variant_first_edition: "Solo 1ra Edici\xF3n",
  field_tcgdex_set_id_desc: "El identificador del set en TCGdex. B\xFAscalo en tcgdex.dev.",
  field_tcgdex_set_id_ph: "ej. swsh1, sv10, base1",
  refetch_warning_pokemon: "\u26A0 Todas las cartas ser\xE1n reemplazadas por las del nuevo set. Las cartas marcadas como pose\xEDdas conservar\xE1n su estado.",
  notice_fetching_pokemon: 'Obteniendo cartas de Pok\xE9mon para "{name}"\u2026',
  notice_fetching_pokemon_progress: "Obteniendo {fetched}/{total} cartas\u2026",
  notice_pokemon_added: 'Se agregaron {count} cartas de Pok\xE9mon a "{name}".',
  notice_pokemon_up_to_date: '"{name}" ya est\xE1 actualizado.',
  notice_pokemon_failed: "Error al obtener Pok\xE9mon: {error}",
  variant_normal: "\u25C7 Normal",
  variant_reverse_holo: "\u21BA Reverse Holo",
  variant_holo: "\u2726 Holo",
  variant_first_edition: "\u2460 1ra Edici\xF3n",
  field_name_ph_pokemon: "ej. Espada y Escudo\u2014Choque Rebelde",
  pokemon_form_type_catalog: "Cat\xE1logo de sets",
  pokemon_form_type_custom: "Personalizado (ingresar ID)",
  pokemon_set_search_ph: "Buscar por nombre o ID\u2026",
  pokemon_set_loading: "Cargando sets\u2026",
  pokemon_set_no_results: "No se encontraron sets.",
  pokemon_set_load_failed: "Error al cargar los sets.",
  pokemon_set_card_count: "{count} cartas"
};

// src/i18n/fr.ts
var fr = {
  cmd_open_dashboard: "Ouvrir le tableau de bord",
  cmd_new_collection: "Nouvelle collection",
  ribbon_dashboard: "Tableau de bord Collectors",
  btn_refresh: "Actualiser",
  btn_new_collection: "+ Nouvelle collection",
  empty_no_collections: "Aucune collection trouv\xE9e. Cr\xE9ez-en une ou configurez le dossier dans les param\xE8tres.",
  stat_collections: "Collections",
  stat_cards_owned: "Cartes poss\xE9d\xE9es",
  stat_invested: "Investi \xB7 {source}",
  stat_to_complete: "Pour compl\xE9ter",
  group_mtg_sets: "Sets MTG",
  group_theme: "Collections th\xE9matiques",
  badge_arena: "Arena",
  card_owned_count: "{count} poss\xE9d\xE9es",
  card_total_count: "{count} total",
  card_missing_count: "{count} manquantes",
  card_invested: "{value} investi",
  card_to_complete: "{value} pour compl\xE9ter",
  btn_view: "\u229E Voir",
  btn_view_title: "Voir les cartes",
  btn_update_scryfall: "Mettre \xE0 jour depuis Scryfall",
  btn_edit_collection: "Modifier la collection",
  collection_display_text: "Collection",
  loading: "Chargement\u2026",
  loading_prices: "Chargement des prix\u2026",
  loading_rate_limited: "Limite atteinte \u2014 nouvel essai dans {seconds}s\u2026",
  loading_fetching: "R\xE9cup\xE9ration des cartes depuis Scryfall\u2026",
  loading_updating: "Mise \xE0 jour\u2026",
  loading_page: "R\xE9cup\xE9ration de la page {page}\u2026",
  filter_all: "Tout",
  filter_owned: "Poss\xE9d\xE9es",
  filter_missing: "Manquantes",
  finish_foil: "\u2726 Foil",
  finish_normal: "\u25C7 Normal",
  sort_label: "Trier :",
  sort_number: "Num\xE9ro",
  sort_name: "Nom",
  sort_price_desc: "Prix \u2193",
  sort_price_asc: "Prix \u2191",
  sort_newest: "Plus r\xE9centes d'abord",
  sort_oldest: "Plus anciennes d'abord",
  search_placeholder: "Rechercher des cartes...",
  no_cards_match: "Aucune carte ne correspond \xE0 ce filtre.",
  btn_add_card: "+ Carte",
  btn_remove_copy: "Retirer un exemplaire",
  btn_add_copy: "Ajouter un exemplaire",
  price_digital: "Num\xE9rique",
  notice_fetching_for: "R\xE9cup\xE9ration des cartes pour \xAB {name} \xBB...",
  notice_fetching_page: "R\xE9cup\xE9ration de la page {page}...",
  notice_rate_limit: "\u23F3 Limite Scryfall atteinte \u2014 attente de {seconds}s avant de r\xE9essayer.",
  notice_cards_added: "{count} nouvelles cartes ajout\xE9es \xE0 \xAB {name} \xBB.",
  notice_up_to_date: "\xAB {name} \xBB est d\xE9j\xE0 \xE0 jour.",
  notice_auto_updated: "Mise \xE0 jour auto : {count} nouvelles cartes ajout\xE9es \xE0 \xAB {name} \xBB.",
  notice_scryfall_failed: "\xC9chec de la mise \xE0 jour Scryfall : {error}",
  modal_new_title: "Nouvelle collection",
  modal_edit_title: "Modifier la collection",
  coming_soon: "Bient\xF4t disponible",
  field_name: "Nom de la collection",
  field_name_desc: "Nom affich\xE9 pour cette collection",
  field_name_placeholder: "ex. Bloomburrow Token Boosters",
  field_set_code: "Code du set",
  field_set_code_desc: "Code de set Scryfall (ex. blb, tblb). Utilis\xE9 pour r\xE9cup\xE9rer les cartes automatiquement.",
  field_set_code_ph: "ex. tblb",
  field_finish: "Finition",
  field_finish_desc: "Quelle finition importer depuis ce set.",
  finish_all: "Toutes",
  finish_nonfoil: "Normal uniquement",
  finish_foil_only: "Foil uniquement",
  field_all_prints: "Toutes les variantes",
  field_all_prints_desc: "Inclure toutes les variantes : showcase, sans bordure, extended art, etc. D\xE9sactivez pour n'importer que la liste principale.",
  field_query: "Requ\xEAte ou URL Scryfall",
  field_query_desc: "Collez une URL Scryfall ou saisissez une requ\xEAte. Ajoutez game:paper pour exclure les cartes num\xE9riques.",
  field_query_ph: "Requ\xEAte : type:turtle game:paper\n\nURL : https://scryfall.com/search?q=...",
  field_autofetch: "R\xE9cup\xE9rer automatiquement depuis Scryfall",
  field_autofetch_desc: "Remplir la collection avec les cartes Scryfall apr\xE8s cr\xE9ation.",
  field_refetch: "R\xE9cup\xE9rer \xE0 nouveau depuis Scryfall",
  field_refetch_desc: "Remplacer toutes les cartes par une nouvelle importation. \xC0 utiliser si la requ\xEAte ou le code de set a chang\xE9.",
  refetch_warning: "\u26A0 Toutes les cartes seront remplac\xE9es par les nouveaux r\xE9sultats. Les cartes poss\xE9d\xE9es correspondantes conserveront leur \xE9tat.",
  field_auto_update: "Mise \xE0 jour automatique",
  field_auto_update_desc: "Rechercher de nouvelles cartes sur Scryfall \xE0 chaque ouverture du tableau de bord. Id\xE9al pour les collections th\xE9matiques.",
  field_type: "Type",
  type_mtg_set: "Set / Produit MTG",
  type_mtg_theme: "Collection th\xE9matique MTG",
  field_format: "Format",
  field_format_desc: "Cartes physiques ou MTG Arena num\xE9rique.",
  format_paper: "\u{1F0CF} Papier",
  format_arena: "\u{1F5A5} MTG Arena",
  btn_save: "Enregistrer",
  btn_create: "Cr\xE9er",
  btn_cancel: "Annuler",
  notice_name_required: "Le nom de la collection est requis.",
  notice_saved: "Collection enregistr\xE9e.",
  notice_save_failed: "\xC9chec de l'enregistrement : {error}",
  notice_file_exists: "Le fichier existe d\xE9j\xE0 : {path}",
  notice_create_failed: "\xC9chec de la cr\xE9ation : {error}",
  notice_fetch_failed: "\xC9chec de la r\xE9cup\xE9ration Scryfall : {error}",
  notice_added_to: "{count} cartes ajout\xE9es \xE0 \xAB {name} \xBB.",
  notice_reimported: "{count} cartes r\xE9import\xE9es. {preserved}/{total} entr\xE9es poss\xE9d\xE9es pr\xE9serv\xE9es.",
  notice_reimported_simple: "{count} cartes r\xE9import\xE9es.",
  csm_title: "Ajouter une carte \xE0 \xAB {name} \xBB",
  csm_placeholder: "Saisissez le nom de la carte...",
  csm_no_matches: "Aucun r\xE9sultat",
  csm_loading_printings: "Chargement des \xE9ditions...",
  csm_no_printings: "Aucune \xE9dition trouv\xE9e.",
  csm_hint: "S\xE9lectionnez des \xE9ditions \xE0 ajouter (cliquez pour basculer) :",
  csm_selected: "{count} s\xE9lectionn\xE9e(s)",
  csm_add_btn: "Ajouter \xE0 la collection",
  notice_cards_added_csm: "{count} carte(s) ajout\xE9e(s) \xE0 \xAB {name} \xBB.",
  notice_already_in_coll: "Toutes les cartes s\xE9lectionn\xE9es sont d\xE9j\xE0 dans la collection.",
  settings_tab_general: "G\xE9n\xE9ral",
  settings_tab_mtg: "Magic : L'Assembl\xE9e",
  settings_section_collections: "Collections",
  settings_folder: "Dossier des collections",
  settings_folder_desc: "Dossier \xE0 scanner pour les fichiers .collection. Laissez vide pour scanner tout le coffre.",
  settings_folder_ph: "ex. 004 MTG",
  settings_section_card_data: "Donn\xE9es des cartes",
  settings_card_data_desc: "Source pour r\xE9cup\xE9rer les listes de cartes et les images.",
  settings_source: "Source",
  settings_section_prices: "Prix",
  settings_prices_desc: "Choisissez o\xF9 r\xE9cup\xE9rer les prix. Sans cl\xE9 API configur\xE9e, Scryfall USD est utilis\xE9 par d\xE9faut.",
  settings_provider: "Fournisseur",
  settings_price_scryfall_usd: "Scryfall \u2014 USD",
  settings_price_scryfall_eur: "Scryfall \u2014 EUR",
  settings_price_tcgplayer: "TCGPlayer (cl\xE9 API requise)",
  settings_price_cardmarket: "Cardmarket (identifiants requis)",
  settings_section_tcgplayer: "TCGPlayer",
  settings_tcgplayer_desc: "Obtenez votre cl\xE9 publique sur developer.tcgplayer.com. Utilise le prix du march\xE9 (USD).",
  settings_tcgplayer_key: "Cl\xE9 publique",
  settings_tcgplayer_key_desc: "Token Bearer pour TCGPlayer API v1.39.0.",
  settings_tcgplayer_ph: "Collez votre cl\xE9 publique ici",
  settings_section_cardmarket: "Cardmarket",
  settings_cardmarket_desc: "Identifiants OAuth 1.0a de votre compte d\xE9veloppeur Cardmarket. Utilise le prix TREND (EUR).",
  settings_cm_app_token: "Token d'application",
  settings_cm_app_secret: "Secret d'application",
  settings_cm_access_token: "Token d'acc\xE8s",
  settings_cm_access_secret: "Secret du token d'acc\xE8s",
  settings_enable_game: "Activer {game}",
  settings_enable_game_desc: "Afficher ce jeu lors de la cr\xE9ation de nouvelles collections.",
  settings_no_card_data: "Aucune source de donn\xE9es de cartes disponible pour {game} pour l'instant.",
  settings_no_price_data: "Aucune donn\xE9e de prix disponible pour {game} pour l'instant.",
  group_pokemon_sets: "Sets Pok\xE9mon",
  type_pokemon_set: "Set Pok\xE9mon",
  settings_pokemon_price_source: "Source des prix",
  settings_pokemon_price_source_desc: "Les prix sont r\xE9cup\xE9r\xE9s via TCGdex. Choisissez la devise.",
  settings_pokemon_sponsor: "Propuls\xE9 par TCGdex (open source)",
  settings_pokemon_sponsor_desc: "TCGdex fournit des donn\xE9es et prix Pok\xE9mon gratuits. Pensez \xE0 sponsoriser !",
  field_tcgdex_set_id: "ID du set TCGdex",
  field_tcgdex_set_id_desc: "L'identifiant du set TCGdex. Trouvez-le sur tcgdex.dev.",
  field_tcgdex_set_id_ph: "ex. swsh1, sv10, base1",
  notice_fetching_pokemon: 'R\xE9cup\xE9ration des cartes Pok\xE9mon pour "{name}"\u2026',
  notice_fetching_pokemon_progress: "R\xE9cup\xE9ration de {fetched}/{total} cartes\u2026",
  notice_pokemon_added: '{count} nouvelles cartes Pok\xE9mon ajout\xE9es \xE0 "{name}".',
  notice_pokemon_up_to_date: '"{name}" est d\xE9j\xE0 \xE0 jour.',
  notice_pokemon_failed: "\xC9chec de la r\xE9cup\xE9ration Pok\xE9mon : {error}",
  variant_normal: "\u25C7 Normal",
  variant_reverse_holo: "\u21BA Reverse Holo",
  variant_holo: "\u2726 Holo",
  variant_first_edition: "\u2460 1re \xC9dition"
};

// src/i18n/de.ts
var de = {
  cmd_open_dashboard: "Dashboard \xF6ffnen",
  cmd_new_collection: "Neue Sammlung",
  ribbon_dashboard: "Collectors-Dashboard",
  btn_refresh: "Aktualisieren",
  btn_new_collection: "+ Neue Sammlung",
  empty_no_collections: "Keine Sammlungen gefunden. Erstelle eine oder konfiguriere den Ordner in den Einstellungen.",
  stat_collections: "Sammlungen",
  stat_cards_owned: "Besessene Karten",
  stat_invested: "Investiert \xB7 {source}",
  stat_to_complete: "Zum Vervollst\xE4ndigen",
  group_mtg_sets: "MTG-Sets",
  group_theme: "Themensammlungen",
  badge_arena: "Arena",
  card_owned_count: "{count} besessen",
  card_total_count: "{count} gesamt",
  card_missing_count: "{count} fehlend",
  card_invested: "{value} investiert",
  card_to_complete: "{value} zum Vervollst\xE4ndigen",
  btn_view: "\u229E Ansehen",
  btn_view_title: "Karten ansehen",
  btn_update_scryfall: "Von Scryfall aktualisieren",
  btn_edit_collection: "Sammlung bearbeiten",
  collection_display_text: "Sammlung",
  loading: "L\xE4dt\u2026",
  loading_prices: "Preise werden geladen\u2026",
  loading_rate_limited: "Anfragelimit erreicht \u2014 Neuer Versuch in {seconds}s\u2026",
  loading_fetching: "Karten von Scryfall abrufen\u2026",
  loading_updating: "Aktualisiert\u2026",
  loading_page: "Seite {page} wird abgerufen\u2026",
  filter_all: "Alle",
  filter_owned: "Besessen",
  filter_missing: "Fehlend",
  finish_foil: "\u2726 Foil",
  finish_normal: "\u25C7 Normal",
  sort_label: "Sortieren:",
  sort_number: "Nummer",
  sort_name: "Name",
  sort_price_desc: "Preis \u2193",
  sort_price_asc: "Preis \u2191",
  sort_newest: "Neueste zuerst",
  sort_oldest: "\xC4lteste zuerst",
  search_placeholder: "Karten suchen...",
  no_cards_match: "Keine Karten entsprechen diesem Filter.",
  btn_add_card: "+ Karte",
  btn_remove_copy: "Eine Kopie entfernen",
  btn_add_copy: "Eine Kopie hinzuf\xFCgen",
  price_digital: "Digital",
  notice_fetching_for: 'Karten f\xFCr \u201E{name}" werden abgerufen...',
  notice_fetching_page: "Seite {page} wird abgerufen...",
  notice_rate_limit: "\u23F3 Scryfall-Anfragelimit erreicht \u2014 warte {seconds}s vor dem n\xE4chsten Versuch.",
  notice_cards_added: '{count} neue Karten zu \u201E{name}" hinzugef\xFCgt.',
  notice_up_to_date: '\u201E{name}" ist bereits aktuell.',
  notice_auto_updated: 'Auto-Update: {count} neue Karten zu \u201E{name}" hinzugef\xFCgt.',
  notice_scryfall_failed: "Scryfall-Update fehlgeschlagen: {error}",
  modal_new_title: "Neue Sammlung",
  modal_edit_title: "Sammlung bearbeiten",
  coming_soon: "Demn\xE4chst verf\xFCgbar",
  field_name: "Sammlungsname",
  field_name_desc: "Anzeigename f\xFCr diese Sammlung",
  field_name_placeholder: "z.B. Bloomburrow Token Boosters",
  field_set_code: "Set-Code",
  field_set_code_desc: "Scryfall Set-Code (z.B. blb, tblb). Wird zum automatischen Abrufen von Karten verwendet.",
  field_set_code_ph: "z.B. tblb",
  field_finish: "Veredelung",
  field_finish_desc: "Welche Veredelung aus diesem Set importiert werden soll.",
  finish_all: "Alle",
  finish_nonfoil: "Nur Normal",
  finish_foil_only: "Nur Foil",
  field_all_prints: "Alle Druckvarianten",
  field_all_prints_desc: "Alle Varianten einschlie\xDFen: Showcase, rahmenlos, Extended Art usw. Deaktiviere f\xFCr nur die Hauptset-Liste.",
  field_query: "Scryfall-Abfrage oder URL",
  field_query_desc: "F\xFCge eine Scryfall-Such-URL ein oder gib eine Abfrage ein. F\xFCge game:paper hinzu, um Digital-Karten auszuschlie\xDFen.",
  field_query_ph: "Abfrage: type:turtle game:paper\n\nURL: https://scryfall.com/search?q=...",
  field_autofetch: "Karten automatisch von Scryfall abrufen",
  field_autofetch_desc: "Sammlung nach der Erstellung mit Karten von Scryfall bef\xFCllen.",
  field_refetch: "Karten erneut von Scryfall abrufen",
  field_refetch_desc: "Alle Karten durch einen neuen Import ersetzen. Verwenden wenn Abfrage oder Set-Code ge\xE4ndert wurde.",
  refetch_warning: "\u26A0 Alle Karten werden durch neue Scryfall-Ergebnisse ersetzt. Besessene Karten, die der neuen Abfrage entsprechen, behalten ihren Status.",
  field_auto_update: "Automatische Aktualisierung",
  field_auto_update_desc: "Bei jedem \xD6ffnen des Dashboards nach neuen Karten auf Scryfall suchen. Ideal f\xFCr Themensammlungen.",
  field_type: "Typ",
  type_mtg_set: "MTG-Set / Produkt",
  type_mtg_theme: "MTG-Themensammlung",
  field_format: "Format",
  field_format_desc: "Physische Karten oder MTG Arena digital.",
  format_paper: "\u{1F0CF} Papier",
  format_arena: "\u{1F5A5} MTG Arena",
  btn_save: "Speichern",
  btn_create: "Erstellen",
  btn_cancel: "Abbrechen",
  notice_name_required: "Sammlungsname ist erforderlich.",
  notice_saved: "Sammlung gespeichert.",
  notice_save_failed: "Speichern fehlgeschlagen: {error}",
  notice_file_exists: "Datei existiert bereits: {path}",
  notice_create_failed: "Erstellen der Sammlung fehlgeschlagen: {error}",
  notice_fetch_failed: "Scryfall-Abruf fehlgeschlagen: {error}",
  notice_added_to: '{count} Karten zu \u201E{name}" hinzugef\xFCgt.',
  notice_reimported: "{count} Karten neu importiert. {preserved}/{total} besessene Eintr\xE4ge erhalten.",
  notice_reimported_simple: "{count} Karten neu importiert.",
  csm_title: 'Karte zu \u201E{name}" hinzuf\xFCgen',
  csm_placeholder: "Kartenname eingeben...",
  csm_no_matches: "Keine Treffer",
  csm_loading_printings: "Drucke werden geladen...",
  csm_no_printings: "Keine Drucke gefunden.",
  csm_hint: "Drucke zum Hinzuf\xFCgen ausw\xE4hlen (klicken zum Umschalten):",
  csm_selected: "{count} ausgew\xE4hlt",
  csm_add_btn: "Zur Sammlung hinzuf\xFCgen",
  notice_cards_added_csm: '{count} Karte(n) zu \u201E{name}" hinzugef\xFCgt.',
  notice_already_in_coll: "Alle ausgew\xE4hlten Karten sind bereits in der Sammlung.",
  settings_tab_general: "Allgemein",
  settings_tab_mtg: "Magic: The Gathering",
  settings_section_collections: "Sammlungen",
  settings_folder: "Sammlungsordner",
  settings_folder_desc: "Ordner nach .collection-Dateien durchsuchen. Leer lassen, um den gesamten Tresor zu durchsuchen.",
  settings_folder_ph: "z.B. 004 MTG",
  settings_section_card_data: "Kartendaten",
  settings_card_data_desc: "Quelle f\xFCr Kartenlisten und Bilder.",
  settings_source: "Quelle",
  settings_section_prices: "Preise",
  settings_prices_desc: "W\xE4hle, wo Kartenpreise abgerufen werden. Ohne konfigurierten API-Schl\xFCssel wird Scryfall USD verwendet.",
  settings_provider: "Anbieter",
  settings_price_scryfall_usd: "Scryfall \u2014 USD",
  settings_price_scryfall_eur: "Scryfall \u2014 EUR",
  settings_price_tcgplayer: "TCGPlayer (API-Schl\xFCssel erforderlich)",
  settings_price_cardmarket: "Cardmarket (Zugangsdaten erforderlich)",
  settings_section_tcgplayer: "TCGPlayer",
  settings_tcgplayer_desc: "\xD6ffentlichen API-Schl\xFCssel unter developer.tcgplayer.com erhalten. Verwendet Marktpreis (USD).",
  settings_tcgplayer_key: "\xD6ffentlicher API-Schl\xFCssel",
  settings_tcgplayer_key_desc: "Bearer-Token f\xFCr TCGPlayer API v1.39.0.",
  settings_tcgplayer_ph: "\xD6ffentlichen Schl\xFCssel hier einf\xFCgen",
  settings_section_cardmarket: "Cardmarket",
  settings_cardmarket_desc: "OAuth 1.0a-Zugangsdaten aus deinem Cardmarket-Entwicklerkonto. Verwendet TREND-Preis (EUR).",
  settings_cm_app_token: "App-Token",
  settings_cm_app_secret: "App-Geheimnis",
  settings_cm_access_token: "Zugriffstoken",
  settings_cm_access_secret: "Zugriffstoken-Geheimnis",
  settings_enable_game: "{game} aktivieren",
  settings_enable_game_desc: "Dieses Spiel beim Erstellen neuer Sammlungen anzeigen.",
  settings_no_card_data: "Noch keine Kartendatenquelle f\xFCr {game} verf\xFCgbar.",
  settings_no_price_data: "Noch keine Preisdaten f\xFCr {game} verf\xFCgbar.",
  group_pokemon_sets: "Pok\xE9mon-Sets",
  type_pokemon_set: "Pok\xE9mon-Set",
  settings_pokemon_price_source: "Preisquelle",
  settings_pokemon_price_source_desc: "Preise werden \xFCber TCGdex abgerufen. W\xE4hle die W\xE4hrung.",
  settings_pokemon_sponsor: "Powered by TCGdex (Open Source)",
  settings_pokemon_sponsor_desc: "TCGdex stellt kostenlose Pok\xE9mon-Kartendaten und -Preise bereit. Bitte unterst\xFCtzen!",
  field_tcgdex_set_id: "TCGdex-Set-ID",
  field_tcgdex_set_id_desc: "Die TCGdex-Set-Kennung. Finde sie auf tcgdex.dev.",
  field_tcgdex_set_id_ph: "z.B. swsh1, sv10, base1",
  notice_fetching_pokemon: 'Pok\xE9mon-Karten werden f\xFCr "{name}" abgerufen\u2026',
  notice_fetching_pokemon_progress: "{fetched}/{total} Karten werden abgerufen\u2026",
  notice_pokemon_added: '{count} neue Pok\xE9mon-Karten zu "{name}" hinzugef\xFCgt.',
  notice_pokemon_up_to_date: '"{name}" ist bereits aktuell.',
  notice_pokemon_failed: "Pok\xE9mon-Abruf fehlgeschlagen: {error}",
  variant_normal: "\u25C7 Normal",
  variant_reverse_holo: "\u21BA Reverse Holo",
  variant_holo: "\u2726 Holo",
  variant_first_edition: "\u2460 Erstauflage"
};

// src/i18n/pt.ts
var pt = {
  cmd_open_dashboard: "Abrir Dashboard",
  cmd_new_collection: "Nova Cole\xE7\xE3o",
  ribbon_dashboard: "Dashboard do Collectors",
  btn_refresh: "Atualizar",
  btn_new_collection: "+ Nova Cole\xE7\xE3o",
  empty_no_collections: "Nenhuma cole\xE7\xE3o encontrada. Crie uma ou configure a pasta nas configura\xE7\xF5es.",
  stat_collections: "Cole\xE7\xF5es",
  stat_cards_owned: "Cartas possu\xEDdas",
  stat_invested: "Investido \xB7 {source}",
  stat_to_complete: "Para completar",
  group_mtg_sets: "Sets de MTG",
  group_theme: "Cole\xE7\xF5es Tem\xE1ticas",
  badge_arena: "Arena",
  card_owned_count: "{count} possu\xEDdas",
  card_total_count: "{count} total",
  card_missing_count: "{count} faltando",
  card_invested: "{value} investido",
  card_to_complete: "{value} para completar",
  btn_view: "\u229E Ver",
  btn_view_title: "Ver cartas",
  btn_update_scryfall: "Atualizar do Scryfall",
  btn_edit_collection: "Editar cole\xE7\xE3o",
  collection_display_text: "Cole\xE7\xE3o",
  loading: "Carregando\u2026",
  loading_prices: "Carregando pre\xE7os\u2026",
  loading_rate_limited: "Limite de requisi\xE7\xF5es \u2014 tentando novamente em {seconds}s\u2026",
  loading_fetching: "Buscando cartas do Scryfall\u2026",
  loading_updating: "Atualizando\u2026",
  loading_page: "Buscando p\xE1gina {page}\u2026",
  filter_all: "Todas",
  filter_owned: "Possu\xEDdas",
  filter_missing: "Faltando",
  finish_foil: "\u2726 Foil",
  finish_normal: "\u25C7 Normal",
  sort_label: "Ordenar:",
  sort_number: "N\xFAmero",
  sort_name: "Nome",
  sort_price_desc: "Pre\xE7o \u2193",
  sort_price_asc: "Pre\xE7o \u2191",
  sort_newest: "Mais recentes primeiro",
  sort_oldest: "Mais antigas primeiro",
  search_placeholder: "Buscar cartas...",
  no_cards_match: "Nenhuma carta corresponde a este filtro.",
  btn_add_card: "+ Carta",
  btn_remove_copy: "Remover uma c\xF3pia",
  btn_add_copy: "Adicionar uma c\xF3pia",
  price_digital: "Digital",
  notice_fetching_for: 'Buscando cartas para "{name}"...',
  notice_fetching_page: "Buscando p\xE1gina {page}...",
  notice_rate_limit: "\u23F3 Limite do Scryfall atingido \u2014 aguardando {seconds}s antes de tentar novamente.",
  notice_cards_added: '{count} novas cartas adicionadas a "{name}".',
  notice_up_to_date: '"{name}" j\xE1 est\xE1 atualizada.',
  notice_auto_updated: 'Atualiza\xE7\xE3o autom\xE1tica: {count} novas cartas adicionadas a "{name}".',
  notice_scryfall_failed: "Falha na atualiza\xE7\xE3o do Scryfall: {error}",
  modal_new_title: "Nova Cole\xE7\xE3o",
  modal_edit_title: "Editar Cole\xE7\xE3o",
  coming_soon: "Em breve",
  field_name: "Nome da cole\xE7\xE3o",
  field_name_desc: "Nome de exibi\xE7\xE3o para esta cole\xE7\xE3o",
  field_name_placeholder: "ex. Bloomburrow Token Boosters",
  field_set_code: "C\xF3digo do set",
  field_set_code_desc: "C\xF3digo de set do Scryfall (ex. blb, tblb). Usado para buscar cartas automaticamente.",
  field_set_code_ph: "ex. tblb",
  field_finish: "Acabamento",
  field_finish_desc: "Qual acabamento importar deste set.",
  finish_all: "Todos",
  finish_nonfoil: "Apenas normal",
  finish_foil_only: "Apenas foil",
  field_all_prints: "Todas as variantes",
  field_all_prints_desc: "Incluir todas as variantes: showcase, sem borda, extended art, etc. Desative para importar apenas a lista principal.",
  field_query: "Consulta ou URL do Scryfall",
  field_query_desc: "Cole uma URL do Scryfall ou digite uma consulta. Adicione game:paper para excluir cartas digitais.",
  field_query_ph: "Consulta: type:turtle game:paper\n\nURL: https://scryfall.com/search?q=...",
  field_autofetch: "Buscar cartas automaticamente do Scryfall",
  field_autofetch_desc: "Preencher a cole\xE7\xE3o com cartas do Scryfall ap\xF3s a cria\xE7\xE3o.",
  field_refetch: "Buscar novamente do Scryfall",
  field_refetch_desc: "Substituir todas as cartas por uma nova importa\xE7\xE3o. Use quando a consulta ou c\xF3digo do set mudou.",
  refetch_warning: "\u26A0 Todas as cartas ser\xE3o substitu\xEDdas pelos novos resultados. Cartas possu\xEDdas correspondentes ter\xE3o seu estado preservado.",
  field_auto_update: "Atualiza\xE7\xE3o autom\xE1tica",
  field_auto_update_desc: "Verificar novas cartas no Scryfall toda vez que o dashboard abrir. Ideal para cole\xE7\xF5es tem\xE1ticas.",
  field_type: "Tipo",
  type_mtg_set: "Set / Produto MTG",
  type_mtg_theme: "Cole\xE7\xE3o Tem\xE1tica MTG",
  field_format: "Formato",
  field_format_desc: "Cartas f\xEDsicas ou MTG Arena digital.",
  format_paper: "\u{1F0CF} F\xEDsico",
  format_arena: "\u{1F5A5} MTG Arena",
  btn_save: "Salvar",
  btn_create: "Criar",
  btn_cancel: "Cancelar",
  notice_name_required: "O nome da cole\xE7\xE3o \xE9 obrigat\xF3rio.",
  notice_saved: "Cole\xE7\xE3o salva.",
  notice_save_failed: "Falha ao salvar: {error}",
  notice_file_exists: "Arquivo j\xE1 existe: {path}",
  notice_create_failed: "Falha ao criar cole\xE7\xE3o: {error}",
  notice_fetch_failed: "Falha ao buscar do Scryfall: {error}",
  notice_added_to: '{count} cartas adicionadas a "{name}".',
  notice_reimported: "{count} cartas reimportadas. {preserved}/{total} entradas possu\xEDdas preservadas.",
  notice_reimported_simple: "{count} cartas reimportadas.",
  csm_title: 'Adicionar carta a "{name}"',
  csm_placeholder: "Digite o nome da carta...",
  csm_no_matches: "Sem resultados",
  csm_loading_printings: "Carregando edi\xE7\xF5es...",
  csm_no_printings: "Nenhuma edi\xE7\xE3o encontrada.",
  csm_hint: "Selecione edi\xE7\xF5es para adicionar (clique para alternar):",
  csm_selected: "{count} selecionada(s)",
  csm_add_btn: "Adicionar \xE0 Cole\xE7\xE3o",
  notice_cards_added_csm: '{count} carta(s) adicionada(s) a "{name}".',
  notice_already_in_coll: "Todas as cartas selecionadas j\xE1 est\xE3o na cole\xE7\xE3o.",
  settings_tab_general: "Geral",
  settings_tab_mtg: "Magic: The Gathering",
  settings_section_collections: "Cole\xE7\xF5es",
  settings_folder: "Pasta de cole\xE7\xF5es",
  settings_folder_desc: "Pasta para buscar arquivos .collection. Deixe vazio para buscar em todo o cofre.",
  settings_folder_ph: "ex. 004 MTG",
  settings_section_card_data: "Dados das cartas",
  settings_card_data_desc: "Fonte para buscar listas de cartas e imagens.",
  settings_source: "Fonte",
  settings_section_prices: "Pre\xE7os",
  settings_prices_desc: "Escolha onde buscar pre\xE7os. Sem chave API configurada, Scryfall USD \xE9 usado como fallback.",
  settings_provider: "Provedor",
  settings_price_scryfall_usd: "Scryfall \u2014 USD",
  settings_price_scryfall_eur: "Scryfall \u2014 EUR",
  settings_price_tcgplayer: "TCGPlayer (chave API necess\xE1ria)",
  settings_price_cardmarket: "Cardmarket (credenciais necess\xE1rias)",
  settings_section_tcgplayer: "TCGPlayer",
  settings_tcgplayer_desc: "Obtenha sua chave p\xFAblica em developer.tcgplayer.com. Usa pre\xE7o de mercado (USD).",
  settings_tcgplayer_key: "Chave p\xFAblica",
  settings_tcgplayer_key_desc: "Bearer token para TCGPlayer API v1.39.0.",
  settings_tcgplayer_ph: "Cole sua chave p\xFAblica aqui",
  settings_section_cardmarket: "Cardmarket",
  settings_cardmarket_desc: "Credenciais OAuth 1.0a da sua conta de desenvolvedor Cardmarket. Usa pre\xE7o TREND (EUR).",
  settings_cm_app_token: "Token de app",
  settings_cm_app_secret: "Segredo de app",
  settings_cm_access_token: "Token de acesso",
  settings_cm_access_secret: "Segredo do token de acesso",
  settings_enable_game: "Ativar {game}",
  settings_enable_game_desc: "Mostrar este jogo ao criar novas cole\xE7\xF5es.",
  settings_no_card_data: "Nenhuma fonte de dados de cartas dispon\xEDvel para {game} ainda.",
  settings_no_price_data: "Nenhum dado de pre\xE7os dispon\xEDvel para {game} ainda.",
  group_pokemon_sets: "Sets de Pok\xE9mon",
  type_pokemon_set: "Set de Pok\xE9mon",
  settings_pokemon_price_source: "Fonte de pre\xE7os",
  settings_pokemon_price_source_desc: "Pre\xE7os obtidos via TCGdex. Escolha a moeda.",
  settings_pokemon_sponsor: "Desenvolvido por TCGdex (c\xF3digo aberto)",
  settings_pokemon_sponsor_desc: "TCGdex fornece dados e pre\xE7os gratuitos de Pok\xE9mon. Considere patrocinar!",
  field_tcgdex_set_id: "ID do set TCGdex",
  field_tcgdex_set_id_desc: "O identificador do set no TCGdex. Encontre em tcgdex.dev.",
  field_tcgdex_set_id_ph: "ex. swsh1, sv10, base1",
  notice_fetching_pokemon: 'Buscando cartas de Pok\xE9mon para "{name}"\u2026',
  notice_fetching_pokemon_progress: "Buscando {fetched}/{total} cartas\u2026",
  notice_pokemon_added: '{count} novas cartas de Pok\xE9mon adicionadas a "{name}".',
  notice_pokemon_up_to_date: '"{name}" j\xE1 est\xE1 atualizado.',
  notice_pokemon_failed: "Falha ao buscar Pok\xE9mon: {error}",
  variant_normal: "\u25C7 Normal",
  variant_reverse_holo: "\u21BA Reverse Holo",
  variant_holo: "\u2726 Holo",
  variant_first_edition: "\u2460 1\xAA Edi\xE7\xE3o"
};

// src/i18n/ja.ts
var ja = {
  cmd_open_dashboard: "\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9\u3092\u958B\u304F",
  cmd_new_collection: "\u65B0\u3057\u3044\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3",
  ribbon_dashboard: "Collectors \u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9",
  btn_refresh: "\u66F4\u65B0",
  btn_new_collection: "\uFF0B \u65B0\u3057\u3044\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3",
  empty_no_collections: "\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002\u4F5C\u6210\u3059\u308B\u304B\u3001\u8A2D\u5B9A\u3067\u30D5\u30A9\u30EB\u30C0\u30FC\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  stat_collections: "\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3",
  stat_cards_owned: "\u6240\u6301\u30AB\u30FC\u30C9",
  stat_invested: "\u6295\u8CC7\u984D \xB7 {source}",
  stat_to_complete: "\u30B3\u30F3\u30D7\u30EA\u30FC\u30C8\u307E\u3067",
  group_mtg_sets: "MTG \u30BB\u30C3\u30C8",
  group_theme: "\u30C6\u30FC\u30DE\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3",
  badge_arena: "Arena",
  card_owned_count: "{count} \u6240\u6301",
  card_total_count: "{count} \u5408\u8A08",
  card_missing_count: "{count} \u672A\u6240\u6301",
  card_invested: "{value} \u6295\u8CC7",
  card_to_complete: "{value} \u3067\u30B3\u30F3\u30D7\u30EA\u30FC\u30C8",
  btn_view: "\u229E \u8868\u793A",
  btn_view_title: "\u30AB\u30FC\u30C9\u3092\u898B\u308B",
  btn_update_scryfall: "Scryfall\u304B\u3089\u66F4\u65B0",
  btn_edit_collection: "\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u3092\u7DE8\u96C6",
  collection_display_text: "\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3",
  loading: "\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026",
  loading_prices: "\u4FA1\u683C\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026",
  loading_rate_limited: "\u30EC\u30FC\u30C8\u5236\u9650\u4E2D \u2014 {seconds}\u79D2\u5F8C\u306B\u518D\u8A66\u884C\u2026",
  loading_fetching: "Scryfall\u304B\u3089\u30AB\u30FC\u30C9\u3092\u53D6\u5F97\u4E2D\u2026",
  loading_updating: "\u66F4\u65B0\u4E2D\u2026",
  loading_page: "\u30DA\u30FC\u30B8 {page} \u3092\u53D6\u5F97\u4E2D\u2026",
  filter_all: "\u3059\u3079\u3066",
  filter_owned: "\u6240\u6301",
  filter_missing: "\u672A\u6240\u6301",
  finish_foil: "\u2726 \u30D5\u30A9\u30A4\u30EB",
  finish_normal: "\u25C7 \u30CE\u30FC\u30DE\u30EB",
  sort_label: "\u4E26\u3073\u66FF\u3048\uFF1A",
  sort_number: "\u30AB\u30FC\u30C9\u756A\u53F7",
  sort_name: "\u540D\u524D",
  sort_price_desc: "\u4FA1\u683C \u2193",
  sort_price_asc: "\u4FA1\u683C \u2191",
  sort_newest: "\u65B0\u3057\u3044\u9806",
  sort_oldest: "\u53E4\u3044\u9806",
  search_placeholder: "\u30AB\u30FC\u30C9\u3092\u691C\u7D22...",
  no_cards_match: "\u3053\u306E\u30D5\u30A3\u30EB\u30BF\u30FC\u306B\u4E00\u81F4\u3059\u308B\u30AB\u30FC\u30C9\u306F\u3042\u308A\u307E\u305B\u3093\u3002",
  btn_add_card: "\uFF0B \u30AB\u30FC\u30C9",
  btn_remove_copy: "1\u679A\u524A\u9664",
  btn_add_copy: "1\u679A\u8FFD\u52A0",
  price_digital: "\u30C7\u30B8\u30BF\u30EB",
  notice_fetching_for: "\u300C{name}\u300D\u306E\u30AB\u30FC\u30C9\u3092\u53D6\u5F97\u4E2D...",
  notice_fetching_page: "\u30DA\u30FC\u30B8 {page} \u3092\u53D6\u5F97\u4E2D...",
  notice_rate_limit: "\u23F3 Scryfall\u306E\u30EC\u30FC\u30C8\u5236\u9650 \u2014 {seconds}\u79D2\u5F85\u3063\u3066\u518D\u8A66\u884C\u3057\u307E\u3059\u3002",
  notice_cards_added: "\u300C{name}\u300D\u306B {count} \u679A\u306E\u65B0\u3057\u3044\u30AB\u30FC\u30C9\u3092\u8FFD\u52A0\u3057\u307E\u3057\u305F\u3002",
  notice_up_to_date: "\u300C{name}\u300D\u306F\u3059\u3067\u306B\u6700\u65B0\u3067\u3059\u3002",
  notice_auto_updated: "\u81EA\u52D5\u66F4\u65B0\uFF1A\u300C{name}\u300D\u306B {count} \u679A\u306E\u65B0\u3057\u3044\u30AB\u30FC\u30C9\u3092\u8FFD\u52A0\u3057\u307E\u3057\u305F\u3002",
  notice_scryfall_failed: "Scryfall\u66F4\u65B0\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF1A{error}",
  modal_new_title: "\u65B0\u3057\u3044\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3",
  modal_edit_title: "\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u3092\u7DE8\u96C6",
  coming_soon: "\u8FD1\u65E5\u516C\u958B",
  field_name: "\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u540D",
  field_name_desc: "\u3053\u306E\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u306E\u8868\u793A\u540D",
  field_name_placeholder: "\u4F8B\uFF1ABloomburrow Token Boosters",
  field_set_code: "\u30BB\u30C3\u30C8\u30B3\u30FC\u30C9",
  field_set_code_desc: "Scryfall\u306E\u30BB\u30C3\u30C8\u30B3\u30FC\u30C9\uFF08\u4F8B\uFF1Ablb\u3001tblb\uFF09\u3002\u30AB\u30FC\u30C9\u306E\u81EA\u52D5\u53D6\u5F97\u306B\u4F7F\u7528\u3055\u308C\u307E\u3059\u3002",
  field_set_code_ph: "\u4F8B\uFF1Atblb",
  field_finish: "\u4ED5\u69D8",
  field_finish_desc: "\u3053\u306E\u30BB\u30C3\u30C8\u304B\u3089\u30A4\u30F3\u30DD\u30FC\u30C8\u3059\u308B\u4ED5\u69D8\u3002",
  finish_all: "\u3059\u3079\u3066",
  finish_nonfoil: "\u30CE\u30FC\u30DE\u30EB\u306E\u307F",
  finish_foil_only: "\u30D5\u30A9\u30A4\u30EB\u306E\u307F",
  field_all_prints: "\u3059\u3079\u3066\u306E\u30D0\u30EA\u30A2\u30F3\u30C8",
  field_all_prints_desc: "\u30B7\u30E7\u30FC\u30B1\u30FC\u30B9\u3001\u30DC\u30FC\u30C0\u30FC\u30EC\u30B9\u3001\u62E1\u5F35\u30A2\u30FC\u30C8\u306A\u3069\u3059\u3079\u3066\u306E\u30D0\u30EA\u30A2\u30F3\u30C8\u3092\u542B\u3080\u3002\u30E1\u30A4\u30F3\u30BB\u30C3\u30C8\u30EA\u30B9\u30C8\u306E\u307F\u306B\u3059\u308B\u306B\u306F\u30AA\u30D5\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  field_query: "Scryfall \u30AF\u30A8\u30EA\u307E\u305F\u306FURL",
  field_query_desc: "Scryfall\u306E\u691C\u7D22URL\u3092\u8CBC\u308A\u4ED8\u3051\u308B\u304B\u30AF\u30A8\u30EA\u3092\u76F4\u63A5\u5165\u529B\u3002game:paper\u3092\u8FFD\u52A0\u3057\u3066\u30C7\u30B8\u30BF\u30EB\u5C02\u7528\u30AB\u30FC\u30C9\u3092\u9664\u5916\u3067\u304D\u307E\u3059\u3002",
  field_query_ph: "\u30AF\u30A8\u30EA: type:turtle game:paper\n\nURL: https://scryfall.com/search?q=...",
  field_autofetch: "Scryfall\u304B\u3089\u81EA\u52D5\u53D6\u5F97",
  field_autofetch_desc: "\u4F5C\u6210\u5F8C\u306BScryfall\u304B\u3089\u30AB\u30FC\u30C9\u3067\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u3092\u57CB\u3081\u307E\u3059\u3002",
  field_refetch: "Scryfall\u304B\u3089\u518D\u53D6\u5F97",
  field_refetch_desc: "\u3059\u3079\u3066\u306E\u30AB\u30FC\u30C9\u3092\u65B0\u3057\u3044\u30A4\u30F3\u30DD\u30FC\u30C8\u3067\u7F6E\u304D\u63DB\u3048\u307E\u3059\u3002\u30AF\u30A8\u30EA\u307E\u305F\u306F\u30BB\u30C3\u30C8\u30B3\u30FC\u30C9\u304C\u5909\u66F4\u3055\u308C\u305F\u5834\u5408\u306B\u4F7F\u7528\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  refetch_warning: "\u26A0 \u3059\u3079\u3066\u306E\u30AB\u30FC\u30C9\u304C\u65B0\u3057\u3044Scryfall\u7D50\u679C\u3067\u7F6E\u304D\u63DB\u3048\u3089\u308C\u307E\u3059\u3002\u65B0\u3057\u3044\u30AF\u30A8\u30EA\u306B\u4E00\u81F4\u3059\u308B\u6240\u6301\u30AB\u30FC\u30C9\u306F\u30B9\u30C6\u30FC\u30BF\u30B9\u304C\u4FDD\u6301\u3055\u308C\u307E\u3059\u3002",
  field_auto_update: "\u81EA\u52D5\u66F4\u65B0",
  field_auto_update_desc: "\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9\u3092\u958B\u304F\u305F\u3073\u306BScryfall\u3067\u65B0\u3057\u3044\u30AB\u30FC\u30C9\u3092\u78BA\u8A8D\u3057\u307E\u3059\u3002\u30C6\u30FC\u30DE\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u306B\u6700\u9069\u3067\u3059\u3002",
  field_type: "\u30BF\u30A4\u30D7",
  type_mtg_set: "MTG \u30BB\u30C3\u30C8 / \u88FD\u54C1",
  type_mtg_theme: "MTG \u30C6\u30FC\u30DE\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3",
  field_format: "\u30D5\u30A9\u30FC\u30DE\u30C3\u30C8",
  field_format_desc: "\u7269\u7406\u30AB\u30FC\u30C9\u307E\u305F\u306FMTG Arena\u30C7\u30B8\u30BF\u30EB\u3002",
  format_paper: "\u{1F0CF} \u7D19",
  format_arena: "\u{1F5A5} MTG Arena",
  btn_save: "\u4FDD\u5B58",
  btn_create: "\u4F5C\u6210",
  btn_cancel: "\u30AD\u30E3\u30F3\u30BB\u30EB",
  notice_name_required: "\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u540D\u306F\u5FC5\u9808\u3067\u3059\u3002",
  notice_saved: "\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002",
  notice_save_failed: "\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF1A{error}",
  notice_file_exists: "\u30D5\u30A1\u30A4\u30EB\u304C\u3059\u3067\u306B\u5B58\u5728\u3057\u307E\u3059\uFF1A{path}",
  notice_create_failed: "\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u306E\u4F5C\u6210\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF1A{error}",
  notice_fetch_failed: "Scryfall\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF1A{error}",
  notice_added_to: "\u300C{name}\u300D\u306B {count} \u679A\u306E\u30AB\u30FC\u30C9\u3092\u8FFD\u52A0\u3057\u307E\u3057\u305F\u3002",
  notice_reimported: "{count} \u679A\u306E\u30AB\u30FC\u30C9\u3092\u518D\u30A4\u30F3\u30DD\u30FC\u30C8\u3057\u307E\u3057\u305F\u3002{preserved}/{total} \u306E\u6240\u6301\u30A8\u30F3\u30C8\u30EA\u3092\u4FDD\u6301\u3057\u307E\u3057\u305F\u3002",
  notice_reimported_simple: "{count} \u679A\u306E\u30AB\u30FC\u30C9\u3092\u518D\u30A4\u30F3\u30DD\u30FC\u30C8\u3057\u307E\u3057\u305F\u3002",
  csm_title: "\u300C{name}\u300D\u306B\u30AB\u30FC\u30C9\u3092\u8FFD\u52A0",
  csm_placeholder: "\u30AB\u30FC\u30C9\u540D\u3092\u5165\u529B...",
  csm_no_matches: "\u7D50\u679C\u306A\u3057",
  csm_loading_printings: "\u7248\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D...",
  csm_no_printings: "\u7248\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002",
  csm_hint: "\u8FFD\u52A0\u3059\u308B\u7248\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\uFF08\u30AF\u30EA\u30C3\u30AF\u3067\u5207\u308A\u66FF\u3048\uFF09\uFF1A",
  csm_selected: "{count} \u4EF6\u9078\u629E\u4E2D",
  csm_add_btn: "\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u306B\u8FFD\u52A0",
  notice_cards_added_csm: "\u300C{name}\u300D\u306B {count} \u679A\u306E\u30AB\u30FC\u30C9\u3092\u8FFD\u52A0\u3057\u307E\u3057\u305F\u3002",
  notice_already_in_coll: "\u9078\u629E\u3057\u305F\u30AB\u30FC\u30C9\u306F\u3059\u3079\u3066\u3059\u3067\u306B\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u306B\u3042\u308A\u307E\u3059\u3002",
  settings_tab_general: "\u5168\u822C",
  settings_tab_mtg: "\u30DE\u30B8\u30C3\u30AF\uFF1A\u30B6\u30FB\u30AE\u30E3\u30B6\u30EA\u30F3\u30B0",
  settings_section_collections: "\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3",
  settings_folder: "\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u30D5\u30A9\u30EB\u30C0\u30FC",
  settings_folder_desc: ".collection\u30D5\u30A1\u30A4\u30EB\u3092\u30B9\u30AD\u30E3\u30F3\u3059\u308B\u30D5\u30A9\u30EB\u30C0\u30FC\u3002\u7A7A\u306E\u307E\u307E\u306B\u3059\u308B\u3068Vault\u5168\u4F53\u3092\u30B9\u30AD\u30E3\u30F3\u3057\u307E\u3059\u3002",
  settings_folder_ph: "\u4F8B\uFF1A004 MTG",
  settings_section_card_data: "\u30AB\u30FC\u30C9\u30C7\u30FC\u30BF",
  settings_card_data_desc: "\u30AB\u30FC\u30C9\u30EA\u30B9\u30C8\u3068\u753B\u50CF\u3092\u53D6\u5F97\u3059\u308B\u30BD\u30FC\u30B9\u3002",
  settings_source: "\u30BD\u30FC\u30B9",
  settings_section_prices: "\u4FA1\u683C",
  settings_prices_desc: "\u30AB\u30FC\u30C9\u4FA1\u683C\u306E\u53D6\u5F97\u5148\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002API\u30AD\u30FC\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u306A\u3044\u5834\u5408\u3001Scryfall USD\u304C\u4F7F\u7528\u3055\u308C\u307E\u3059\u3002",
  settings_provider: "\u30D7\u30ED\u30D0\u30A4\u30C0\u30FC",
  settings_price_scryfall_usd: "Scryfall \u2014 USD",
  settings_price_scryfall_eur: "Scryfall \u2014 EUR",
  settings_price_tcgplayer: "TCGPlayer\uFF08API\u30AD\u30FC\u5FC5\u8981\uFF09",
  settings_price_cardmarket: "Cardmarket\uFF08\u8A8D\u8A3C\u60C5\u5831\u5FC5\u8981\uFF09",
  settings_section_tcgplayer: "TCGPlayer",
  settings_tcgplayer_desc: "developer.tcgplayer.com\u3067\u516C\u958BAPI\u30AD\u30FC\u3092\u53D6\u5F97\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u5E02\u5834\u4FA1\u683C\uFF08USD\uFF09\u3092\u4F7F\u7528\u3057\u307E\u3059\u3002",
  settings_tcgplayer_key: "\u516C\u958BAPI\u30AD\u30FC",
  settings_tcgplayer_key_desc: "TCGPlayer API v1.39.0\u306EBearer\u30C8\u30FC\u30AF\u30F3\u3002",
  settings_tcgplayer_ph: "\u516C\u958B\u30AD\u30FC\u3092\u3053\u3053\u306B\u8CBC\u308A\u4ED8\u3051",
  settings_section_cardmarket: "Cardmarket",
  settings_cardmarket_desc: "Cardmarket\u30C7\u30D9\u30ED\u30C3\u30D1\u30FC\u30A2\u30AB\u30A6\u30F3\u30C8\u306EOAuth 1.0a\u8A8D\u8A3C\u60C5\u5831\u3002TREND\u4FA1\u683C\uFF08EUR\uFF09\u3092\u4F7F\u7528\u3057\u307E\u3059\u3002",
  settings_cm_app_token: "\u30A2\u30D7\u30EA\u30C8\u30FC\u30AF\u30F3",
  settings_cm_app_secret: "\u30A2\u30D7\u30EA\u30B7\u30FC\u30AF\u30EC\u30C3\u30C8",
  settings_cm_access_token: "\u30A2\u30AF\u30BB\u30B9\u30C8\u30FC\u30AF\u30F3",
  settings_cm_access_secret: "\u30A2\u30AF\u30BB\u30B9\u30C8\u30FC\u30AF\u30F3\u30B7\u30FC\u30AF\u30EC\u30C3\u30C8",
  settings_enable_game: "{game} \u3092\u6709\u52B9\u306B\u3059\u308B",
  settings_enable_game_desc: "\u65B0\u3057\u3044\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u4F5C\u6210\u6642\u306B\u3053\u306E\u30B2\u30FC\u30E0\u3092\u30AA\u30D7\u30B7\u30E7\u30F3\u3068\u3057\u3066\u8868\u793A\u3057\u307E\u3059\u3002",
  settings_no_card_data: "{game} \u306E\u30AB\u30FC\u30C9\u30C7\u30FC\u30BF\u30BD\u30FC\u30B9\u306F\u307E\u3060\u5229\u7528\u3067\u304D\u307E\u305B\u3093\u3002",
  settings_no_price_data: "{game} \u306E\u4FA1\u683C\u30C7\u30FC\u30BF\u306F\u307E\u3060\u5229\u7528\u3067\u304D\u307E\u305B\u3093\u3002",
  group_pokemon_sets: "\u30DD\u30B1\u30E2\u30F3\u30BB\u30C3\u30C8",
  type_pokemon_set: "\u30DD\u30B1\u30E2\u30F3\u30BB\u30C3\u30C8",
  settings_pokemon_price_source: "\u4FA1\u683C\u30BD\u30FC\u30B9",
  settings_pokemon_price_source_desc: "TCGdex\u304B\u3089\u4FA1\u683C\u3092\u53D6\u5F97\u3057\u307E\u3059\u3002\u901A\u8CA8\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  settings_pokemon_sponsor: "TCGdex\u306B\u3088\u308B\u63D0\u4F9B\uFF08\u30AA\u30FC\u30D7\u30F3\u30BD\u30FC\u30B9\uFF09",
  settings_pokemon_sponsor_desc: "TCGdex\u306F\u7121\u6599\u3067\u30DD\u30B1\u30E2\u30F3\u30AB\u30FC\u30C9\u30C7\u30FC\u30BF\u3068\u4FA1\u683C\u3092\u63D0\u4F9B\u3057\u3066\u3044\u307E\u3059\u3002\u30B9\u30DD\u30F3\u30B5\u30FC\u3092\u3054\u691C\u8A0E\u304F\u3060\u3055\u3044\uFF01",
  field_tcgdex_set_id: "TCGdex\u30BB\u30C3\u30C8ID",
  field_tcgdex_set_id_desc: "TCGdex\u306E\u30BB\u30C3\u30C8\u8B58\u5225\u5B50\u3002tcgdex.dev\u3067\u78BA\u8A8D\u3067\u304D\u307E\u3059\u3002",
  field_tcgdex_set_id_ph: "\u4F8B\uFF1Aswsh1\u3001sv10\u3001base1",
  notice_fetching_pokemon: '"{name}"\u306E\u30DD\u30B1\u30E2\u30F3\u30AB\u30FC\u30C9\u3092\u53D6\u5F97\u4E2D\u2026',
  notice_fetching_pokemon_progress: "{fetched}/{total}\u679A\u53D6\u5F97\u4E2D\u2026",
  notice_pokemon_added: '"{name}"\u306B{count}\u679A\u306E\u30DD\u30B1\u30E2\u30F3\u30AB\u30FC\u30C9\u3092\u8FFD\u52A0\u3057\u307E\u3057\u305F\u3002',
  notice_pokemon_up_to_date: '"{name}"\u306F\u3059\u3067\u306B\u6700\u65B0\u3067\u3059\u3002',
  notice_pokemon_failed: "\u30DD\u30B1\u30E2\u30F3\u30AB\u30FC\u30C9\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF1A{error}",
  variant_normal: "\u25C7 \u30CE\u30FC\u30DE\u30EB",
  variant_reverse_holo: "\u21BA \u30EA\u30D0\u30FC\u30B9\u30DB\u30ED",
  variant_holo: "\u2726 \u30DB\u30ED",
  variant_first_edition: "\u2460 \u521D\u7248"
};

// src/i18n/zh.ts
var zh = {
  cmd_open_dashboard: "\u6253\u5F00\u4EEA\u8868\u677F",
  cmd_new_collection: "\u65B0\u5EFA\u6536\u85CF",
  ribbon_dashboard: "Collectors \u4EEA\u8868\u677F",
  btn_refresh: "\u5237\u65B0",
  btn_new_collection: "+ \u65B0\u5EFA\u6536\u85CF",
  empty_no_collections: "\u672A\u627E\u5230\u6536\u85CF\u3002\u8BF7\u521B\u5EFA\u4E00\u4E2A\u6216\u5728\u8BBE\u7F6E\u4E2D\u914D\u7F6E\u6587\u4EF6\u5939\u3002",
  stat_collections: "\u6536\u85CF",
  stat_cards_owned: "\u5DF2\u62E5\u6709\u5361\u724C",
  stat_invested: "\u5DF2\u6295\u5165 \xB7 {source}",
  stat_to_complete: "\u8865\u5168\u6240\u9700",
  group_mtg_sets: "MTG \u7CFB\u5217",
  group_theme: "\u4E3B\u9898\u6536\u85CF",
  badge_arena: "Arena",
  card_owned_count: "\u5DF2\u62E5\u6709 {count}",
  card_total_count: "\u5171 {count}",
  card_missing_count: "\u7F3A\u5C11 {count}",
  card_invested: "\u5DF2\u6295\u5165 {value}",
  card_to_complete: "\u8865\u5168\u9700 {value}",
  btn_view: "\u229E \u67E5\u770B",
  btn_view_title: "\u67E5\u770B\u5361\u724C",
  btn_update_scryfall: "\u4ECE Scryfall \u66F4\u65B0",
  btn_edit_collection: "\u7F16\u8F91\u6536\u85CF",
  collection_display_text: "\u6536\u85CF",
  loading: "\u52A0\u8F7D\u4E2D\u2026",
  loading_prices: "\u52A0\u8F7D\u4EF7\u683C\u4E2D\u2026",
  loading_rate_limited: "\u8BF7\u6C42\u53D7\u9650 \u2014 {seconds} \u79D2\u540E\u91CD\u8BD5\u2026",
  loading_fetching: "\u6B63\u5728\u4ECE Scryfall \u83B7\u53D6\u5361\u724C\u2026",
  loading_updating: "\u66F4\u65B0\u4E2D\u2026",
  loading_page: "\u6B63\u5728\u83B7\u53D6\u7B2C {page} \u9875\u2026",
  filter_all: "\u5168\u90E8",
  filter_owned: "\u5DF2\u62E5\u6709",
  filter_missing: "\u672A\u62E5\u6709",
  finish_foil: "\u2726 \u95EA\u5361",
  finish_normal: "\u25C7 \u666E\u901A",
  sort_label: "\u6392\u5E8F\uFF1A",
  sort_number: "\u7F16\u53F7",
  sort_name: "\u540D\u79F0",
  sort_price_desc: "\u4EF7\u683C \u2193",
  sort_price_asc: "\u4EF7\u683C \u2191",
  sort_newest: "\u6700\u65B0\u4F18\u5148",
  sort_oldest: "\u6700\u65E7\u4F18\u5148",
  search_placeholder: "\u641C\u7D22\u5361\u724C...",
  no_cards_match: "\u6CA1\u6709\u7B26\u5408\u6B64\u7B5B\u9009\u6761\u4EF6\u7684\u5361\u724C\u3002",
  btn_add_card: "+ \u5361\u724C",
  btn_remove_copy: "\u79FB\u9664\u4E00\u5F20",
  btn_add_copy: "\u6DFB\u52A0\u4E00\u5F20",
  price_digital: "\u6570\u5B57\u7248",
  notice_fetching_for: '\u6B63\u5728\u83B7\u53D6"{name}"\u7684\u5361\u724C...',
  notice_fetching_page: "\u6B63\u5728\u83B7\u53D6\u7B2C {page} \u9875...",
  notice_rate_limit: "\u23F3 \u89E6\u53D1 Scryfall \u9891\u7387\u9650\u5236 \u2014 \u7B49\u5F85 {seconds} \u79D2\u540E\u91CD\u8BD5\u3002",
  notice_cards_added: '\u5DF2\u5411"{name}"\u6DFB\u52A0 {count} \u5F20\u65B0\u5361\u724C\u3002',
  notice_up_to_date: '"{name}"\u5DF2\u662F\u6700\u65B0\u72B6\u6001\u3002',
  notice_auto_updated: '\u81EA\u52A8\u66F4\u65B0\uFF1A\u5DF2\u5411"{name}"\u6DFB\u52A0 {count} \u5F20\u65B0\u5361\u724C\u3002',
  notice_scryfall_failed: "Scryfall \u66F4\u65B0\u5931\u8D25\uFF1A{error}",
  modal_new_title: "\u65B0\u5EFA\u6536\u85CF",
  modal_edit_title: "\u7F16\u8F91\u6536\u85CF",
  coming_soon: "\u5373\u5C06\u63A8\u51FA",
  field_name: "\u6536\u85CF\u540D\u79F0",
  field_name_desc: "\u6B64\u6536\u85CF\u7684\u663E\u793A\u540D\u79F0",
  field_name_placeholder: "\u4F8B\u5982\uFF1ABloomburrow Token Boosters",
  field_set_code: "\u7CFB\u5217\u4EE3\u7801",
  field_set_code_desc: "Scryfall \u7CFB\u5217\u4EE3\u7801\uFF08\u4F8B\u5982 blb\u3001tblb\uFF09\u3002\u7528\u4E8E\u81EA\u52A8\u83B7\u53D6\u5361\u724C\u3002",
  field_set_code_ph: "\u4F8B\u5982\uFF1Atblb",
  field_finish: "\u5370\u5237\u7C7B\u578B",
  field_finish_desc: "\u4ECE\u6B64\u7CFB\u5217\u5BFC\u5165\u7684\u5370\u5237\u7C7B\u578B\u3002",
  finish_all: "\u5168\u90E8",
  finish_nonfoil: "\u4EC5\u666E\u901A",
  finish_foil_only: "\u4EC5\u95EA\u5361",
  field_all_prints: "\u6240\u6709\u7248\u672C",
  field_all_prints_desc: "\u5305\u542B\u6240\u6709\u53D8\u4F53\uFF1A\u5C55\u793A\u7248\u3001\u65E0\u8FB9\u6846\u3001\u5EF6\u4F38\u753B\u6846\u7B49\u3002\u5173\u95ED\u5219\u4EC5\u5BFC\u5165\u7CFB\u5217\u4E3B\u5217\u8868\u3002",
  field_query: "Scryfall \u67E5\u8BE2\u6216 URL",
  field_query_desc: "\u7C98\u8D34 Scryfall \u641C\u7D22 URL \u6216\u76F4\u63A5\u8F93\u5165\u67E5\u8BE2\u3002\u6DFB\u52A0 game:paper \u4EE5\u6392\u9664\u4EC5\u6570\u5B57\u7248\u5361\u724C\u3002",
  field_query_ph: "\u67E5\u8BE2\uFF1Atype:turtle game:paper\n\nURL\uFF1Ahttps://scryfall.com/search?q=...",
  field_autofetch: "\u4ECE Scryfall \u81EA\u52A8\u83B7\u53D6\u5361\u724C",
  field_autofetch_desc: "\u521B\u5EFA\u540E\u4ECE Scryfall \u586B\u5145\u6536\u85CF\u5361\u724C\u3002",
  field_refetch: "\u91CD\u65B0\u4ECE Scryfall \u83B7\u53D6",
  field_refetch_desc: "\u7528\u65B0\u5BFC\u5165\u66FF\u6362\u6240\u6709\u5361\u724C\u3002\u5F53\u67E5\u8BE2\u6216\u7CFB\u5217\u4EE3\u7801\u66F4\u6539\u65F6\u4F7F\u7528\u3002",
  refetch_warning: "\u26A0 \u6240\u6709\u5361\u724C\u5C06\u88AB\u65B0\u7684 Scryfall \u7ED3\u679C\u66FF\u6362\u3002\u4E0E\u65B0\u67E5\u8BE2\u5339\u914D\u7684\u5DF2\u62E5\u6709\u5361\u724C\u5C06\u4FDD\u7559\u5176\u72B6\u6001\u3002",
  field_auto_update: "\u81EA\u52A8\u66F4\u65B0",
  field_auto_update_desc: "\u6BCF\u6B21\u6253\u5F00\u4EEA\u8868\u677F\u65F6\u68C0\u67E5 Scryfall \u4E0A\u7684\u65B0\u5361\u724C\u3002\u9002\u5408\u4E3B\u9898\u6536\u85CF\u3002",
  field_type: "\u7C7B\u578B",
  type_mtg_set: "MTG \u7CFB\u5217 / \u4EA7\u54C1",
  type_mtg_theme: "MTG \u4E3B\u9898\u6536\u85CF",
  field_format: "\u683C\u5F0F",
  field_format_desc: "\u5B9E\u4F53\u5361\u724C\u6216 MTG Arena \u6570\u5B57\u7248\u3002",
  format_paper: "\u{1F0CF} \u5B9E\u4F53",
  format_arena: "\u{1F5A5} MTG Arena",
  btn_save: "\u4FDD\u5B58",
  btn_create: "\u521B\u5EFA",
  btn_cancel: "\u53D6\u6D88",
  notice_name_required: "\u6536\u85CF\u540D\u79F0\u4E3A\u5FC5\u586B\u9879\u3002",
  notice_saved: "\u6536\u85CF\u5DF2\u4FDD\u5B58\u3002",
  notice_save_failed: "\u4FDD\u5B58\u5931\u8D25\uFF1A{error}",
  notice_file_exists: "\u6587\u4EF6\u5DF2\u5B58\u5728\uFF1A{path}",
  notice_create_failed: "\u521B\u5EFA\u6536\u85CF\u5931\u8D25\uFF1A{error}",
  notice_fetch_failed: "Scryfall \u83B7\u53D6\u5931\u8D25\uFF1A{error}",
  notice_added_to: '\u5DF2\u5411"{name}"\u6DFB\u52A0 {count} \u5F20\u5361\u724C\u3002',
  notice_reimported: "\u5DF2\u91CD\u65B0\u5BFC\u5165 {count} \u5F20\u5361\u724C\u3002{preserved}/{total} \u4E2A\u5DF2\u62E5\u6709\u6761\u76EE\u5DF2\u4FDD\u7559\u3002",
  notice_reimported_simple: "\u5DF2\u91CD\u65B0\u5BFC\u5165 {count} \u5F20\u5361\u724C\u3002",
  csm_title: '\u5411"{name}"\u6DFB\u52A0\u5361\u724C',
  csm_placeholder: "\u8F93\u5165\u5361\u724C\u540D\u79F0...",
  csm_no_matches: "\u65E0\u5339\u914D\u7ED3\u679C",
  csm_loading_printings: "\u6B63\u5728\u52A0\u8F7D\u7248\u672C...",
  csm_no_printings: "\u672A\u627E\u5230\u7248\u672C\u3002",
  csm_hint: "\u9009\u62E9\u8981\u6DFB\u52A0\u7684\u7248\u672C\uFF08\u70B9\u51FB\u5207\u6362\uFF09\uFF1A",
  csm_selected: "\u5DF2\u9009\u62E9 {count} \u4E2A",
  csm_add_btn: "\u6DFB\u52A0\u5230\u6536\u85CF",
  notice_cards_added_csm: '\u5DF2\u5411"{name}"\u6DFB\u52A0 {count} \u5F20\u5361\u724C\u3002',
  notice_already_in_coll: "\u6240\u6709\u9009\u5B9A\u7684\u5361\u724C\u5DF2\u5728\u6536\u85CF\u4E2D\u3002",
  settings_tab_general: "\u901A\u7528",
  settings_tab_mtg: "\u4E07\u667A\u724C",
  settings_section_collections: "\u6536\u85CF",
  settings_folder: "\u6536\u85CF\u6587\u4EF6\u5939",
  settings_folder_desc: "\u626B\u63CF .collection \u6587\u4EF6\u7684\u6587\u4EF6\u5939\u3002\u7559\u7A7A\u5219\u626B\u63CF\u6574\u4E2A\u5E93\u3002",
  settings_folder_ph: "\u4F8B\u5982\uFF1A004 MTG",
  settings_section_card_data: "\u5361\u724C\u6570\u636E",
  settings_card_data_desc: "\u83B7\u53D6\u5361\u724C\u5217\u8868\u548C\u56FE\u7247\u7684\u6765\u6E90\u3002",
  settings_source: "\u6765\u6E90",
  settings_section_prices: "\u4EF7\u683C",
  settings_prices_desc: "\u9009\u62E9\u83B7\u53D6\u5361\u724C\u4EF7\u683C\u7684\u6765\u6E90\u3002\u82E5\u672A\u914D\u7F6E API \u5BC6\u94A5\uFF0C\u5C06\u4F7F\u7528 Scryfall USD \u4F5C\u4E3A\u56DE\u9000\u3002",
  settings_provider: "\u63D0\u4F9B\u5546",
  settings_price_scryfall_usd: "Scryfall \u2014 USD",
  settings_price_scryfall_eur: "Scryfall \u2014 EUR",
  settings_price_tcgplayer: "TCGPlayer\uFF08\u9700\u8981 API \u5BC6\u94A5\uFF09",
  settings_price_cardmarket: "Cardmarket\uFF08\u9700\u8981\u51ED\u8BC1\uFF09",
  settings_section_tcgplayer: "TCGPlayer",
  settings_tcgplayer_desc: "\u5728 developer.tcgplayer.com \u83B7\u53D6\u516C\u5F00 API \u5BC6\u94A5\u3002\u4F7F\u7528\u5E02\u573A\u4EF7\u683C\uFF08USD\uFF09\u3002",
  settings_tcgplayer_key: "\u516C\u5F00 API \u5BC6\u94A5",
  settings_tcgplayer_key_desc: "TCGPlayer API v1.39.0 \u7684 Bearer \u4EE4\u724C\u3002",
  settings_tcgplayer_ph: "\u5728\u6B64\u7C98\u8D34\u516C\u5F00\u5BC6\u94A5",
  settings_section_cardmarket: "Cardmarket",
  settings_cardmarket_desc: "Cardmarket \u5F00\u53D1\u8005\u8D26\u6237\u7684 OAuth 1.0a \u51ED\u8BC1\u3002\u4F7F\u7528 TREND \u4EF7\u683C\uFF08EUR\uFF09\u3002",
  settings_cm_app_token: "\u5E94\u7528\u4EE4\u724C",
  settings_cm_app_secret: "\u5E94\u7528\u5BC6\u94A5",
  settings_cm_access_token: "\u8BBF\u95EE\u4EE4\u724C",
  settings_cm_access_secret: "\u8BBF\u95EE\u4EE4\u724C\u5BC6\u94A5",
  settings_enable_game: "\u542F\u7528 {game}",
  settings_enable_game_desc: "\u521B\u5EFA\u65B0\u6536\u85CF\u65F6\u5C06\u6B64\u6E38\u620F\u663E\u793A\u4E3A\u9009\u9879\u3002",
  settings_no_card_data: "\u6682\u65E0 {game} \u7684\u5361\u724C\u6570\u636E\u6765\u6E90\u3002",
  settings_no_price_data: "\u6682\u65E0 {game} \u7684\u4EF7\u683C\u6570\u636E\u3002",
  group_pokemon_sets: "\u5B9D\u53EF\u68A6\u5957\u724C",
  type_pokemon_set: "\u5B9D\u53EF\u68A6\u5957\u724C",
  settings_pokemon_price_source: "\u4EF7\u683C\u6765\u6E90",
  settings_pokemon_price_source_desc: "\u901A\u8FC7TCGdex\u83B7\u53D6\u4EF7\u683C\u3002\u9009\u62E9\u8D27\u5E01\u3002",
  settings_pokemon_sponsor: "\u7531TCGdex\u63D0\u4F9B\u652F\u6301\uFF08\u5F00\u6E90\uFF09",
  settings_pokemon_sponsor_desc: "TCGdex\u63D0\u4F9B\u514D\u8D39\u7684\u5B9D\u53EF\u68A6\u5361\u724C\u6570\u636E\u548C\u4EF7\u683C\u3002\u6B22\u8FCE\u8D5E\u52A9\uFF01",
  field_tcgdex_set_id: "TCGdex\u7CFB\u5217ID",
  field_tcgdex_set_id_desc: "TCGdex\u7684\u7CFB\u5217\u6807\u8BC6\u7B26\u3002\u5728tcgdex.dev\u4E0A\u67E5\u627E\u3002",
  field_tcgdex_set_id_ph: "\u4F8B\u5982\uFF1Aswsh1\u3001sv10\u3001base1",
  notice_fetching_pokemon: '\u6B63\u5728\u83B7\u53D6"{name}"\u7684\u5B9D\u53EF\u68A6\u5361\u724C\u2026',
  notice_fetching_pokemon_progress: "\u6B63\u5728\u83B7\u53D6{fetched}/{total}\u5F20\u5361\u724C\u2026",
  notice_pokemon_added: '\u5DF2\u5411"{name}"\u6DFB\u52A0{count}\u5F20\u5B9D\u53EF\u68A6\u5361\u724C\u3002',
  notice_pokemon_up_to_date: '"{name}"\u5DF2\u662F\u6700\u65B0\u3002',
  notice_pokemon_failed: "\u5B9D\u53EF\u68A6\u5361\u724C\u83B7\u53D6\u5931\u8D25\uFF1A{error}",
  variant_normal: "\u25C7 \u666E\u901A",
  variant_reverse_holo: "\u21BA \u53CD\u8F6C\u95EA\u5361",
  variant_holo: "\u2726 \u95EA\u5361",
  variant_first_edition: "\u2460 \u521D\u7248"
};

// src/i18n/zh-TW.ts
var zhTW = {
  cmd_open_dashboard: "\u958B\u555F\u5100\u8868\u677F",
  cmd_new_collection: "\u65B0\u589E\u6536\u85CF",
  ribbon_dashboard: "Collectors \u5100\u8868\u677F",
  btn_refresh: "\u91CD\u65B0\u6574\u7406",
  btn_new_collection: "+ \u65B0\u589E\u6536\u85CF",
  empty_no_collections: "\u627E\u4E0D\u5230\u6536\u85CF\u3002\u8ACB\u65B0\u589E\u4E00\u500B\u6216\u5728\u8A2D\u5B9A\u4E2D\u6307\u5B9A\u8CC7\u6599\u593E\u3002",
  stat_collections: "\u6536\u85CF",
  stat_cards_owned: "\u5DF2\u64C1\u6709\u5361\u724C",
  stat_invested: "\u5DF2\u6295\u5165 \xB7 {source}",
  stat_to_complete: "\u88DC\u5168\u6240\u9700",
  group_mtg_sets: "MTG \u7CFB\u5217",
  group_theme: "\u4E3B\u984C\u6536\u85CF",
  badge_arena: "Arena",
  card_owned_count: "\u5DF2\u64C1\u6709 {count}",
  card_total_count: "\u5171 {count}",
  card_missing_count: "\u7F3A\u5C11 {count}",
  card_invested: "\u5DF2\u6295\u5165 {value}",
  card_to_complete: "\u88DC\u5168\u9700 {value}",
  btn_view: "\u229E \u67E5\u770B",
  btn_view_title: "\u67E5\u770B\u5361\u724C",
  btn_update_scryfall: "\u5F9E Scryfall \u66F4\u65B0",
  btn_edit_collection: "\u7DE8\u8F2F\u6536\u85CF",
  collection_display_text: "\u6536\u85CF",
  loading: "\u8F09\u5165\u4E2D\u2026",
  loading_prices: "\u8F09\u5165\u50F9\u683C\u4E2D\u2026",
  loading_rate_limited: "\u8ACB\u6C42\u53D7\u9650 \u2014 {seconds} \u79D2\u5F8C\u91CD\u8A66\u2026",
  loading_fetching: "\u6B63\u5728\u5F9E Scryfall \u53D6\u5F97\u5361\u724C\u2026",
  loading_updating: "\u66F4\u65B0\u4E2D\u2026",
  loading_page: "\u6B63\u5728\u53D6\u5F97\u7B2C {page} \u9801\u2026",
  filter_all: "\u5168\u90E8",
  filter_owned: "\u5DF2\u64C1\u6709",
  filter_missing: "\u672A\u64C1\u6709",
  finish_foil: "\u2726 \u9583\u5361",
  finish_normal: "\u25C7 \u666E\u901A",
  sort_label: "\u6392\u5E8F\uFF1A",
  sort_number: "\u7DE8\u865F",
  sort_name: "\u540D\u7A31",
  sort_price_desc: "\u50F9\u683C \u2193",
  sort_price_asc: "\u50F9\u683C \u2191",
  sort_newest: "\u6700\u65B0\u512A\u5148",
  sort_oldest: "\u6700\u820A\u512A\u5148",
  search_placeholder: "\u641C\u5C0B\u5361\u724C...",
  no_cards_match: "\u6C92\u6709\u7B26\u5408\u6B64\u7BE9\u9078\u689D\u4EF6\u7684\u5361\u724C\u3002",
  btn_add_card: "+ \u5361\u724C",
  btn_remove_copy: "\u79FB\u9664\u4E00\u5F35",
  btn_add_copy: "\u65B0\u589E\u4E00\u5F35",
  price_digital: "\u6578\u4F4D\u7248",
  notice_fetching_for: "\u6B63\u5728\u53D6\u5F97\u300C{name}\u300D\u7684\u5361\u724C...",
  notice_fetching_page: "\u6B63\u5728\u53D6\u5F97\u7B2C {page} \u9801...",
  notice_rate_limit: "\u23F3 \u89F8\u767C Scryfall \u983B\u7387\u9650\u5236 \u2014 \u7B49\u5F85 {seconds} \u79D2\u5F8C\u91CD\u8A66\u3002",
  notice_cards_added: "\u5DF2\u5411\u300C{name}\u300D\u65B0\u589E {count} \u5F35\u65B0\u5361\u724C\u3002",
  notice_up_to_date: "\u300C{name}\u300D\u5DF2\u662F\u6700\u65B0\u72C0\u614B\u3002",
  notice_auto_updated: "\u81EA\u52D5\u66F4\u65B0\uFF1A\u5DF2\u5411\u300C{name}\u300D\u65B0\u589E {count} \u5F35\u65B0\u5361\u724C\u3002",
  notice_scryfall_failed: "Scryfall \u66F4\u65B0\u5931\u6557\uFF1A{error}",
  modal_new_title: "\u65B0\u589E\u6536\u85CF",
  modal_edit_title: "\u7DE8\u8F2F\u6536\u85CF",
  coming_soon: "\u5373\u5C07\u63A8\u51FA",
  field_name: "\u6536\u85CF\u540D\u7A31",
  field_name_desc: "\u6B64\u6536\u85CF\u7684\u986F\u793A\u540D\u7A31",
  field_name_placeholder: "\u4F8B\u5982\uFF1ABloomburrow Token Boosters",
  field_set_code: "\u7CFB\u5217\u4EE3\u78BC",
  field_set_code_desc: "Scryfall \u7CFB\u5217\u4EE3\u78BC\uFF08\u4F8B\u5982 blb\u3001tblb\uFF09\u3002\u7528\u65BC\u81EA\u52D5\u53D6\u5F97\u5361\u724C\u3002",
  field_set_code_ph: "\u4F8B\u5982\uFF1Atblb",
  field_finish: "\u5370\u88FD\u985E\u578B",
  field_finish_desc: "\u5F9E\u6B64\u7CFB\u5217\u532F\u5165\u7684\u5370\u88FD\u985E\u578B\u3002",
  finish_all: "\u5168\u90E8",
  finish_nonfoil: "\u50C5\u666E\u901A",
  finish_foil_only: "\u50C5\u9583\u5361",
  field_all_prints: "\u6240\u6709\u7248\u672C",
  field_all_prints_desc: "\u5305\u542B\u6240\u6709\u8B8A\u9AD4\uFF1A\u5C55\u793A\u7248\u3001\u7121\u908A\u6846\u3001\u5EF6\u4F38\u756B\u6846\u7B49\u3002\u95DC\u9589\u5247\u50C5\u532F\u5165\u7CFB\u5217\u4E3B\u5217\u8868\u3002",
  field_query: "Scryfall \u67E5\u8A62\u6216 URL",
  field_query_desc: "\u8CBC\u4E0A Scryfall \u641C\u5C0B URL \u6216\u76F4\u63A5\u8F38\u5165\u67E5\u8A62\u3002\u52A0\u5165 game:paper \u53EF\u6392\u9664\u6578\u4F4D\u5C08\u5C6C\u5361\u724C\u3002",
  field_query_ph: "\u67E5\u8A62\uFF1Atype:turtle game:paper\n\nURL\uFF1Ahttps://scryfall.com/search?q=...",
  field_autofetch: "\u5F9E Scryfall \u81EA\u52D5\u53D6\u5F97\u5361\u724C",
  field_autofetch_desc: "\u5EFA\u7ACB\u5F8C\u5F9E Scryfall \u586B\u5165\u6536\u85CF\u5361\u724C\u3002",
  field_refetch: "\u91CD\u65B0\u5F9E Scryfall \u53D6\u5F97",
  field_refetch_desc: "\u7528\u65B0\u532F\u5165\u53D6\u4EE3\u6240\u6709\u5361\u724C\u3002\u7576\u67E5\u8A62\u6216\u7CFB\u5217\u4EE3\u78BC\u8B8A\u66F4\u6642\u4F7F\u7528\u3002",
  refetch_warning: "\u26A0 \u6240\u6709\u5361\u724C\u5C07\u88AB\u65B0\u7684 Scryfall \u7D50\u679C\u53D6\u4EE3\u3002\u8207\u65B0\u67E5\u8A62\u76F8\u7B26\u7684\u5DF2\u64C1\u6709\u5361\u724C\u5C07\u4FDD\u7559\u5176\u72C0\u614B\u3002",
  field_auto_update: "\u81EA\u52D5\u66F4\u65B0",
  field_auto_update_desc: "\u6BCF\u6B21\u958B\u555F\u5100\u8868\u677F\u6642\u6AA2\u67E5 Scryfall \u4E0A\u7684\u65B0\u5361\u724C\u3002\u9069\u5408\u4E3B\u984C\u6536\u85CF\u3002",
  field_type: "\u985E\u578B",
  type_mtg_set: "MTG \u7CFB\u5217 / \u7522\u54C1",
  type_mtg_theme: "MTG \u4E3B\u984C\u6536\u85CF",
  field_format: "\u683C\u5F0F",
  field_format_desc: "\u5BE6\u9AD4\u5361\u724C\u6216 MTG Arena \u6578\u4F4D\u7248\u3002",
  format_paper: "\u{1F0CF} \u5BE6\u9AD4",
  format_arena: "\u{1F5A5} MTG Arena",
  btn_save: "\u5132\u5B58",
  btn_create: "\u5EFA\u7ACB",
  btn_cancel: "\u53D6\u6D88",
  notice_name_required: "\u6536\u85CF\u540D\u7A31\u70BA\u5FC5\u586B\u9805\u76EE\u3002",
  notice_saved: "\u6536\u85CF\u5DF2\u5132\u5B58\u3002",
  notice_save_failed: "\u5132\u5B58\u5931\u6557\uFF1A{error}",
  notice_file_exists: "\u6A94\u6848\u5DF2\u5B58\u5728\uFF1A{path}",
  notice_create_failed: "\u5EFA\u7ACB\u6536\u85CF\u5931\u6557\uFF1A{error}",
  notice_fetch_failed: "Scryfall \u53D6\u5F97\u5931\u6557\uFF1A{error}",
  notice_added_to: "\u5DF2\u5411\u300C{name}\u300D\u65B0\u589E {count} \u5F35\u5361\u724C\u3002",
  notice_reimported: "\u5DF2\u91CD\u65B0\u532F\u5165 {count} \u5F35\u5361\u724C\u3002{preserved}/{total} \u500B\u5DF2\u64C1\u6709\u9805\u76EE\u5DF2\u4FDD\u7559\u3002",
  notice_reimported_simple: "\u5DF2\u91CD\u65B0\u532F\u5165 {count} \u5F35\u5361\u724C\u3002",
  csm_title: "\u5411\u300C{name}\u300D\u65B0\u589E\u5361\u724C",
  csm_placeholder: "\u8F38\u5165\u5361\u724C\u540D\u7A31...",
  csm_no_matches: "\u7121\u7B26\u5408\u7D50\u679C",
  csm_loading_printings: "\u6B63\u5728\u8F09\u5165\u7248\u672C...",
  csm_no_printings: "\u627E\u4E0D\u5230\u7248\u672C\u3002",
  csm_hint: "\u9078\u64C7\u8981\u65B0\u589E\u7684\u7248\u672C\uFF08\u9EDE\u64CA\u5207\u63DB\uFF09\uFF1A",
  csm_selected: "\u5DF2\u9078\u64C7 {count} \u500B",
  csm_add_btn: "\u65B0\u589E\u81F3\u6536\u85CF",
  notice_cards_added_csm: "\u5DF2\u5411\u300C{name}\u300D\u65B0\u589E {count} \u5F35\u5361\u724C\u3002",
  notice_already_in_coll: "\u6240\u6709\u9078\u5B9A\u7684\u5361\u724C\u5DF2\u5728\u6536\u85CF\u4E2D\u3002",
  settings_tab_general: "\u4E00\u822C",
  settings_tab_mtg: "\u9B54\u6CD5\u98A8\u96F2\u6703",
  settings_section_collections: "\u6536\u85CF",
  settings_folder: "\u6536\u85CF\u8CC7\u6599\u593E",
  settings_folder_desc: "\u6383\u63CF .collection \u6A94\u6848\u7684\u8CC7\u6599\u593E\u3002\u7559\u7A7A\u5247\u6383\u63CF\u6574\u500B\u5EAB\u3002",
  settings_folder_ph: "\u4F8B\u5982\uFF1A004 MTG",
  settings_section_card_data: "\u5361\u724C\u8CC7\u6599",
  settings_card_data_desc: "\u53D6\u5F97\u5361\u724C\u5217\u8868\u548C\u5716\u7247\u7684\u4F86\u6E90\u3002",
  settings_source: "\u4F86\u6E90",
  settings_section_prices: "\u50F9\u683C",
  settings_prices_desc: "\u9078\u64C7\u53D6\u5F97\u5361\u724C\u50F9\u683C\u7684\u4F86\u6E90\u3002\u82E5\u672A\u8A2D\u5B9A API \u91D1\u9470\uFF0C\u5C07\u4F7F\u7528 Scryfall USD \u4F5C\u70BA\u5099\u63F4\u3002",
  settings_provider: "\u63D0\u4F9B\u5546",
  settings_price_scryfall_usd: "Scryfall \u2014 USD",
  settings_price_scryfall_eur: "Scryfall \u2014 EUR",
  settings_price_tcgplayer: "TCGPlayer\uFF08\u9700\u8981 API \u91D1\u9470\uFF09",
  settings_price_cardmarket: "Cardmarket\uFF08\u9700\u8981\u6191\u8B49\uFF09",
  settings_section_tcgplayer: "TCGPlayer",
  settings_tcgplayer_desc: "\u5728 developer.tcgplayer.com \u53D6\u5F97\u516C\u958B API \u91D1\u9470\u3002\u4F7F\u7528\u5E02\u5834\u50F9\u683C\uFF08USD\uFF09\u3002",
  settings_tcgplayer_key: "\u516C\u958B API \u91D1\u9470",
  settings_tcgplayer_key_desc: "TCGPlayer API v1.39.0 \u7684 Bearer \u6B0A\u6756\u3002",
  settings_tcgplayer_ph: "\u5728\u6B64\u8CBC\u4E0A\u516C\u958B\u91D1\u9470",
  settings_section_cardmarket: "Cardmarket",
  settings_cardmarket_desc: "Cardmarket \u958B\u767C\u8005\u5E33\u6236\u7684 OAuth 1.0a \u6191\u8B49\u3002\u4F7F\u7528 TREND \u50F9\u683C\uFF08EUR\uFF09\u3002",
  settings_cm_app_token: "\u61C9\u7528\u7A0B\u5F0F\u6B0A\u6756",
  settings_cm_app_secret: "\u61C9\u7528\u7A0B\u5F0F\u5BC6\u9470",
  settings_cm_access_token: "\u5B58\u53D6\u6B0A\u6756",
  settings_cm_access_secret: "\u5B58\u53D6\u6B0A\u6756\u5BC6\u9470",
  settings_enable_game: "\u555F\u7528 {game}",
  settings_enable_game_desc: "\u5EFA\u7ACB\u65B0\u6536\u85CF\u6642\u5C07\u6B64\u904A\u6232\u986F\u793A\u70BA\u9078\u9805\u3002",
  settings_no_card_data: "\u76EE\u524D\u5C1A\u7121 {game} \u7684\u5361\u724C\u8CC7\u6599\u4F86\u6E90\u3002",
  settings_no_price_data: "\u76EE\u524D\u5C1A\u7121 {game} \u7684\u50F9\u683C\u8CC7\u6599\u3002",
  group_pokemon_sets: "\u5BF6\u53EF\u5922\u7CFB\u5217",
  type_pokemon_set: "\u5BF6\u53EF\u5922\u7CFB\u5217",
  settings_pokemon_price_source: "\u50F9\u683C\u4F86\u6E90",
  settings_pokemon_price_source_desc: "\u900F\u904ETCGdex\u53D6\u5F97\u50F9\u683C\u3002\u9078\u64C7\u8CA8\u5E63\u3002",
  settings_pokemon_sponsor: "\u7531TCGdex\u63D0\u4F9B\u652F\u63F4\uFF08\u958B\u6E90\uFF09",
  settings_pokemon_sponsor_desc: "TCGdex\u63D0\u4F9B\u514D\u8CBB\u7684\u5BF6\u53EF\u5922\u5361\u724C\u8CC7\u6599\u548C\u50F9\u683C\u3002\u6B61\u8FCE\u8D0A\u52A9\uFF01",
  field_tcgdex_set_id: "TCGdex\u7CFB\u5217ID",
  field_tcgdex_set_id_desc: "TCGdex\u7684\u7CFB\u5217\u8B58\u5225\u78BC\u3002\u5728tcgdex.dev\u4E0A\u67E5\u627E\u3002",
  field_tcgdex_set_id_ph: "\u4F8B\u5982\uFF1Aswsh1\u3001sv10\u3001base1",
  notice_fetching_pokemon: '\u6B63\u5728\u53D6\u5F97"{name}"\u7684\u5BF6\u53EF\u5922\u5361\u724C\u2026',
  notice_fetching_pokemon_progress: "\u6B63\u5728\u53D6\u5F97{fetched}/{total}\u5F35\u5361\u724C\u2026",
  notice_pokemon_added: '\u5DF2\u5411"{name}"\u65B0\u589E{count}\u5F35\u5BF6\u53EF\u5922\u5361\u724C\u3002',
  notice_pokemon_up_to_date: '"{name}"\u5DF2\u662F\u6700\u65B0\u3002',
  notice_pokemon_failed: "\u5BF6\u53EF\u5922\u5361\u724C\u53D6\u5F97\u5931\u6557\uFF1A{error}",
  variant_normal: "\u25C7 \u666E\u901A",
  variant_reverse_holo: "\u21BA \u9006\u9583\u5361",
  variant_holo: "\u2726 \u9583\u5361",
  variant_first_edition: "\u2460 \u521D\u7248"
};

// src/i18n/index.ts
var localeMap = {
  es,
  fr,
  de,
  pt,
  "pt-br": pt,
  ja,
  zh,
  "zh-cn": zh,
  "zh-tw": zhTW,
  "zh-hk": zhTW
};
function resolveLocale() {
  var _a;
  const raw = import_obsidian3.moment.locale().toLowerCase();
  if (localeMap[raw]) return localeMap[raw];
  const base = raw.split("-")[0];
  return (_a = localeMap[base]) != null ? _a : {};
}
function t(key, vars) {
  var _a;
  const locale = resolveLocale();
  let str = (_a = locale[key]) != null ? _a : en[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return str;
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
var TYPE_LABELS = () => ({
  "mtg-set": t("type_mtg_set"),
  "mtg-theme": t("type_mtg_theme"),
  "pokemon-set": t("type_pokemon_set")
});
var TABLE_HEADER = "| Owned | Image | Name | Type | Rarity | Set | Number | Notes |\n| --- | --- | --- | --- | --- | --- | --- | --- |";
var NewCollectionModal = class extends import_obsidian4.Modal {
  constructor(app, plugin, onCreated, editTarget) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    super(app);
    this.activeGame = "mtg";
    this.tabEls = /* @__PURE__ */ new Map();
    // MTG form state
    this.name = "";
    this.type = "mtg-set";
    this.setCode = "";
    this.finishImport = "all";
    this.allPrints = true;
    this.scryfallQuery = "";
    this.scryfallOrder = "released";
    this.autoFetch = true;
    this.autoUpdate = false;
    this.format = "paper";
    // Pokémon form state
    this.tcgdexSetId = "";
    this.pokemonFormType = "catalog";
    this.pokemonVariantImport = "all";
    // Originals for change-detection in edit mode
    this.originalSetCode = "";
    this.originalScryfallQuery = "";
    this.originalTcgdexSetId = "";
    this.plugin = plugin;
    this.onCreated = onCreated;
    if (editTarget) {
      this.editTarget = editTarget;
      const c = editTarget.collection;
      this.name = c.name;
      this.type = c.type;
      this.format = (_a = c.format) != null ? _a : "paper";
      this.setCode = (_c = (_b = c.setCode) == null ? void 0 : _b.toLowerCase()) != null ? _c : "";
      this.finishImport = (_d = c.finishImport) != null ? _d : "all";
      this.allPrints = (_e = c.allPrints) != null ? _e : true;
      this.scryfallQuery = (_f = c.scryfallQuery) != null ? _f : "";
      this.scryfallOrder = (_g = c.scryfallOrder) != null ? _g : "released";
      this.autoUpdate = c.autoUpdate;
      this.autoFetch = false;
      this.tcgdexSetId = (_h = c.tcgdexSetId) != null ? _h : "";
      this.pokemonVariantImport = (_i = c.pokemonVariantImport) != null ? _i : "all";
      this.originalSetCode = this.setCode;
      this.originalScryfallQuery = this.scryfallQuery;
      this.originalTcgdexSetId = this.tcgdexSetId;
    }
  }
  onOpen() {
    var _a, _b;
    const { contentEl } = this;
    contentEl.addClass("ncm-modal");
    contentEl.createEl("h2", { cls: "ncm-title", text: this.editTarget ? t("modal_edit_title") : t("modal_new_title") });
    const enabledGames = (_a = this.plugin.settings.enabledGames) != null ? _a : {};
    let visibleGames = GAME_ORDER.filter((g) => enabledGames[g] !== false);
    if (this.editTarget) {
      const editGame = this.editTarget.collection.type.startsWith("pokemon") ? "pokemon" : "mtg";
      visibleGames = visibleGames.filter((g) => g === editGame);
    }
    if (!visibleGames.includes(this.activeGame)) {
      this.activeGame = (_b = visibleGames[0]) != null ? _b : "mtg";
    }
    if (visibleGames.length > 1) {
      const tabBar = contentEl.createDiv({ cls: "ncm-tab-bar" });
      for (const game of visibleGames) {
        const cfg = GAMES[game];
        const tab = tabBar.createEl("button", {
          cls: `ncm-tab ncm-tab-${game}${game === this.activeGame ? " ncm-tab-active" : ""}`
        });
        tab.createEl("span", { cls: "ncm-tab-icon", text: cfg.icon });
        tab.createEl("span", { cls: "ncm-tab-label", text: cfg.label });
        tab.addEventListener("click", () => {
          var _a2;
          if (this.activeGame === game) return;
          (_a2 = this.tabEls.get(this.activeGame)) == null ? void 0 : _a2.removeClass("ncm-tab-active");
          this.activeGame = game;
          tab.addClass("ncm-tab-active");
          this.renderGameContent();
        });
        this.tabEls.set(game, tab);
      }
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
    } else if (this.activeGame === "pokemon") {
      this.renderPokemonForm(this.gameContentEl);
    } else {
      this.renderComingSoon(this.gameContentEl, this.activeGame);
    }
  }
  // ── MTG form ────────────────────────────────────────────────────────────────
  renderMTGForm(el) {
    new import_obsidian4.Setting(el).setName(t("field_name")).setDesc(t("field_name_desc")).addText(
      (tx) => tx.setPlaceholder(t("field_name_placeholder")).setValue(this.name).onChange((v) => this.name = v.trim())
    );
    let autoFetchToggleComp = null;
    let refetchWarning = null;
    const syncRefetch = () => {
      const changed = this.setCode !== this.originalSetCode || this.scryfallQuery !== this.originalScryfallQuery;
      this.autoFetch = changed;
      autoFetchToggleComp == null ? void 0 : autoFetchToggleComp.setValue(changed);
      if (refetchWarning) refetchWarning.style.display = changed ? "" : "none";
    };
    const setCodeSetting = new import_obsidian4.Setting(el).setName(t("field_set_code")).setDesc(t("field_set_code_desc")).addText(
      (tx) => tx.setPlaceholder(t("field_set_code_ph")).setValue(this.setCode).onChange((v) => {
        this.setCode = v.trim().toLowerCase();
        if (this.editTarget) syncRefetch();
      })
    );
    const finishSetting = new import_obsidian4.Setting(el).setName(t("field_finish")).setDesc(t("field_finish_desc")).addDropdown((d) => {
      d.addOption("all", t("finish_all"));
      d.addOption("nonfoil", t("finish_nonfoil"));
      d.addOption("foil", t("finish_foil_only"));
      d.setValue(this.finishImport);
      d.onChange((v) => this.finishImport = v);
    });
    const allPrintsSetting = new import_obsidian4.Setting(el).setName(t("field_all_prints")).setDesc(t("field_all_prints_desc")).addToggle((tx) => tx.setValue(this.allPrints).onChange((v) => this.allPrints = v));
    const queryWrap = el.createDiv({ cls: "nm-query-wrap" });
    queryWrap.style.display = "none";
    const previewEl = queryWrap.createEl("div", { cls: "nm-query-preview" });
    previewEl.style.display = "none";
    new import_obsidian4.Setting(queryWrap).setName(t("field_query")).setDesc(t("field_query_desc")).addTextArea((tx) => {
      tx.setPlaceholder(t("field_query_ph"));
      tx.inputEl.rows = 3;
      tx.inputEl.addClass("nm-query-input");
      if (this.scryfallQuery) {
        tx.setValue(this.scryfallQuery);
        previewEl.textContent = `Query: ${this.scryfallQuery}`;
        previewEl.style.display = "";
      }
      tx.onChange((raw) => {
        var _a;
        const parsed = parseScryfallInput(raw);
        this.scryfallQuery = parsed.query;
        this.scryfallOrder = (_a = parsed.order) != null ? _a : "released";
        previewEl.textContent = parsed.query ? `Query: ${parsed.query}${parsed.order ? `  |  order: ${parsed.order}` : ""}` : "";
        previewEl.style.display = parsed.query ? "" : "none";
        if (this.editTarget) syncRefetch();
      });
    });
    queryWrap.appendChild(previewEl);
    const autoFetchSetting = new import_obsidian4.Setting(el).setName(this.editTarget ? t("field_refetch") : t("field_autofetch")).setDesc(this.editTarget ? t("field_refetch_desc") : t("field_autofetch_desc")).addToggle((tx) => {
      autoFetchToggleComp = tx;
      tx.setValue(this.autoFetch).onChange((v) => {
        this.autoFetch = v;
        if (refetchWarning) refetchWarning.style.display = v ? "" : "none";
      });
    });
    if (this.editTarget) {
      refetchWarning = el.createDiv({ cls: "ncm-refetch-warning" });
      refetchWarning.style.display = this.autoFetch ? "" : "none";
      refetchWarning.setText(t("refetch_warning"));
    }
    const autoUpdateSetting = new import_obsidian4.Setting(el).setName(t("field_auto_update")).setDesc(t("field_auto_update_desc")).addToggle((tx) => tx.setValue(this.autoUpdate).onChange((v) => this.autoUpdate = v));
    autoUpdateSetting.settingEl.style.display = "none";
    new import_obsidian4.Setting(el).setName(t("field_type")).addDropdown((d) => {
      for (const [val, label] of Object.entries(TYPE_LABELS())) {
        d.addOption(val, label);
      }
      d.setValue(this.type);
      const applyVisibility = (type) => {
        const isSet = type === "mtg-set";
        setCodeSetting.settingEl.style.display = isSet ? "" : "none";
        finishSetting.settingEl.style.display = isSet ? "" : "none";
        allPrintsSetting.settingEl.style.display = isSet ? "" : "none";
        queryWrap.style.display = isSet ? "none" : "";
        autoUpdateSetting.settingEl.style.display = isSet ? "none" : "";
      };
      applyVisibility(this.type);
      d.onChange((v) => {
        this.type = v;
        applyVisibility(this.type);
      });
    });
    new import_obsidian4.Setting(el).setName(t("field_format")).setDesc(t("field_format_desc")).addDropdown((d) => {
      d.addOption("paper", t("format_paper"));
      d.addOption("arena", t("format_arena"));
      d.setValue(this.format);
      d.onChange((v) => this.format = v);
    });
    new import_obsidian4.Setting(el).addButton(
      (btn) => btn.setButtonText(this.editTarget ? t("btn_save") : t("btn_create")).setCta().onClick(() => this.editTarget ? this.save() : this.create())
    ).addButton((btn) => btn.setButtonText(t("btn_cancel")).onClick(() => this.close()));
  }
  // ── Pokémon form ────────────────────────────────────────────────────────────
  renderPokemonForm(el) {
    let nameInputEl = null;
    let pokemonRefetchWarning = null;
    const syncPokemonRefetch = () => {
      const changed = this.tcgdexSetId !== this.originalTcgdexSetId;
      this.autoFetch = changed;
      if (pokemonRefetchWarning) pokemonRefetchWarning.style.display = changed ? "" : "none";
    };
    new import_obsidian4.Setting(el).setName(t("field_name")).setDesc(t("field_name_desc")).addText((tx) => {
      tx.setPlaceholder(t("field_name_ph_pokemon")).setValue(this.name).onChange((v) => this.name = v.trim());
      nameInputEl = tx.inputEl;
    });
    const typeWrap = el.createDiv({ cls: "ncm-pokemon-type-toggle" });
    const catalogBtn = typeWrap.createEl("button", {
      cls: `ncm-type-btn${this.pokemonFormType === "catalog" ? " ncm-type-btn-active" : ""}`,
      text: t("pokemon_form_type_catalog")
    });
    const customBtn = typeWrap.createEl("button", {
      cls: `ncm-type-btn${this.pokemonFormType === "custom" ? " ncm-type-btn-active" : ""}`,
      text: t("pokemon_form_type_custom")
    });
    const catalogSection = el.createDiv({ cls: "ncm-pokemon-catalog" });
    const customSection = el.createDiv({ cls: "ncm-pokemon-custom" });
    if (this.pokemonFormType === "custom") catalogSection.style.display = "none";
    else customSection.style.display = "none";
    this.renderSetCatalog(catalogSection, () => nameInputEl, () => {
      if (this.editTarget) syncPokemonRefetch();
    });
    new import_obsidian4.Setting(customSection).setName(t("field_tcgdex_set_id")).setDesc(t("field_tcgdex_set_id_desc")).addText(
      (tx) => tx.setPlaceholder(t("field_tcgdex_set_id_ph")).setValue(this.tcgdexSetId).onChange((v) => {
        this.tcgdexSetId = v.trim().toLowerCase();
        if (this.editTarget) syncPokemonRefetch();
      })
    );
    if (this.editTarget) {
      pokemonRefetchWarning = el.createDiv({ cls: "ncm-refetch-warning" });
      pokemonRefetchWarning.style.display = "none";
      pokemonRefetchWarning.setText(t("refetch_warning_pokemon"));
    }
    catalogBtn.addEventListener("click", () => {
      this.pokemonFormType = "catalog";
      catalogBtn.addClass("ncm-type-btn-active");
      customBtn.removeClass("ncm-type-btn-active");
      catalogSection.style.display = "";
      customSection.style.display = "none";
    });
    customBtn.addEventListener("click", () => {
      this.pokemonFormType = "custom";
      customBtn.addClass("ncm-type-btn-active");
      catalogBtn.removeClass("ncm-type-btn-active");
      customSection.style.display = "";
      catalogSection.style.display = "none";
    });
    new import_obsidian4.Setting(el).setName(t("field_pokemon_variant")).setDesc(t("field_pokemon_variant_desc")).addDropdown((d) => {
      d.addOption("all", t("pokemon_variant_all"));
      d.addOption("normal", t("pokemon_variant_normal"));
      d.addOption("reverse", t("pokemon_variant_reverse"));
      d.addOption("holo", t("pokemon_variant_holo"));
      d.addOption("firstEdition", t("pokemon_variant_first_edition"));
      d.setValue(this.pokemonVariantImport);
      d.onChange((v) => this.pokemonVariantImport = v);
    });
    new import_obsidian4.Setting(el).addButton(
      (btn) => btn.setButtonText(this.editTarget ? t("btn_save") : t("btn_create")).setCta().onClick(() => this.editTarget ? this.savePokemon() : this.createPokemon())
    ).addButton((btn) => btn.setButtonText(t("btn_cancel")).onClick(() => this.close()));
  }
  renderSetCatalog(el, getNameInput, onSetSelected) {
    const searchInput = el.createEl("input", {
      cls: "ncm-set-search",
      attr: { type: "text", placeholder: t("pokemon_set_search_ph") }
    });
    const listEl = el.createDiv({ cls: "ncm-set-list" });
    listEl.createDiv({ cls: "ncm-set-status", text: t("pokemon_set_loading") });
    fetchAllSets().then((sets) => {
      const sorted = [...sets].sort((a, b) => {
        if (a.releaseDate && b.releaseDate) return b.releaseDate.localeCompare(a.releaseDate);
        return a.name.localeCompare(b.name);
      });
      const paint = (query) => {
        var _a, _b;
        listEl.empty();
        const q = query.toLowerCase();
        const filtered = q ? sorted.filter((s) => {
          var _a2;
          return s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || ((_a2 = s.serie) == null ? void 0 : _a2.name.toLowerCase().includes(q));
        }) : sorted;
        if (filtered.length === 0) {
          listEl.createDiv({ cls: "ncm-set-status", text: t("pokemon_set_no_results") });
          return;
        }
        for (const set of filtered) {
          const isSelected = this.tcgdexSetId === set.id;
          const item = listEl.createDiv({ cls: `ncm-set-item${isSelected ? " ncm-set-item-selected" : ""}` });
          item.createEl("span", { cls: "ncm-set-name", text: set.name });
          const meta = item.createDiv({ cls: "ncm-set-meta" });
          if (set.serie) meta.createEl("span", { cls: "ncm-set-serie", text: set.serie.name });
          meta.createEl("code", { cls: "ncm-set-id", text: set.id });
          if ((_a = set.cardCount) == null ? void 0 : _a.total) {
            meta.createEl("span", { cls: "ncm-set-count", text: t("pokemon_set_card_count", { count: set.cardCount.total }) });
          }
          item.addEventListener("click", () => {
            this.tcgdexSetId = set.id;
            if (!this.name) {
              this.name = set.name;
              const inp = getNameInput();
              if (inp) inp.value = set.name;
            }
            listEl.querySelectorAll(".ncm-set-item").forEach((el2) => el2.removeClass("ncm-set-item-selected"));
            item.addClass("ncm-set-item-selected");
            onSetSelected == null ? void 0 : onSetSelected();
          });
        }
        if (this.tcgdexSetId) {
          (_b = listEl.querySelector(".ncm-set-item-selected")) == null ? void 0 : _b.scrollIntoView({ block: "nearest" });
        }
      };
      paint("");
      searchInput.addEventListener("input", () => paint(searchInput.value));
    }).catch(() => {
      listEl.empty();
      listEl.createDiv({ cls: "ncm-set-status", text: t("pokemon_set_load_failed") });
    });
  }
  // ── Coming soon ─────────────────────────────────────────────────────────────
  renderComingSoon(el, game) {
    const cfg = GAMES[game];
    const screen = el.createDiv({ cls: `ncm-soon ncm-soon-${game}` });
    screen.style.background = cfg.bg;
    const inner = screen.createDiv({ cls: "ncm-soon-inner" });
    inner.createEl("div", { cls: "ncm-soon-icon", text: cfg.icon });
    inner.createEl("h3", { cls: "ncm-soon-name", text: cfg.label }).style.color = cfg.accent;
    inner.createEl("p", { cls: "ncm-soon-badge", text: t("coming_soon") });
    if (cfg.tagline) {
      inner.createEl("p", { cls: "ncm-soon-tagline", text: `"${cfg.tagline}"` });
    }
  }
  // ── Save (edit mode) ────────────────────────────────────────────────────────
  async save() {
    if (!this.name) {
      new import_obsidian4.Notice(t("notice_name_required"));
      return;
    }
    const { file } = this.editTarget;
    const isSet = this.type === "mtg-set";
    const fmLines = [
      "---",
      `cssclasses: collectors-file`,
      `plugin-version: ${this.plugin.manifest.version}`,
      `collection-type: ${this.type}`,
      `collection-format: ${this.format}`,
      `collection-name: ${yamlStr(this.name)}`,
      isSet && this.setCode ? `set-code: ${this.setCode.toUpperCase()}` : "",
      isSet ? `finish-import: ${this.finishImport}` : "",
      isSet ? `all-prints: ${this.allPrints}` : "",
      !isSet && this.scryfallQuery ? `scryfall-query: ${this.scryfallQuery}` : "",
      !isSet && this.scryfallOrder && this.scryfallOrder !== "released" ? `scryfall-order: ${this.scryfallOrder}` : "",
      this.autoUpdate ? "auto-update: true" : "",
      "---"
    ].filter(Boolean);
    try {
      await replaceFrontmatter(file, fmLines, this.app.vault);
      new import_obsidian4.Notice(t("notice_saved"));
      this.close();
      if (this.autoFetch && (isSet ? !!this.setCode : !!this.scryfallQuery)) {
        await this.refetchWithPreservation(file, isSet);
      }
      this.onCreated();
    } catch (e) {
      new import_obsidian4.Notice(t("notice_save_failed", { error: e.message }));
    }
  }
  // ── Re-fetch with ownership preservation (edit mode) ────────────────────────
  async refetchWithPreservation(file, isSet) {
    const content = await this.app.vault.read(file);
    const previousOwned = extractOwnedMap(content);
    new import_obsidian4.Notice(t("notice_fetching_for", { name: this.name }));
    try {
      const cards = isSet ? await fetchSetCards(
        this.setCode,
        (p) => new import_obsidian4.Notice(t("notice_fetching_page", { page: p })),
        this.allPrints ? "prints" : "cards"
      ) : await fetchSearchCards(
        this.scryfallQuery,
        (p) => new import_obsidian4.Notice(t("notice_fetching_page", { page: p })),
        this.scryfallOrder
      );
      const finish = this.finishImport;
      const rawRows = cards.flatMap((card) => {
        if (finish === "all") return cardToMarkdownRows(card);
        const filtered = { ...card, finishes: card.finishes.filter((f) => f === finish) };
        return cardToMarkdownRows(filtered);
      });
      const restoredRows = applyOwnedStates(rawRows, previousOwned);
      const preservedCount = restoredRows.filter((r, i) => r !== rawRows[i]).length;
      await clearCardRows(file, this.app.vault);
      await appendCards(file, restoredRows, this.app.vault);
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      await patchFrontmatter(file, "last-fetched", today, this.app.vault);
      const msg = previousOwned.size > 0 ? t("notice_reimported", { count: restoredRows.length, preserved: preservedCount, total: previousOwned.size }) : t("notice_reimported_simple", { count: restoredRows.length });
      new import_obsidian4.Notice(msg);
    } catch (e) {
      new import_obsidian4.Notice(t("notice_fetch_failed", { error: e.message }));
    }
  }
  // ── Create ──────────────────────────────────────────────────────────────────
  async create() {
    if (!this.name) {
      new import_obsidian4.Notice(t("notice_name_required"));
      return;
    }
    const folder = this.plugin.settings.collectionsFolder;
    const filename = this.name.replace(/[\\/:*?"<>|]/g, "-") + ".collection";
    const path = (0, import_obsidian4.normalizePath)(folder ? `${folder}/${filename}` : filename);
    if (this.app.vault.getAbstractFileByPath(path) instanceof import_obsidian4.TFile) {
      new import_obsidian4.Notice(t("notice_file_exists", { path }));
      return;
    }
    const isSet = this.type === "mtg-set";
    const needsFetch = this.autoFetch && (isSet ? !!this.setCode : !!this.scryfallQuery);
    const fmLines = [
      "---",
      `cssclasses: collectors-file`,
      `plugin-version: ${this.plugin.manifest.version}`,
      `collection-type: ${this.type}`,
      `collection-format: ${this.format}`,
      `collection-name: ${yamlStr(this.name)}`,
      isSet && this.setCode ? `set-code: ${this.setCode.toUpperCase()}` : "",
      isSet ? `finish-import: ${this.finishImport}` : "",
      isSet ? `all-prints: ${this.allPrints}` : "",
      !isSet && this.scryfallQuery ? `scryfall-query: ${this.scryfallQuery}` : "",
      !isSet && this.scryfallOrder && this.scryfallOrder !== "released" ? `scryfall-order: ${this.scryfallOrder}` : "",
      this.autoUpdate ? "auto-update: true" : "",
      "---"
    ].filter(Boolean);
    const content = `${fmLines.join("\n")}

${TABLE_HEADER}
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
      new import_obsidian4.Notice(t("notice_create_failed", { error: e.message }));
    }
  }
  // ── Pokémon create / save ────────────────────────────────────────────────────
  pokemonFrontmatter() {
    return [
      "---",
      `cssclasses: collectors-file`,
      `plugin-version: ${this.plugin.manifest.version}`,
      `collection-type: pokemon-set`,
      `collection-name: ${yamlStr(this.name)}`,
      this.tcgdexSetId ? `tcgdex-set-id: ${this.tcgdexSetId}` : "",
      this.pokemonVariantImport !== "all" ? `pokemon-variant-import: ${this.pokemonVariantImport}` : "",
      "---"
    ].filter(Boolean);
  }
  async createPokemon() {
    if (!this.name) {
      new import_obsidian4.Notice(t("notice_name_required"));
      return;
    }
    const folder = this.plugin.settings.collectionsFolder;
    const filename = this.name.replace(/[\\/:*?"<>|]/g, "-") + ".collection";
    const path = (0, import_obsidian4.normalizePath)(folder ? `${folder}/${filename}` : filename);
    if (this.app.vault.getAbstractFileByPath(path) instanceof import_obsidian4.TFile) {
      new import_obsidian4.Notice(t("notice_file_exists", { path }));
      return;
    }
    const content = `${this.pokemonFrontmatter().join("\n")}

${TABLE_HEADER}
`;
    try {
      if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
        await this.app.vault.createFolder(folder);
      }
      const file = await this.app.vault.create(path, content);
      this.close();
      if (this.tcgdexSetId) await this.fetchAndPopulatePokemon(file);
      this.onCreated();
      await this.app.workspace.getLeaf(false).openFile(file);
    } catch (e) {
      new import_obsidian4.Notice(t("notice_create_failed", { error: e.message }));
    }
  }
  async savePokemon() {
    if (!this.name) {
      new import_obsidian4.Notice(t("notice_name_required"));
      return;
    }
    const { file } = this.editTarget;
    try {
      await replaceFrontmatter(file, this.pokemonFrontmatter(), this.app.vault);
      new import_obsidian4.Notice(t("notice_saved"));
      this.close();
      if (this.autoFetch && this.tcgdexSetId) {
        const content = await this.app.vault.read(file);
        const previousOwned = extractOwnedMap(content);
        await this.fetchAndPopulatePokemon(file, previousOwned);
      }
      this.onCreated();
    } catch (e) {
      new import_obsidian4.Notice(t("notice_save_failed", { error: e.message }));
    }
  }
  async fetchAndPopulatePokemon(file, previousOwned) {
    var _a;
    new import_obsidian4.Notice(t("notice_fetching_pokemon", { name: this.name }));
    try {
      const cards = await fetchPokemonSetCards(
        this.tcgdexSetId,
        (fetched, total) => new import_obsidian4.Notice(t("notice_fetching_pokemon_progress", { fetched, total }))
      );
      const suffixMap = {
        normal: "_n",
        reverse: "_r",
        holo: "_h",
        firstEdition: "_fe"
      };
      const targetSuffix = (_a = suffixMap[this.pokemonVariantImport]) != null ? _a : null;
      const rawRows = cards.flatMap(pokemonCardToMarkdownRows).filter((row) => !targetSuffix || row.includes(`${targetSuffix}">`));
      const rows = previousOwned ? applyOwnedStates(rawRows, previousOwned) : rawRows;
      if (previousOwned) {
        await clearCardRows(file, this.app.vault);
      }
      const added = await appendCards(file, rows, this.app.vault);
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      await patchFrontmatter(file, "last-fetched", today, this.app.vault);
      new import_obsidian4.Notice(t("notice_pokemon_added", { count: added, name: this.name }));
    } catch (e) {
      new import_obsidian4.Notice(t("notice_pokemon_failed", { error: e.message }));
    }
  }
  async fetchAndPopulate(file, isSet) {
    new import_obsidian4.Notice(t("notice_fetching_for", { name: this.name }));
    try {
      const cards = isSet ? await fetchSetCards(
        this.setCode,
        (p) => new import_obsidian4.Notice(t("notice_fetching_page", { page: p })),
        this.allPrints ? "prints" : "cards"
      ) : await fetchSearchCards(
        this.scryfallQuery,
        (p) => new import_obsidian4.Notice(t("notice_fetching_page", { page: p })),
        this.scryfallOrder
      );
      const finish = this.finishImport;
      const rows = cards.flatMap((card) => {
        if (finish === "all") return cardToMarkdownRows(card);
        const filtered = { ...card, finishes: card.finishes.filter((f) => f === finish) };
        return cardToMarkdownRows(filtered);
      });
      const added = await appendCards(file, rows, this.app.vault);
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      await patchFrontmatter(file, "last-fetched", today, this.app.vault);
      new import_obsidian4.Notice(t("notice_added_to", { count: added, name: this.name }));
    } catch (e) {
      new import_obsidian4.Notice(t("notice_fetch_failed", { error: e.message }));
    }
  }
};

// src/DashboardView.ts
var DASHBOARD_VIEW_TYPE = "collectors-dashboard";
var DashboardView = class extends import_obsidian5.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.collections = [];
    this.collapsedGroups = /* @__PURE__ */ new Set();
    this.plugin = plugin;
  }
  getViewType() {
    return DASHBOARD_VIEW_TYPE;
  }
  getDisplayText() {
    return t("dashboard_title");
  }
  getIcon() {
    return "collectors-card";
  }
  async onOpen() {
    await this.refresh();
    this.registerEvent(this.app.vault.on("create", (f) => {
      if (f instanceof import_obsidian5.TFile && f.extension === "collection") this.refresh();
    }));
    this.registerEvent(this.app.vault.on("delete", (f) => {
      if (f instanceof import_obsidian5.TFile && f.extension === "collection") this.refresh();
    }));
    this.registerEvent(this.app.vault.on("rename", (f, old) => {
      if (f instanceof import_obsidian5.TFile && f.extension === "collection") this.refresh();
      else if (old.endsWith(".collection")) this.refresh();
    }));
    let modifyTimer = null;
    this.registerEvent(this.app.vault.on("modify", (f) => {
      if (!(f instanceof import_obsidian5.TFile) || f.extension !== "collection") return;
      if (modifyTimer) clearTimeout(modifyTimer);
      modifyTimer = setTimeout(() => {
        modifyTimer = null;
        this.refresh();
      }, 300);
    }));
  }
  async refresh() {
    this.collections = await this.loadCollections();
    this.render();
    this.runMigrations();
    this.runAutoUpdates();
    this.prefetchAllPrices();
  }
  runMigrations() {
    const currentVersion = this.plugin.manifest.version;
    for (const coll of this.collections) {
      const file = this.app.vault.getAbstractFileByPath(coll.path);
      if (file instanceof import_obsidian5.TFile) {
        migrateCollection(file, coll.pluginVersion, currentVersion, this.app.vault);
      }
    }
  }
  // ── Price helpers ─────────────────────────────────────────────────────────────
  fmt(val, coll) {
    const symbol = (coll == null ? void 0 : coll.type) === "pokemon-set" ? this.plugin.priceService.pokemonCurrency() : this.plugin.priceService.currency();
    return `${symbol}${val.toFixed(2)}`;
  }
  collValues(coll) {
    let owned = 0, missing = 0, loaded = false;
    const isPokemon = coll.type === "pokemon-set";
    for (const card of coll.cards) {
      if (isPokemon) {
        if (!this.plugin.priceService.isPokemonCached(card.set, card.number)) continue;
        loaded = true;
        const m = card.id.match(/_([nrhf]e?)$/);
        const suffix = m ? `_${m[1]}` : "_n";
        const p = this.plugin.priceService.getPokemonPrice(card.set, card.number, suffix);
        if (typeof p === "number") {
          if (card.owned) owned += p;
          else missing += p;
        }
      } else {
        if (!this.plugin.priceService.isCached(card.set.toLowerCase(), card.number)) continue;
        loaded = true;
        const p = this.plugin.priceService.getPrice(card.set.toLowerCase(), card.number, card.id.endsWith("_f"));
        if (typeof p === "number") {
          if (card.owned) owned += p;
          else missing += p;
        }
      }
    }
    return { owned, missing, loaded };
  }
  async prefetchAllPrices() {
    const mtgIds = this.collections.filter((c) => c.type.startsWith("mtg") && c.format !== "arena").flatMap((c) => c.cards.map((card) => ({ set: card.set.toLowerCase(), collector_number: card.number })));
    const mtgNeeded = mtgIds.filter((id) => !this.plugin.priceService.isCached(id.set, id.collector_number));
    if (mtgNeeded.length > 0) await this.plugin.priceService.fetchPrices(mtgIds);
    const pokemonColls = this.collections.filter((c) => c.type === "pokemon-set");
    for (const coll of pokemonColls) {
      const anyUncached = coll.cards.some((card) => !this.plugin.priceService.isPokemonCached(card.set, card.number));
      if (!anyUncached) continue;
      await this.plugin.priceService.fetchPokemonPrices(coll.cards.map((c) => c.id));
    }
    this.render();
  }
  // ── Lifecycle ─────────────────────────────────────────────────────────────────
  runAutoUpdates() {
    const targets = this.collections.filter(
      (c) => c.type === "mtg-theme" && c.autoUpdate && (c.setCode || c.scryfallQuery)
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
    const allFiles = vault.getFiles().filter((f) => f.extension === "collection");
    let files;
    if (folder) {
      files = allFiles.filter((f) => {
        var _a;
        return f.path.startsWith(folder + "/") || ((_a = f.parent) == null ? void 0 : _a.path) === folder;
      });
    } else {
      files = allFiles;
    }
    const results = await Promise.all(
      files.map((f) => parseCollectionFile(f, vault))
    );
    return results.filter((c) => c !== null).sort((a, b) => a.name.localeCompare(b.name));
  }
  render() {
    const content = this.contentEl;
    content.empty();
    content.addClass("collectors-root");
    this.renderList(content);
  }
  // ── List screen ───────────────────────────────────────────────────────────────
  renderList(root) {
    const header = root.createDiv({ cls: "col-header col-header-stack" });
    header.createEl("h2", { text: t("dashboard_title"), cls: "col-title" });
    const actions = header.createDiv({ cls: "col-actions" });
    const refreshBtn = actions.createEl("button", { cls: "col-btn-icon", attr: { title: t("btn_refresh") } });
    refreshBtn.innerHTML = "\u21BB";
    refreshBtn.addEventListener("click", () => this.refresh());
    const newBtn = actions.createEl("button", { cls: "col-btn", text: t("btn_new_collection") });
    newBtn.addEventListener(
      "click",
      () => new NewCollectionModal(this.app, this.plugin, () => this.refresh()).open()
    );
    if (this.collections.length === 0) {
      root.createDiv({ cls: "col-empty", text: t("empty_no_collections") });
      return;
    }
    this.renderHeroStats(root);
    const grouped = this.groupByType(this.collections);
    const order = ["mtg-set", "mtg-theme", "pokemon-set"];
    const labels = {
      "mtg-set": t("group_mtg_sets"),
      "mtg-theme": t("group_theme"),
      "pokemon-set": t("group_pokemon_sets")
    };
    for (const type of order) {
      const colls = grouped[type];
      if (!(colls == null ? void 0 : colls.length)) continue;
      const collapsed = this.collapsedGroups.has(type);
      const section = root.createDiv({ cls: `col-section${collapsed ? " col-section-collapsed" : ""}` });
      const titleRow = section.createEl("h3", { cls: "col-section-title" });
      titleRow.createEl("span", { cls: "col-section-chevron", text: collapsed ? "\u25B6" : "\u25BC" });
      titleRow.createEl("span", { text: `${labels[type]} (${colls.length})` });
      titleRow.addEventListener("click", () => {
        if (this.collapsedGroups.has(type)) this.collapsedGroups.delete(type);
        else this.collapsedGroups.add(type);
        section.toggleClass("col-section-collapsed", this.collapsedGroups.has(type));
        const chevron = titleRow.querySelector(".col-section-chevron");
        if (chevron) chevron.textContent = this.collapsedGroups.has(type) ? "\u25B6" : "\u25BC";
      });
      const grid = section.createDiv({ cls: "col-collection-grid" });
      for (const coll of colls) {
        this.renderCollectionCard(grid, coll);
      }
    }
  }
  renderHeroStats(root) {
    const totalOwned = this.collections.reduce((s, c) => s + c.owned, 0);
    const totalCards = this.collections.reduce((s, c) => s + c.total, 0);
    let totalInvested = 0, totalMissing = 0, pricesLoaded = false;
    for (const coll of this.collections) {
      if (coll.format === "arena") continue;
      const { owned, missing, loaded } = this.collValues(coll);
      if (loaded) {
        pricesLoaded = true;
        totalInvested += owned;
        totalMissing += missing;
      }
    }
    const hasMTG = this.collections.some((c) => c.type.startsWith("mtg"));
    const currency = hasMTG ? this.plugin.priceService.currency() : this.plugin.priceService.pokemonCurrency();
    const sourceLabel = hasMTG ? this.plugin.priceService.sourceLabel() : this.plugin.priceService.pokemonSourceLabel();
    const fmt = (v) => `${currency}${v.toFixed(2)}`;
    const hero = root.createDiv({ cls: "col-hero" });
    this.statBox(hero, String(this.collections.length), t("stat_collections"), "");
    this.statBox(hero, `${totalOwned} / ${totalCards}`, t("stat_cards_owned"), "col-hero-owned");
    this.statBox(hero, pricesLoaded ? fmt(totalInvested) : "\u2026", t("stat_invested", { source: sourceLabel }), "col-hero-money");
    this.statBox(hero, pricesLoaded ? fmt(totalMissing) : "\u2026", t("stat_to_complete"), "col-hero-missing");
  }
  statBox(container, value, label, mod) {
    const box = container.createDiv({ cls: `col-hero-box${mod ? " " + mod : ""}` });
    box.createEl("span", { cls: "col-hero-value", text: value });
    box.createEl("span", { cls: "col-hero-label", text: label });
  }
  renderCollectionCard(container, coll) {
    var _a, _b;
    const pct2 = coll.total > 0 ? Math.round(coll.owned / coll.total * 100) : 0;
    const missing = coll.total - coll.owned;
    const { owned: ownedVal, missing: missingVal, loaded: pricesLoaded } = this.collValues(coll);
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
    if (coll.format === "arena") nameRow.createEl("span", { cls: "col-badge col-badge-arena", text: t("badge_arena") });
    const progressWrap = info.createDiv({ cls: "col-progress-wrap" });
    const bar = progressWrap.createDiv({ cls: "col-progress-bar" });
    bar.createDiv({ cls: "col-progress-fill" }).style.width = `${pct2}%`;
    progressWrap.createEl("span", { cls: "col-pct", text: `${pct2}%` });
    const stats = info.createDiv({ cls: "col-stats" });
    stats.createEl("span", { cls: "col-stat-owned", text: t("card_owned_count", { count: coll.owned }) });
    stats.createEl("span", { cls: "col-dot", text: "\xB7" });
    stats.createEl("span", { text: t("card_total_count", { count: coll.total }) });
    if (missing > 0) {
      stats.createEl("span", { cls: "col-dot", text: "\xB7" });
      stats.createEl("span", { cls: "col-stat-missing", text: t("card_missing_count", { count: missing }) });
    }
    if (pricesLoaded) {
      const priceRow = info.createDiv({ cls: "col-price-row" });
      priceRow.createEl("span", { cls: "col-price-invested", text: t("card_invested", { value: this.fmt(ownedVal, coll) }) });
      if (missingVal > 0) {
        priceRow.createEl("span", { cls: "col-dot", text: "\xB7" });
        priceRow.createEl("span", { cls: "col-price-missing", text: t("card_to_complete", { value: this.fmt(missingVal, coll) }) });
      }
    }
    const cardActions = info.createDiv({ cls: "col-card-actions" });
    const detailBtn = cardActions.createEl("button", { cls: "col-btn col-btn-view", attr: { title: t("btn_view_title") } });
    detailBtn.innerHTML = t("btn_view");
    detailBtn.addEventListener("click", () => {
      const file = this.app.vault.getAbstractFileByPath(coll.path);
      if (file instanceof import_obsidian5.TFile) this.app.workspace.getLeaf("tab").openFile(file);
    });
    if ((coll.setCode || coll.scryfallQuery) && coll.type.startsWith("mtg")) {
      const updateBtn = cardActions.createEl("button", { cls: "col-btn-icon", attr: { title: t("btn_update_scryfall") } });
      updateBtn.innerHTML = "\u27F3";
      updateBtn.addEventListener("click", async () => {
        updateBtn.disabled = true;
        await this.updateFromScryfall(coll);
        updateBtn.disabled = false;
      });
    }
    const editBtn = cardActions.createEl("button", { cls: "col-btn-icon", attr: { title: t("btn_edit_collection") } });
    editBtn.innerHTML = "\u270E";
    editBtn.addEventListener("click", () => {
      const file = this.app.vault.getAbstractFileByPath(coll.path);
      if (!(file instanceof import_obsidian5.TFile)) return;
      new NewCollectionModal(this.app, this.plugin, () => this.refresh(), { collection: coll, file }).open();
    });
  }
  // ── Scryfall update ───────────────────────────────────────────────────────────
  async updateFromScryfall(coll, silent = false) {
    var _a, _b;
    if (!silent) new import_obsidian5.Notice(t("notice_fetching_for", { name: coll.name }));
    try {
      const finish = (_a = coll.finishImport) != null ? _a : "all";
      const unique = coll.allPrints === false ? "cards" : "prints";
      const onPage = (p) => {
        if (!silent) new import_obsidian5.Notice(t("notice_fetching_page", { page: p }));
      };
      const onRateLimit = (s) => new import_obsidian5.Notice(t("notice_rate_limit", { seconds: s }), s * 1e3);
      const rawCards = coll.setCode ? await fetchSetCards(coll.setCode, onPage, unique, onRateLimit) : await fetchSearchCards(
        coll.scryfallQuery,
        onPage,
        (_b = coll.scryfallOrder) != null ? _b : "released",
        onRateLimit
      );
      const cards = finish === "all" ? rawCards : rawCards.map((c) => ({ ...c, finishes: c.finishes.filter((f) => f === finish) })).filter((c) => c.finishes.length > 0);
      const file = this.app.vault.getAbstractFileByPath(coll.path);
      if (!(file instanceof import_obsidian5.TFile)) return 0;
      const rows = cards.flatMap(cardToMarkdownRows);
      const added = await appendCards(file, rows, this.app.vault);
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      await patchFrontmatter(file, "last-fetched", today, this.app.vault);
      if (!silent) {
        new import_obsidian5.Notice(
          added > 0 ? t("notice_cards_added", { count: added, name: coll.name }) : t("notice_up_to_date", { name: coll.name })
        );
      } else if (added > 0) {
        new import_obsidian5.Notice(t("notice_auto_updated", { count: added, name: coll.name }));
      }
      return added;
    } catch (e) {
      if (!silent) new import_obsidian5.Notice(t("notice_scryfall_failed", { error: e.message }));
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
};

// src/CollectionView.ts
var import_obsidian7 = require("obsidian");

// src/CardZoomModal.ts
function clamp(v, min = 0, max = 100) {
  return Math.min(max, Math.max(min, v));
}
function adjust(val, fromMin, fromMax, toMin, toMax) {
  return toMin + (toMax - toMin) * ((val - fromMin) / (fromMax - fromMin));
}
function openCardZoom(imageUrl, name, isFoil) {
  const overlay = document.createElement("div");
  overlay.className = "col-zoom-overlay";
  const wrapper = document.createElement("div");
  wrapper.className = "col-zoom-wrapper";
  const rotator = document.createElement("div");
  rotator.className = "col-zoom-rotator";
  const img = document.createElement("img");
  img.src = imageUrl;
  img.alt = name;
  img.className = "col-zoom-img";
  if (isFoil) {
    const shine = document.createElement("div");
    shine.className = "col-zoom-shine";
    const glare = document.createElement("div");
    glare.className = "col-zoom-glare";
    rotator.append(img, shine, glare);
    rotator.classList.add("col-zoom-foil");
  } else {
    rotator.append(img);
  }
  wrapper.append(rotator);
  overlay.append(wrapper);
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add("col-zoom-active"));
  const close = () => {
    overlay.classList.remove("col-zoom-active");
    document.removeEventListener("keydown", onKeyDown);
    setTimeout(() => overlay.remove(), 300);
  };
  const onKeyDown = (e) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKeyDown);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target === wrapper) close();
  });
  let rafId = null;
  rotator.addEventListener("pointermove", (e) => {
    const rect = rotator.getBoundingClientRect();
    const px = clamp((e.clientX - rect.left) / rect.width * 100);
    const py = clamp((e.clientY - rect.top) / rect.height * 100);
    const cx = px - 50;
    const cy = py - 50;
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rotator.style.setProperty("--pointer-x", `${px}%`);
      rotator.style.setProperty("--pointer-y", `${py}%`);
      rotator.style.setProperty("--rx", `${-(cx / 3.5)}deg`);
      rotator.style.setProperty("--ry", `${cy / 3.5}deg`);
      rotator.style.setProperty("--bg-x", `${adjust(px, 0, 100, 37, 63)}%`);
      rotator.style.setProperty("--bg-y", `${adjust(py, 0, 100, 33, 67)}%`);
      rotator.style.setProperty("--card-opacity", "1");
      rafId = null;
    });
  });
  rotator.addEventListener("pointerleave", () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    rotator.style.setProperty("--rx", "0deg");
    rotator.style.setProperty("--ry", "0deg");
    rotator.style.setProperty("--pointer-x", "50%");
    rotator.style.setProperty("--pointer-y", "50%");
    rotator.style.setProperty("--bg-x", "50%");
    rotator.style.setProperty("--bg-y", "50%");
    rotator.style.setProperty("--card-opacity", "0");
  });
}

// src/PokemonCardZoomModal.ts
var BACK_URL = "https://tcg.pokemon.com/assets/img/global/tcg-card-back-2x.jpg";
var CDN = "https://poke-holo.b-cdn.net";
function getCardSuffix(id) {
  const m = id.match(/_([nrhf]e?)$/);
  return m ? `_${m[1]}` : "_n";
}
function mapRarity(rarity, suffix) {
  if (suffix === "_r") return "pokeball holo";
  const r = (rarity != null ? rarity : "").toLowerCase().trim();
  if (r.includes("hyper rare")) return "hyper rare";
  if (r.includes("special illustration rare")) return "special illustration rare";
  if (r.includes("illustration rare")) return "illustration rare";
  if (r.includes("ultra rare")) return "ultra rare";
  if (r.includes("double rare")) return "double rare";
  if (r.includes("radiant rare")) return "radiant rare";
  if (r.includes("rare holo") || r === "rare") return "rare holo";
  if (r.includes("uncommon")) return "uncommon";
  return "common";
}
function detectSupertype(typeStr) {
  const l = typeStr.toLowerCase();
  if (l === "trainer" || l.includes("item") || l.includes("supporter") || l.includes("stadium")) {
    return "trainer";
  }
  if (l === "energy") return "energy";
  return "pok\xE9mon";
}
function getTypeClasses(typeStr) {
  const known = /* @__PURE__ */ new Set(["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal", "dragon", "fairy", "colorless"]);
  return typeStr.toLowerCase().split("/").map((t2) => t2.trim()).filter((t2) => known.has(t2)).join(" ");
}
function getFoilUrl(setId, localId, suffix) {
  if (suffix === "_n") return null;
  const foilSuffix = suffix === "_r" ? "ph" : "std";
  const cdnSetId = setId.replace(/([a-z])pt(\d)/g, "$1-$2");
  const num = parseInt(localId);
  const paddedNum = isNaN(num) ? localId : num.toString().padStart(3, "0");
  return `${CDN}/foils/${cdnSetId}_en_${paddedNum}_${foilSuffix}.foil.webp`;
}
function makeState() {
  return { rx: 0, ry: 0, px: 50, py: 50, op: 0, bx: 50, by: 50 };
}
function applyVars(el, v) {
  const dx = (v.px - 50) / 50, dy = (v.py - 50) / 50;
  const dist = Math.min(Math.sqrt(dx * dx + dy * dy), 1);
  el.style.setProperty("--rotate-x", `${v.rx}deg`);
  el.style.setProperty("--rotate-y", `${v.ry}deg`);
  el.style.setProperty("--pointer-x", `${v.px}%`);
  el.style.setProperty("--pointer-y", `${v.py}%`);
  el.style.setProperty("--card-opacity", `${v.op}`);
  el.style.setProperty("--background-x", `${v.bx}%`);
  el.style.setProperty("--background-y", `${v.by}%`);
  el.style.setProperty("--pointer-from-center", `${dist}`);
  el.style.setProperty("--pointer-from-top", `${v.py / 100}`);
  el.style.setProperty("--pointer-from-left", `${v.px / 100}`);
  el.style.setProperty("--card-scale", "1");
  el.style.setProperty("--translate-x", "0px");
  el.style.setProperty("--translate-y", "0px");
  el.style.setProperty("--rotate-delta", "0");
  el.style.setProperty("--seedx", "0.5");
  el.style.setProperty("--seedy", "0.5");
}
function openPokemonCardZoom(card) {
  const suffix = getCardSuffix(card.id);
  const rarity = mapRarity(card.rarity, suffix);
  const supertype = detectSupertype(card.type);
  const typeClass = getTypeClasses(card.type);
  const foilUrl = getFoilUrl(card.set, card.number, suffix);
  const overlay = document.createElement("div");
  overlay.className = "pkmn-zoom-overlay";
  const scopeWrap = document.createElement("div");
  scopeWrap.className = "pkmn-zoom-modal";
  const cardEl = document.createElement("div");
  cardEl.className = ["card", "interactive", typeClass].filter(Boolean).join(" ");
  cardEl.dataset.rarity = rarity;
  cardEl.dataset.supertype = supertype;
  cardEl.dataset.subtypes = "basic";
  cardEl.dataset.set = card.set;
  cardEl.dataset.number = card.number;
  cardEl.dataset.trainerGallery = "false";
  cardEl.style.pointerEvents = "auto";
  const cur = makeState(), tgt = makeState();
  applyVars(cardEl, cur);
  const translater = document.createElement("div");
  translater.className = "card__translater";
  const rotator = document.createElement("button");
  rotator.className = "card__rotator";
  rotator.setAttribute("aria-label", card.name);
  const backImg = document.createElement("img");
  backImg.className = "card__back";
  backImg.src = BACK_URL;
  backImg.alt = "Card back";
  rotator.appendChild(backImg);
  const front = document.createElement("div");
  front.className = "card__front";
  if (foilUrl) {
    front.style.cssText = `--foil:url(${foilUrl});--mask:url(${foilUrl})`;
  }
  cardEl.classList.add("loading");
  const frontImg = document.createElement("img");
  frontImg.src = card.imageUrl;
  frontImg.alt = card.name;
  frontImg.setAttribute("loading", "eager");
  front.appendChild(frontImg);
  frontImg.onload = () => {
    cardEl.classList.remove("loading");
    if (foilUrl) {
      const probe = new Image();
      probe.onload = () => cardEl.classList.add("masked");
      probe.onerror = () => {
      };
      probe.src = foilUrl;
    }
  };
  frontImg.onerror = () => cardEl.classList.remove("loading");
  for (const cls of ["card__shine", "card__glitter", "card__glare", "card__glare2"]) {
    const d = document.createElement("div");
    d.className = cls;
    front.appendChild(d);
  }
  rotator.appendChild(front);
  translater.appendChild(rotator);
  cardEl.appendChild(translater);
  scopeWrap.appendChild(cardEl);
  overlay.appendChild(scopeWrap);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("pkmn-zoom-active"));
  let rafId = 0;
  const tick = () => {
    const L = 0.12;
    cur.rx += (tgt.rx - cur.rx) * L;
    cur.ry += (tgt.ry - cur.ry) * L;
    cur.px += (tgt.px - cur.px) * L;
    cur.py += (tgt.py - cur.py) * L;
    cur.op += (tgt.op - cur.op) * L;
    cur.bx += (tgt.bx - cur.bx) * L;
    cur.by += (tgt.by - cur.by) * L;
    applyVars(cardEl, cur);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
  cardEl.addEventListener("pointermove", (e) => {
    const r = cardEl.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * 100;
    const y = (e.clientY - r.top) / r.height * 100;
    tgt.rx = (x - 50) * 0.35;
    tgt.ry = (y - 50) * -0.35;
    tgt.px = x;
    tgt.py = y;
    const dx = (x - 50) / 50, dy = (y - 50) / 50;
    tgt.op = Math.min(0.3 + Math.sqrt(dx * dx + dy * dy) * 0.5, 0.9);
    tgt.bx = 40 + x / 100 * 20;
    tgt.by = 40 + y / 100 * 20;
    cardEl.classList.add("interacting");
  });
  cardEl.addEventListener("pointerleave", () => {
    Object.assign(tgt, makeState());
    cardEl.classList.remove("interacting");
  });
  const close = () => {
    cancelAnimationFrame(rafId);
    overlay.classList.remove("pkmn-zoom-active");
    document.removeEventListener("keydown", onKey);
    setTimeout(() => overlay.remove(), 250);
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target === scopeWrap) close();
  });
}

// src/CardSearchModal.ts
var import_obsidian6 = require("obsidian");
var API3 = "https://api.scryfall.com";
async function autocomplete(q) {
  if (q.length < 2) return [];
  const res = await (0, import_obsidian6.requestUrl)({ url: `${API3}/cards/autocomplete?q=${encodeURIComponent(q)}` });
  if (res.status < 200 || res.status >= 300) return [];
  const data = res.json;
  return data.data.slice(0, 10);
}
async function fetchPrintings(name) {
  const q = encodeURIComponent(`!"${name}"`);
  const res = await (0, import_obsidian6.requestUrl)({
    url: `${API3}/cards/search?q=${q}&unique=prints&order=released&dir=asc`,
    headers: { Accept: "application/json" }
  });
  if (res.status < 200 || res.status >= 300) return [];
  const data = res.json;
  return data.data;
}
var CardSearchModal = class extends import_obsidian6.Modal {
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
    contentEl.createEl("h2", { text: t("csm_title", { name: this.collection.name }) });
    const searchWrap = contentEl.createDiv({ cls: "csm-search-wrap" });
    const input = searchWrap.createEl("input", {
      cls: "csm-input",
      attr: { type: "text", placeholder: t("csm_placeholder"), autofocus: "true" }
    });
    this.suggestionsEl = searchWrap.createDiv({ cls: "csm-suggestions" });
    this.printingsEl = contentEl.createDiv({ cls: "csm-printings" });
    const footer = contentEl.createDiv({ cls: "csm-footer" });
    const countEl = footer.createEl("span", { cls: "csm-count", text: t("csm_selected", { count: 0 }) });
    this.addBtn = footer.createEl("button", {
      cls: "csm-add-btn",
      text: t("csm_add_btn"),
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
      this.suggestionsEl.createEl("div", { cls: "csm-no-results", text: t("csm_no_matches") });
      return;
    }
    for (const name of names) {
      const item = this.suggestionsEl.createEl("div", { cls: "csm-suggestion", text: name });
      item.addEventListener("click", async () => {
        input.value = name;
        this.suggestionsEl.empty();
        this.selectedPrints.clear();
        this.printingsEl.empty();
        this.printingsEl.createEl("div", { cls: "csm-loading", text: t("csm_loading_printings") });
        this.printings = await fetchPrintings(name);
        this.renderPrintings(this.printings, countEl);
      });
    }
  }
  renderPrintings(cards, countEl) {
    var _a, _b, _c, _d, _e, _f;
    this.printingsEl.empty();
    if (cards.length === 0) {
      this.printingsEl.createEl("div", { cls: "csm-no-results", text: t("csm_no_printings") });
      return;
    }
    this.printingsEl.createEl("p", {
      cls: "csm-hint",
      text: t("csm_hint")
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
    countEl.textContent = t("csm_selected", { count: n });
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
    if (!(file instanceof import_obsidian6.TFile)) return;
    const added = await appendCards(file, rows, this.app.vault);
    new import_obsidian6.Notice(
      added > 0 ? t("notice_cards_added_csm", { count: added, name: this.collection.name }) : t("notice_already_in_coll")
    );
    this.close();
    if (added > 0) this.onAdded();
  }
};

// src/CollectionView.ts
var COLLECTION_VIEW_TYPE = "collection-detail";
function getCardVariant(card) {
  if (card.id.endsWith("_f")) return "foil";
  if (card.id.endsWith("_r")) return "reverse";
  if (card.id.endsWith("_h")) return "holo";
  if (card.id.endsWith("_fe")) return "firstEdition";
  return "nonfoil";
}
var CollectionView = class extends import_obsidian7.FileView {
  constructor(leaf, plugin) {
    super(leaf);
    this.collection = null;
    this.filter = "all";
    this.finishFilter = "all";
    this.sortBy = "number";
    this.searchQuery = "";
    this.saveTimers = /* @__PURE__ */ new Map();
    this.plugin = plugin;
  }
  getViewType() {
    return COLLECTION_VIEW_TYPE;
  }
  getDisplayText() {
    var _a, _b;
    return (_b = (_a = this.collection) == null ? void 0 : _a.name) != null ? _b : t("collection_display_text");
  }
  getIcon() {
    return "collectors-card";
  }
  canAcceptExtension(ext) {
    return ext === "collection";
  }
  async onLoadFile(file) {
    this.filter = "all";
    this.finishFilter = "all";
    this.sortBy = "number";
    this.searchQuery = "";
    this.collection = await parseCollectionFile(file, this.app.vault);
    this.render();
    if (this.collection && this.collection.format !== "arena") {
      await this.fetchPricesForCollection(this.collection);
    }
  }
  async onUnloadFile(_file) {
    this.contentEl.empty();
    this.collection = null;
  }
  async reload() {
    if (!this.file) return;
    this.collection = await parseCollectionFile(this.file, this.app.vault);
    this.render();
    if (this.collection && this.collection.format !== "arena") {
      await this.fetchPricesForCollection(this.collection);
    }
  }
  async fetchPricesForCollection(coll) {
    if (coll.type === "pokemon-set") {
      const anyUncached = coll.cards.some((card) => !this.plugin.priceService.isPokemonCached(card.set, card.number));
      if (!anyUncached) return;
      this.showLoading(t("loading_prices"));
      await this.plugin.priceService.fetchPokemonPrices(coll.cards.map((c) => c.id));
      this.hideLoading();
      this.render();
    } else {
      const ids = coll.cards.map((c) => ({ set: c.set.toLowerCase(), collector_number: c.number }));
      const needed = ids.filter((id) => !this.plugin.priceService.isCached(id.set, id.collector_number));
      if (needed.length === 0) return;
      this.showLoading(t("loading_prices"));
      await this.plugin.priceService.fetchPrices(ids, (s) => this.showLoading(t("loading_rate_limited", { seconds: s })));
      this.hideLoading();
      this.render();
    }
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("collectors-root");
    if (!this.collection) {
      contentEl.createDiv({ cls: "col-empty", text: t("loading") });
      return;
    }
    this.renderDetail(contentEl, this.collection);
  }
  // ── Price helpers ────────────────────────────────────────────────────────────
  cardPrice(card) {
    var _a;
    if (((_a = this.collection) == null ? void 0 : _a.type) === "pokemon-set") {
      const m = card.id.match(/_([nrhf]e?)$/);
      const suffix = m ? `_${m[1]}` : "_n";
      return this.plugin.priceService.getPokemonPrice(card.set, card.number, suffix);
    }
    return this.plugin.priceService.getPrice(card.set.toLowerCase(), card.number, card.id.endsWith("_f"));
  }
  fmt(val) {
    var _a;
    const symbol = ((_a = this.collection) == null ? void 0 : _a.type) === "pokemon-set" ? this.plugin.priceService.pokemonCurrency() : this.plugin.priceService.currency();
    return `${symbol}${val.toFixed(2)}`;
  }
  collValues(coll) {
    let owned = 0, missing = 0, loaded = false;
    const isPokemon = coll.type === "pokemon-set";
    for (const card of coll.cards) {
      if (isPokemon) {
        if (!this.plugin.priceService.isPokemonCached(card.set, card.number)) continue;
        loaded = true;
        const m = card.id.match(/_([nrhf]e?)$/);
        const suffix = m ? `_${m[1]}` : "_n";
        const p = this.plugin.priceService.getPokemonPrice(card.set, card.number, suffix);
        if (typeof p === "number") {
          if (card.owned) owned += p;
          else missing += p;
        }
      } else {
        if (!this.plugin.priceService.isCached(card.set.toLowerCase(), card.number)) continue;
        loaded = true;
        const p = this.plugin.priceService.getPrice(card.set.toLowerCase(), card.number, card.id.endsWith("_f"));
        if (typeof p === "number") {
          if (card.owned) owned += p;
          else missing += p;
        }
      }
    }
    return { owned, missing, loaded };
  }
  statBox(container, value, label, mod) {
    const box = container.createDiv({ cls: `col-hero-box${mod ? " " + mod : ""}` });
    box.createEl("span", { cls: "col-hero-value", text: value });
    box.createEl("span", { cls: "col-hero-label", text: label });
  }
  // ── Detail view ──────────────────────────────────────────────────────────────
  renderDetail(root, coll) {
    const header = root.createDiv({ cls: "col-header" });
    const titleWrap = header.createDiv({ cls: "col-header-title" });
    titleWrap.createEl("h2", { cls: "col-title", text: coll.name });
    if (coll.setCode) titleWrap.createEl("span", { cls: "col-badge", text: coll.setCode });
    if (coll.format === "arena") titleWrap.createEl("span", { cls: "col-badge col-badge-arena", text: t("badge_arena") });
    const headerActions = header.createDiv({ cls: "col-actions" });
    if ((coll.setCode || coll.scryfallQuery) && coll.type.startsWith("mtg")) {
      const updateBtn = headerActions.createEl("button", { cls: "col-btn-icon", attr: { title: t("btn_update_scryfall") } });
      updateBtn.innerHTML = "\u27F3";
      updateBtn.addEventListener("click", async () => {
        updateBtn.disabled = true;
        this.showLoading(t("loading_fetching"));
        await this.updateFromScryfall(coll);
        this.hideLoading();
        updateBtn.disabled = false;
        await this.reload();
      });
    }
    const addCardBtn = headerActions.createEl("button", { cls: "col-btn", text: t("btn_add_card") });
    addCardBtn.addEventListener("click", () => {
      new CardSearchModal(this.app, coll, () => this.reload()).open();
    });
    const editBtn = headerActions.createEl("button", { cls: "col-btn-icon", attr: { title: t("btn_edit_collection") } });
    editBtn.innerHTML = "\u270E";
    editBtn.addEventListener("click", () => {
      const file = this.app.vault.getAbstractFileByPath(coll.path);
      if (!(file instanceof import_obsidian7.TFile)) return;
      new NewCollectionModal(this.app, this.plugin, () => this.reload(), { collection: coll, file }).open();
    });
    this.renderDetailHero(root, coll);
    const controls = root.createDiv({ cls: "col-controls" });
    const searchInput = controls.createEl("input", {
      cls: "col-search",
      attr: { type: "text", placeholder: t("search_placeholder"), value: this.searchQuery }
    });
    const row2 = controls.createDiv({ cls: "col-controls-row" });
    const tabs = row2.createDiv({ cls: "col-tabs" });
    const filterValues = ["all", "owned", "missing"];
    const tabLabels = {
      all: t("filter_all"),
      owned: t("filter_owned"),
      missing: t("filter_missing")
    };
    if (coll.type === "pokemon-set") {
      const pokemonVariants = [
        { value: "all", label: t("filter_all") },
        { value: "nonfoil", label: t("variant_normal") },
        { value: "reverse", label: t("variant_reverse_holo") },
        { value: "holo", label: t("variant_holo") },
        { value: "firstEdition", label: t("variant_first_edition") }
      ];
      const variantWrap = row2.createDiv({ cls: "col-finish-wrap col-variant-wrap" });
      for (const v of pokemonVariants) {
        const btn = variantWrap.createEl("button", {
          cls: `col-finish-btn${this.finishFilter === v.value ? " col-finish-btn-active" : ""}`,
          text: v.label
        });
        btn.addEventListener("click", () => {
          this.finishFilter = v.value;
          variantWrap.querySelectorAll(".col-finish-btn").forEach((b) => b.removeClass("col-finish-btn-active"));
          btn.addClass("col-finish-btn-active");
          this.renderCards(grid, coll);
        });
      }
    } else {
      const hasFoil = coll.cards.some((c) => c.id.endsWith("_f"));
      const hasNonFoil = coll.cards.some((c) => c.id.endsWith("_n"));
      if (hasFoil && hasNonFoil) {
        const finishWrap = row2.createDiv({ cls: "col-finish-wrap" });
        for (const fo of [
          { value: "foil", label: t("finish_foil") },
          { value: "nonfoil", label: t("finish_normal") }
        ]) {
          const lbl = finishWrap.createEl("label", { cls: "col-finish-label" });
          const cb = lbl.createEl("input", { attr: { type: "checkbox" } });
          cb.checked = this.finishFilter === fo.value || this.finishFilter === "all";
          lbl.createEl("span", { text: fo.label });
          cb.addEventListener("change", () => {
            const inputs = finishWrap.querySelectorAll("input");
            const f = inputs[0].checked, n = inputs[1].checked;
            this.finishFilter = f && n ? "all" : f ? "foil" : n ? "nonfoil" : "all";
            this.renderCards(grid, coll);
          });
        }
      }
    }
    const sortWrap = row2.createDiv({ cls: "col-sort-wrap" });
    sortWrap.createEl("span", { cls: "col-sort-label", text: t("sort_label") });
    const sortSelect = sortWrap.createEl("select", { cls: "col-sort-select" });
    const sortOptions = [
      { value: "number", label: t("sort_number") },
      { value: "name", label: t("sort_name") },
      { value: "price-desc", label: t("sort_price_desc") },
      { value: "price-asc", label: t("sort_price_asc") },
      { value: "release-desc", label: t("sort_newest") },
      { value: "release-asc", label: t("sort_oldest") }
    ];
    for (const opt of sortOptions) {
      const o = sortSelect.createEl("option", { attr: { value: opt.value }, text: opt.label });
      if (opt.value === this.sortBy) o.selected = true;
    }
    const grid = root.createDiv({ cls: "col-card-grid" });
    for (const f of filterValues) {
      const tab = tabs.createEl("button", {
        cls: `col-tab${this.filter === f ? " col-tab-active" : ""}`,
        text: tabLabels[f]
      });
      tab.addEventListener("click", () => {
        this.filter = f;
        this.renderCards(grid, coll);
        tabs.querySelectorAll(".col-tab").forEach((t2) => t2.removeClass("col-tab-active"));
        tab.addClass("col-tab-active");
      });
    }
    sortSelect.addEventListener("change", () => {
      this.sortBy = sortSelect.value;
      this.renderCards(grid, coll);
    });
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value;
      this.renderCards(grid, coll);
    });
    this.renderCards(grid, coll);
  }
  renderDetailHero(root, coll) {
    const pct2 = coll.total > 0 ? Math.round(coll.owned / coll.total * 100) : 0;
    const { owned: ownedVal, missing: missingVal, loaded: pricesLoaded } = this.collValues(coll);
    const hero = root.createDiv({ cls: "col-detail-hero" });
    this.statBox(hero, `${coll.owned} / ${coll.total}`, t("stat_cards_owned"), "col-hero-owned");
    const progBox = hero.createDiv({ cls: "col-hero-box col-hero-progress" });
    const progWrap = progBox.createDiv({ cls: "col-progress-wrap" });
    progWrap.createDiv({ cls: "col-progress-bar" }).createDiv({ cls: "col-progress-fill" }).style.width = `${pct2}%`;
    progBox.createEl("span", { cls: "col-hero-value col-hero-pct", text: `${pct2}%` });
    if (pricesLoaded) {
      const srcLabel = coll.type === "pokemon-set" ? this.plugin.priceService.pokemonSourceLabel() : this.plugin.priceService.sourceLabel();
      this.statBox(hero, this.fmt(ownedVal), t("stat_invested", { source: srcLabel }), "col-hero-money");
      this.statBox(hero, this.fmt(missingVal), t("stat_to_complete"), "col-hero-missing");
    }
  }
  renderCards(grid, coll) {
    grid.empty();
    const filtered = coll.cards.filter((card) => {
      if (this.filter === "owned" && !card.owned) return false;
      if (this.filter === "missing" && card.owned) return false;
      if (this.finishFilter !== "all" && getCardVariant(card) !== this.finishFilter) return false;
      if (this.searchQuery) return card.name.toLowerCase().includes(this.searchQuery.toLowerCase());
      return true;
    });
    const paint = (sorted) => {
      grid.empty();
      if (sorted.length === 0) {
        grid.createDiv({ cls: "col-empty", text: t("no_cards_match") });
        return;
      }
      for (const card of sorted) this.renderCardTile(grid, card, coll);
    };
    if (this.sortBy === "name") {
      paint([...filtered].sort((a, b) => a.name.localeCompare(b.name)));
      return;
    }
    if (this.sortBy === "number") {
      paint([...filtered].sort((a, b) => {
        if (a.set !== b.set) return a.set.localeCompare(b.set);
        return parseInt(a.number) - parseInt(b.number) || a.number.localeCompare(b.number);
      }));
      return;
    }
    if (this.sortBy === "price-desc" || this.sortBy === "price-asc") {
      const dir2 = this.sortBy === "price-desc" ? -1 : 1;
      paint([...filtered].sort((a, b) => {
        var _a, _b;
        return (((_a = this.cardPrice(a)) != null ? _a : -1) - ((_b = this.cardPrice(b)) != null ? _b : -1)) * dir2;
      }));
      return;
    }
    const uniqueSets = [...new Set(filtered.map((c) => c.set.toLowerCase()))];
    const missing = uniqueSets.filter((s) => !getSetDate(s));
    const dir = this.sortBy === "release-desc" ? -1 : 1;
    const finish = (cards) => paint([...cards].sort((a, b) => {
      var _a, _b;
      const da = (_a = getSetDate(a.set)) != null ? _a : "0000-00-00";
      const db = (_b = getSetDate(b.set)) != null ? _b : "0000-00-00";
      if (da !== db) return da < db ? -dir : dir;
      return parseInt(a.number) - parseInt(b.number) || a.number.localeCompare(b.number);
    }));
    if (missing.length === 0) {
      finish(filtered);
    } else {
      Promise.all(missing.map((s) => fetchSetReleasedAt(s))).then(() => finish(filtered));
    }
  }
  renderCardTile(grid, card, coll) {
    var _a, _b, _c;
    const variant = getCardVariant(card);
    const isFoil = variant === "foil";
    const tileCls = ["col-tile", card.owned ? "col-tile-owned" : "", isFoil ? "col-tile-foil" : ""].filter(Boolean).join(" ");
    const tile = grid.createDiv({ cls: tileCls });
    const badgeText = {
      foil: "F",
      reverse: "R",
      holo: "H",
      firstEdition: "1st"
    };
    if (badgeText[variant]) tile.createDiv({ cls: "col-foil-badge", text: badgeText[variant] });
    if (card.imageUrl) {
      const imgWrap = tile.createDiv({ cls: "col-tile-img-wrap" });
      const img = imgWrap.createEl("img", {
        cls: "col-tile-img",
        attr: { src: card.imageUrl, alt: card.name, loading: "lazy" }
      });
      img.addEventListener("error", () => {
        var _a2;
        img.style.display = "none";
        imgWrap.createEl("div", { cls: "col-tile-img-fallback", text: (_a2 = card.name[0]) != null ? _a2 : "?" });
      });
      tile.addEventListener("click", () => {
        if (coll.type === "pokemon-set") {
          openPokemonCardZoom(card);
        } else {
          openCardZoom(card.imageUrl, card.name, isFoil);
        }
      });
    } else {
      tile.createDiv({ cls: "col-tile-img-fallback", text: (_a = card.name[0]) != null ? _a : "?" });
    }
    const tileFooter = tile.createDiv({ cls: "col-tile-footer" });
    tileFooter.createEl("span", { cls: "col-tile-name", text: card.name });
    const meta = tileFooter.createDiv({ cls: "col-tile-meta" });
    meta.createEl("span", { cls: `col-rarity col-rarity-${card.rarity}`, text: (_c = (_b = card.rarity[0]) == null ? void 0 : _b.toUpperCase()) != null ? _c : "" });
    meta.createEl("span", { text: `${card.set} #${card.number}` });
    const countEl = meta.createEl("span", {
      cls: `col-tile-count${card.count > 0 ? " col-tile-count-owned" : ""}`,
      text: `\xD7${card.count}`
    });
    const priceEl = tileFooter.createEl("span", { cls: "col-tile-price" });
    if (coll.format === "arena") {
      priceEl.textContent = t("price_digital");
      priceEl.addClass("col-tile-price-empty");
    } else {
      const isPokemon = coll.type === "pokemon-set";
      const isCached = isPokemon ? this.plugin.priceService.isPokemonCached(card.set, card.number) : this.plugin.priceService.isCached(card.set.toLowerCase(), card.number);
      const p = isCached ? this.cardPrice(card) : void 0;
      if (typeof p === "number") {
        priceEl.textContent = this.fmt(p);
      } else if (!isCached) {
        priceEl.addClass("col-tile-price-loading");
      } else {
        priceEl.textContent = "\u2014";
        priceEl.addClass("col-tile-price-empty");
      }
    }
    const applyCount = (delta, e) => {
      e.stopPropagation();
      const newCount = Math.max(0, card.count + delta);
      if (newCount === card.count) return;
      card.count = newCount;
      card.owned = newCount > 0;
      coll.owned = coll.cards.filter((c) => c.owned).length;
      countEl.textContent = `\xD7${newCount}`;
      countEl.className = `col-tile-count${newCount > 0 ? " col-tile-count-owned" : ""}`;
      tile.toggleClass("col-tile-owned", newCount > 0);
      this.refreshDetailHero(coll);
      clearTimeout(this.saveTimers.get(card.id));
      this.saveTimers.set(card.id, setTimeout(async () => {
        const file = this.app.vault.getAbstractFileByPath(coll.path);
        if (file instanceof import_obsidian7.TFile) await setCardCount(file, card.id, card.count, this.app.vault);
        this.saveTimers.delete(card.id);
      }, 400));
    };
    const removeBtn = tile.createEl("button", { cls: "col-qty-btn col-qty-remove", attr: { title: t("btn_remove_copy") } });
    removeBtn.textContent = "\u2212";
    removeBtn.addEventListener("click", (e) => applyCount(-1, e));
    const addBtn = tile.createEl("button", { cls: "col-qty-btn col-qty-add", attr: { title: t("btn_add_copy") } });
    addBtn.textContent = "+";
    addBtn.addEventListener("click", (e) => applyCount(1, e));
  }
  refreshDetailHero(coll) {
    const root = this.contentEl;
    const pct2 = coll.total > 0 ? Math.round(coll.owned / coll.total * 100) : 0;
    const { owned: ov, missing: mv } = this.collValues(coll);
    const fill = root.querySelector(".col-progress-fill");
    if (fill) fill.style.width = `${pct2}%`;
    const pctEl = root.querySelector(".col-hero-pct");
    if (pctEl) pctEl.textContent = `${pct2}%`;
    const heroValues = root.querySelectorAll(".col-hero-value");
    if (heroValues[0]) heroValues[0].textContent = `${coll.owned} / ${coll.total}`;
    if (heroValues[2]) heroValues[2].textContent = this.fmt(ov);
    if (heroValues[3]) heroValues[3].textContent = this.fmt(mv);
  }
  // ── Loading overlay ──────────────────────────────────────────────────────────
  showLoading(label = t("loading_updating")) {
    let overlay = this.contentEl.querySelector(".col-loading-overlay");
    if (!overlay) {
      overlay = this.contentEl.createDiv({ cls: "col-loading-overlay" });
      overlay.createDiv({ cls: "col-loading-spinner" });
      overlay.createDiv({ cls: "col-loading-label", text: label });
    } else {
      const lbl = overlay.querySelector(".col-loading-label");
      if (lbl) lbl.textContent = label;
    }
    requestAnimationFrame(() => overlay.addClass("col-loading-visible"));
  }
  hideLoading() {
    const overlay = this.contentEl.querySelector(".col-loading-overlay");
    if (!overlay) return;
    overlay.removeClass("col-loading-visible");
    setTimeout(() => overlay.remove(), 220);
  }
  // ── Scryfall update ──────────────────────────────────────────────────────────
  async updateFromScryfall(coll) {
    var _a, _b;
    new import_obsidian7.Notice(t("notice_fetching_for", { name: coll.name }));
    try {
      const finish = (_a = coll.finishImport) != null ? _a : "all";
      const unique = coll.allPrints === false ? "cards" : "prints";
      const onPage = (p) => this.showLoading(t("loading_page", { page: p }));
      const onRateLimit = (s) => this.showLoading(t("loading_rate_limited", { seconds: s }));
      const rawCards = coll.setCode ? await fetchSetCards(coll.setCode, onPage, unique, onRateLimit) : await fetchSearchCards(
        coll.scryfallQuery,
        onPage,
        (_b = coll.scryfallOrder) != null ? _b : "released",
        onRateLimit
      );
      const cards = finish === "all" ? rawCards : rawCards.map((c) => ({ ...c, finishes: c.finishes.filter((f) => f === finish) })).filter((c) => c.finishes.length > 0);
      const file = this.app.vault.getAbstractFileByPath(coll.path);
      if (!(file instanceof import_obsidian7.TFile)) return;
      const rows = cards.flatMap(cardToMarkdownRows);
      const added = await appendCards(file, rows, this.app.vault);
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      await patchFrontmatter(file, "last-fetched", today, this.app.vault);
      new import_obsidian7.Notice(
        added > 0 ? t("notice_cards_added", { count: added, name: coll.name }) : t("notice_up_to_date", { name: coll.name })
      );
    } catch (e) {
      new import_obsidian7.Notice(t("notice_scryfall_failed", { error: e.message }));
    }
  }
};

// src/types.ts
var DEFAULT_SETTINGS = {
  collectionsFolder: "",
  autoDetect: true,
  priceSource: "scryfall-usd",
  tcgplayerKey: "",
  cardmarketAppToken: "",
  cardmarketAppSecret: "",
  cardmarketAccessToken: "",
  cardmarketAccessSecret: "",
  enabledGames: { mtg: true, pokemon: true, onepiece: true, yugioh: true },
  pokemonPriceSource: "tcgplayer"
};

// src/settings.ts
var import_obsidian8 = require("obsidian");
var TABS = () => [
  { id: "general", icon: "\u2699", label: t("settings_tab_general") },
  { id: "mtg", icon: "\u2726", label: t("settings_tab_mtg") },
  { id: "pokemon", icon: "\u26A1", label: t("settings_tab_pokemon") },
  { id: "onepiece", icon: "\u2620", label: t("settings_tab_onepiece") },
  { id: "yugioh", icon: "\u{1F441}", label: t("settings_tab_yugioh") }
];
var CollectorsSettingTab = class extends import_obsidian8.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.activeTab = "general";
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("col-settings");
    const tabBar = containerEl.createDiv({ cls: "col-settings-tabs" });
    const body = containerEl.createDiv({ cls: "col-settings-body" });
    const paneEls = {};
    const tabEls = {};
    const switchTab = (id) => {
      this.activeTab = id;
      for (const k of Object.keys(paneEls)) {
        paneEls[k].toggleClass("col-settings-pane-active", k === id);
        tabEls[k].toggleClass("col-settings-tab-active", k === id);
      }
    };
    for (const { id, icon, label } of TABS()) {
      const tab = tabBar.createEl("button", { cls: "col-settings-tab" });
      tab.createEl("span", { cls: "col-settings-tab-icon", text: icon });
      tab.createEl("span", { cls: "col-settings-tab-label", text: label });
      tab.addEventListener("click", () => switchTab(id));
      tabEls[id] = tab;
      paneEls[id] = body.createDiv({ cls: "col-settings-pane" });
    }
    this.buildGeneral(paneEls["general"]);
    this.buildMTG(paneEls["mtg"]);
    this.buildPokemon(paneEls["pokemon"]);
    this.buildComingSoon(paneEls["onepiece"], "onepiece", "\u2620", "One Piece");
    this.buildComingSoon(paneEls["yugioh"], "yugioh", "\u{1F441}", "Yu-Gi-Oh!");
    switchTab(this.activeTab);
  }
  // ── Helpers ──────────────────────────────────────────────────────────────────
  sectionTitle(el, text) {
    el.createEl("h3", { cls: "col-settings-section-title", text });
  }
  sectionDesc(el, text) {
    el.createEl("p", { cls: "col-settings-desc", text });
  }
  // ── General ───────────────────────────────────────────────────────────────────
  buildGeneral(el) {
    this.sectionTitle(el, t("settings_section_collections"));
    new import_obsidian8.Setting(el).setName(t("settings_folder")).setDesc(t("settings_folder_desc")).addText(
      (tx) => tx.setPlaceholder(t("settings_folder_ph")).setValue(this.plugin.settings.collectionsFolder).onChange(async (v) => {
        this.plugin.settings.collectionsFolder = v.trim();
        await this.plugin.saveSettings();
      })
    );
  }
  // ── MTG ───────────────────────────────────────────────────────────────────────
  buildMTG(el) {
    if (!this.plugin.settings.enabledGames) {
      this.plugin.settings.enabledGames = { mtg: true, pokemon: true, onepiece: true, yugioh: true };
    }
    this.sectionTitle(el, t("settings_tab_mtg"));
    new import_obsidian8.Setting(el).setName(t("settings_enable_game", { game: "Magic: The Gathering" })).setDesc(t("settings_enable_game_desc")).addToggle(
      (tx) => {
        var _a;
        return tx.setValue((_a = this.plugin.settings.enabledGames["mtg"]) != null ? _a : true).onChange(async (v) => {
          this.plugin.settings.enabledGames["mtg"] = v;
          await this.plugin.saveSettings();
        });
      }
    );
    this.sectionTitle(el, t("settings_section_card_data"));
    this.sectionDesc(el, t("settings_card_data_desc"));
    new import_obsidian8.Setting(el).setName(t("settings_source")).addDropdown((d) => {
      d.addOption("scryfall", "Scryfall");
      d.setValue("scryfall");
      d.setDisabled(true);
    });
    this.sectionTitle(el, t("settings_section_prices"));
    this.sectionDesc(el, t("settings_prices_desc"));
    const tcgSection = el.createDiv({ cls: "col-settings-sub" });
    const cmSection = el.createDiv({ cls: "col-settings-sub" });
    const updateVisibility = (source) => {
      tcgSection.toggleClass("col-settings-sub-active", source === "tcgplayer");
      cmSection.toggleClass("col-settings-sub-active", source === "cardmarket");
    };
    new import_obsidian8.Setting(el).setName(t("settings_provider")).addDropdown((d) => {
      d.addOption("scryfall-usd", t("settings_price_scryfall_usd"));
      d.addOption("scryfall-eur", t("settings_price_scryfall_eur"));
      d.addOption("tcgplayer", t("settings_price_tcgplayer"));
      d.addOption("cardmarket", t("settings_price_cardmarket"));
      d.setValue(this.plugin.settings.priceSource);
      updateVisibility(this.plugin.settings.priceSource);
      d.onChange(async (v) => {
        this.plugin.settings.priceSource = v;
        await this.plugin.saveSettings();
        updateVisibility(v);
      });
    });
    this.sectionTitle(tcgSection, t("settings_section_tcgplayer"));
    this.sectionDesc(tcgSection, t("settings_tcgplayer_desc"));
    new import_obsidian8.Setting(tcgSection).setName(t("settings_tcgplayer_key")).setDesc(t("settings_tcgplayer_key_desc")).addText(
      (tx) => tx.setPlaceholder(t("settings_tcgplayer_ph")).setValue(this.plugin.settings.tcgplayerKey).onChange(async (v) => {
        this.plugin.settings.tcgplayerKey = v.trim();
        await this.plugin.saveSettings();
      })
    );
    this.sectionTitle(cmSection, t("settings_section_cardmarket"));
    this.sectionDesc(cmSection, t("settings_cardmarket_desc"));
    for (const [key, labelKey, phKey] of [
      ["cardmarketAppToken", "settings_cm_app_token", "settings_cm_app_token"],
      ["cardmarketAppSecret", "settings_cm_app_secret", "settings_cm_app_secret"],
      ["cardmarketAccessToken", "settings_cm_access_token", "settings_cm_access_token"],
      ["cardmarketAccessSecret", "settings_cm_access_secret", "settings_cm_access_secret"]
    ]) {
      new import_obsidian8.Setting(cmSection).setName(t(labelKey)).addText(
        (tx) => tx.setPlaceholder(t(phKey)).setValue(this.plugin.settings[key]).onChange(async (v) => {
          this.plugin.settings[key] = v.trim();
          await this.plugin.saveSettings();
        })
      );
    }
  }
  // ── Pokémon ───────────────────────────────────────────────────────────────────
  buildPokemon(el) {
    if (!this.plugin.settings.enabledGames) {
      this.plugin.settings.enabledGames = { mtg: true, pokemon: true, onepiece: true, yugioh: true };
    }
    this.sectionTitle(el, "\u26A1  Pok\xE9mon");
    new import_obsidian8.Setting(el).setName(t("settings_enable_game", { game: "Pok\xE9mon" })).setDesc(t("settings_enable_game_desc")).addToggle(
      (tx) => {
        var _a;
        return tx.setValue((_a = this.plugin.settings.enabledGames["pokemon"]) != null ? _a : true).onChange(async (v) => {
          this.plugin.settings.enabledGames["pokemon"] = v;
          await this.plugin.saveSettings();
        });
      }
    );
    this.sectionTitle(el, t("settings_section_prices"));
    this.sectionDesc(el, t("settings_pokemon_price_source_desc"));
    new import_obsidian8.Setting(el).setName(t("settings_pokemon_price_source")).addDropdown((d) => {
      var _a;
      d.addOption("tcgplayer", t("settings_pokemon_tcgplayer"));
      d.addOption("cardmarket", t("settings_pokemon_cardmarket"));
      d.setValue((_a = this.plugin.settings.pokemonPriceSource) != null ? _a : "tcgplayer");
      d.onChange(async (v) => {
        this.plugin.settings.pokemonPriceSource = v;
        await this.plugin.saveSettings();
      });
    });
    const sponsorDiv = el.createDiv({ cls: "col-settings-sponsor" });
    sponsorDiv.createEl("span", { text: t("settings_pokemon_sponsor_desc") + " " });
    sponsorDiv.createEl("a", {
      text: t("settings_pokemon_sponsor"),
      href: "https://github.com/tcgdex/cards-database#sponsors-"
    });
  }
  // ── Coming soon ───────────────────────────────────────────────────────────────
  buildComingSoon(el, game, icon, label) {
    if (!this.plugin.settings.enabledGames) {
      this.plugin.settings.enabledGames = { mtg: true, pokemon: true, onepiece: true, yugioh: true };
    }
    this.sectionTitle(el, `${icon}  ${label}`);
    new import_obsidian8.Setting(el).setName(t("settings_enable_game", { game: label })).setDesc(t("settings_enable_game_desc")).addToggle(
      (tx) => {
        var _a;
        return tx.setValue((_a = this.plugin.settings.enabledGames[game]) != null ? _a : true).onChange(async (v) => {
          this.plugin.settings.enabledGames[game] = v;
          await this.plugin.saveSettings();
        });
      }
    );
    this.sectionTitle(el, t("settings_section_card_data"));
    const cardBox = el.createDiv({ cls: "col-settings-coming-soon" });
    cardBox.createEl("span", { cls: "col-settings-coming-soon-icon", text: "\u{1F6A7}" });
    cardBox.createEl("span", { text: t("settings_no_card_data", { game: label }) });
    this.sectionTitle(el, t("settings_section_prices"));
    const priceBox = el.createDiv({ cls: "col-settings-coming-soon" });
    priceBox.createEl("span", { cls: "col-settings-coming-soon-icon", text: "\u{1F6A7}" });
    priceBox.createEl("span", { text: t("settings_no_price_data", { game: label }) });
  }
};

// src/PriceService.ts
var import_obsidian9 = require("obsidian");
var providerCache = /* @__PURE__ */ new Map();
function cacheKey(set, number) {
  return `${set.toLowerCase()}#${number}`;
}
var POKEMON_CACHE_PATH = ".obsidian/plugins/collectors-plugin/pokemon-price-cache.json";
var POKEMON_SUFFIXES = ["_n", "_r", "_h", "_fe"];
var TTL_MS = 24 * 60 * 60 * 1e3;
var pokemonCache = /* @__PURE__ */ new Map();
var PriceService = class {
  constructor(settings) {
    this.vault = null;
    this.settings = settings;
  }
  setVault(vault) {
    this.vault = vault;
  }
  updateSettings(settings) {
    const prevSource = this.effectiveSource();
    const prevPokemonSource = this.settings.pokemonPriceSource;
    this.settings = settings;
    if (this.effectiveSource() !== prevSource) {
      providerCache.clear();
    }
    if (this.settings.pokemonPriceSource !== prevPokemonSource) {
      pokemonCache.clear();
    }
  }
  /** Currency symbol for the active source */
  currency() {
    const src = this.effectiveSource();
    return src === "scryfall-eur" || src === "cardmarket" ? "\u20AC" : "$";
  }
  /** Source label for display in UI */
  sourceLabel() {
    const labels = {
      "scryfall-usd": "Scryfall \xB7 USD",
      "scryfall-eur": "Scryfall \xB7 EUR",
      "tcgplayer": "TCGPlayer",
      "cardmarket": "Cardmarket"
    };
    return labels[this.effectiveSource()];
  }
  /** Whether this card has any price in the cache (provider or Scryfall fallback) */
  isCached(set, number) {
    const key = cacheKey(set, number);
    const src = this.effectiveSource();
    if (src === "tcgplayer" || src === "cardmarket") {
      return providerCache.has(key) || isScryfallCached(set, number);
    }
    return isScryfallCached(set, number);
  }
  /**
   * Returns price for a card.
   * - `undefined` → not yet fetched (show "…")
   * - `null`      → fetched but no price available (show "—")
   * - `number`    → actual price
   */
  getPrice(set, number, isFoil) {
    const key = cacheKey(set, number);
    const src = this.effectiveSource();
    if (src === "tcgplayer" || src === "cardmarket") {
      if (providerCache.has(key)) {
        const e = providerCache.get(key);
        return isFoil ? e.foil : e.normal;
      }
      const d2 = getScryfallData(set, number);
      if (d2) return isFoil ? d2.usd_foil : d2.usd;
      return void 0;
    }
    const d = getScryfallData(set, number);
    if (!d) return void 0;
    if (src === "scryfall-eur") return isFoil ? d.eur_foil : d.eur;
    return isFoil ? d.usd_foil : d.usd;
  }
  /**
   * Fetch prices for a list of cards.
   * Always calls Scryfall first (for fallback + external IDs), then the provider if configured.
   */
  async fetchPrices(identifiers, onRateLimit) {
    await fetchScryfallData(identifiers, onRateLimit);
    const src = this.effectiveSource();
    if (src === "tcgplayer") {
      await this.fetchTCGPlayerPrices(identifiers);
    } else if (src === "cardmarket") {
      await this.fetchCardmarketPrices(identifiers);
    }
  }
  // ── Pokémon price methods ──────────────────────────────────────────────────
  pokemonCurrency() {
    return this.settings.pokemonPriceSource === "cardmarket" ? "\u20AC" : "$";
  }
  pokemonSourceLabel() {
    return this.settings.pokemonPriceSource === "cardmarket" ? "Cardmarket \xB7 EUR" : "TCGPlayer \xB7 USD";
  }
  isPokemonCached(setId, localId) {
    const base = `${setId.toLowerCase()}#${localId}`;
    return POKEMON_SUFFIXES.some((s) => pokemonCache.has(`${base}${s}`));
  }
  getPokemonPrice(setId, localId, suffix) {
    var _a;
    const key = `${setId.toLowerCase()}#${localId}${suffix}`;
    if (!pokemonCache.has(key)) return void 0;
    return (_a = pokemonCache.get(key)) != null ? _a : null;
  }
  async fetchPokemonPrices(cardIds) {
    const baseIds = [...new Set(cardIds.map((id) => id.replace(/_[nrhf]e?$/, "")))];
    const uncached = baseIds.filter((id) => {
      const parts = id.match(/^(.+)-([^-]+)$/);
      if (!parts) return false;
      return !this.isPokemonCached(parts[1], parts[2]);
    });
    if (uncached.length === 0) return;
    const source = this.settings.pokemonPriceSource;
    const now = Date.now();
    for (const baseId of uncached) {
      const card = await fetchPokemonCard(baseId);
      if (!card) continue;
      const setId = card.set.id.toLowerCase();
      const localId = card.localId;
      for (const suffix of POKEMON_SUFFIXES) {
        const price = source === "cardmarket" ? getCardmarketPrice(card, suffix) : getTCGPlayerPrice(card, suffix);
        const key = `${setId}#${localId}${suffix}`;
        pokemonCache.set(key, price);
      }
    }
    this.savePokemonCache(source, now).catch(() => {
    });
  }
  async loadPokemonCache() {
    if (!this.vault) return;
    try {
      const exists = await this.vault.adapter.exists(POKEMON_CACHE_PATH);
      if (!exists) return;
      const raw = await this.vault.adapter.read(POKEMON_CACHE_PATH);
      const data = JSON.parse(raw);
      const now = Date.now();
      const src = this.settings.pokemonPriceSource;
      for (const [key, entry] of Object.entries(data)) {
        if (entry.source !== src) continue;
        if (now - entry.fetchedAt > TTL_MS) continue;
        pokemonCache.set(key, entry.price);
      }
    } catch (e) {
    }
  }
  async savePokemonCache(source, fetchedAt) {
    if (!this.vault) return;
    const data = {};
    for (const [key, price] of pokemonCache) {
      data[key] = { price, fetchedAt, source };
    }
    await this.vault.adapter.write(POKEMON_CACHE_PATH, JSON.stringify(data));
  }
  // ── Effective source (respects fallback rules) ─────────────────────────────
  effectiveSource() {
    var _a;
    const src = (_a = this.settings.priceSource) != null ? _a : "scryfall-usd";
    if (src === "tcgplayer" && !this.settings.tcgplayerKey) return "scryfall-usd";
    if (src === "cardmarket" && !this.hasCardmarketCreds()) return "scryfall-usd";
    return src;
  }
  hasCardmarketCreds() {
    const s = this.settings;
    return !!(s.cardmarketAppToken && s.cardmarketAppSecret && s.cardmarketAccessToken && s.cardmarketAccessSecret);
  }
  // ── TCGPlayer ──────────────────────────────────────────────────────────────
  async fetchTCGPlayerPrices(identifiers) {
    const pending = [];
    for (const id of identifiers) {
      const key = cacheKey(id.set, id.collector_number);
      if (providerCache.has(key)) continue;
      const d = getScryfallData(id.set, id.collector_number);
      if (d == null ? void 0 : d.tcgplayer_id) pending.push({ key, tcgId: d.tcgplayer_id });
    }
    if (pending.length === 0) return;
    const idToKeys = /* @__PURE__ */ new Map();
    for (const { key, tcgId } of pending) {
      if (!idToKeys.has(tcgId)) idToKeys.set(tcgId, []);
      idToKeys.get(tcgId).push(key);
    }
    const uniqueIds = [...idToKeys.keys()];
    for (let i = 0; i < uniqueIds.length; i += 250) {
      const batch = uniqueIds.slice(i, i + 250);
      try {
        const res = await (0, import_obsidian9.requestUrl)({
          url: `https://api.tcgplayer.com/v1.39.0/pricing/product/${batch.join(",")}`,
          headers: {
            Authorization: `Bearer ${this.settings.tcgplayerKey}`,
            Accept: "application/json"
          }
        });
        if (res.status < 200 || res.status >= 300) continue;
        const data = res.json;
        const priceMap = /* @__PURE__ */ new Map();
        for (const r of data.results) {
          if (!priceMap.has(r.productId)) priceMap.set(r.productId, { normal: null, foil: null });
          const e = priceMap.get(r.productId);
          if (r.subTypeName === "Foil") e.foil = r.marketPrice;
          else e.normal = r.marketPrice;
        }
        for (const [tcgId, keys] of idToKeys) {
          const e = priceMap.get(tcgId);
          if (e) keys.forEach((k) => providerCache.set(k, e));
        }
      } catch (e) {
      }
    }
  }
  // ── Cardmarket (OAuth 1.0a) ────────────────────────────────────────────────
  async fetchCardmarketPrices(identifiers) {
    const cmIdToKeys = /* @__PURE__ */ new Map();
    for (const id of identifiers) {
      const key = cacheKey(id.set, id.collector_number);
      if (providerCache.has(key)) continue;
      const d = getScryfallData(id.set, id.collector_number);
      if (!(d == null ? void 0 : d.cardmarket_id)) continue;
      if (!cmIdToKeys.has(d.cardmarket_id)) cmIdToKeys.set(d.cardmarket_id, []);
      cmIdToKeys.get(d.cardmarket_id).push(key);
    }
    if (cmIdToKeys.size === 0) return;
    const {
      cardmarketAppToken,
      cardmarketAppSecret,
      cardmarketAccessToken,
      cardmarketAccessSecret
    } = this.settings;
    const entries = [...cmIdToKeys.entries()];
    const CONCURRENCY = 5;
    for (let i = 0; i < entries.length; i += CONCURRENCY) {
      const batch = entries.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async ([cmId, keys]) => {
        var _a, _b, _c, _d;
        const url = `https://api.cardmarket.com/ws/v2.0/products/${cmId}`;
        try {
          const auth = await buildOAuth1Header(
            "GET",
            url,
            cardmarketAppToken,
            cardmarketAppSecret,
            cardmarketAccessToken,
            cardmarketAccessSecret
          );
          const res = await (0, import_obsidian9.requestUrl)({ url, headers: { Authorization: auth, Accept: "application/json" } });
          if (res.status < 200 || res.status >= 300) return;
          const data = res.json;
          const pg = data.product.priceGuide;
          const entry = {
            normal: (_b = (_a = pg.TREND) != null ? _a : pg.SELL) != null ? _b : null,
            foil: (_d = (_c = pg.FOIL_TREND) != null ? _c : pg.FOIL_SELL) != null ? _d : null
          };
          keys.forEach((k) => providerCache.set(k, entry));
        } catch (e) {
        }
      }));
      if (i + CONCURRENCY < entries.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }
};
async function hmacSha1(key, message) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
function pct(s) {
  return encodeURIComponent(s).replace(/!/g, "%21").replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\*/g, "%2A");
}
async function buildOAuth1Header(method, url, appToken, appSecret, accessToken, accessSecret) {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, "0")).join("");
  const ts = String(Math.floor(Date.now() / 1e3));
  const params = [
    ["oauth_consumer_key", appToken],
    ["oauth_nonce", nonce],
    ["oauth_signature_method", "HMAC-SHA1"],
    ["oauth_timestamp", ts],
    ["oauth_token", accessToken],
    ["oauth_version", "1.0"]
  ];
  const normParams = [...params].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${pct(k)}=${pct(v)}`).join("&");
  const base = [method.toUpperCase(), pct(url), pct(normParams)].join("&");
  const sigKey = `${pct(appSecret)}&${pct(accessSecret)}`;
  const signature = await hmacSha1(sigKey, base);
  return "OAuth " + [...params, ["oauth_signature", signature]].map(([k, v]) => `${pct(k)}="${pct(v)}"`).join(", ");
}

// src/main.ts
var COLLECTORS_ICON = "collectors-card";
var CollectorsPlugin = class extends import_obsidian10.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    (0, import_obsidian10.addIcon)(COLLECTORS_ICON, `
      <rect x="14" y="4" width="72" height="92" rx="7" ry="7" fill="none" stroke="currentColor" stroke-width="6"/>
      <rect x="22" y="12" width="56" height="40" rx="3" fill="currentColor" opacity="0.25"/>
      <line x1="22" y1="62" x2="78" y2="62" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
      <line x1="22" y1="75" x2="78" y2="75" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
      <line x1="22" y1="88" x2="58" y2="88" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
    `);
    await this.loadSettings();
    this.priceService = new PriceService(this.settings);
    this.priceService.setVault(this.app.vault);
    await this.priceService.loadPokemonCache();
    this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, this));
    this.registerView(COLLECTION_VIEW_TYPE, (leaf) => new CollectionView(leaf, this));
    this.registerExtensions(["collection"], COLLECTION_VIEW_TYPE);
    this.addRibbonIcon(COLLECTORS_ICON, t("ribbon_dashboard"), () => this.activateDashboard());
    this.addCommand({
      id: "open-dashboard",
      name: t("cmd_open_dashboard"),
      callback: () => this.activateDashboard()
    });
    this.addCommand({
      id: "new-collection",
      name: t("cmd_new_collection"),
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
    this.priceService.updateSettings(this.settings);
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
