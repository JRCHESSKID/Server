import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

/* =======================
   CORS
   ======================= */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: "8mb" }));

/* =======================
   DATA FILE
   ======================= */
const DATA_FILE = path.join(process.cwd(), "orion_data.json");

/* =======================
   ADMIN RULES
   ======================= */
const ADMIN_PASS = "Asasitwesambo";
const SUPER_ADMINS = ["JRCHESSKID"];
const TEAM_ADMINS = ["JuniorCosmicLeague", "RoyalCelestialNova"];
const ALL_ADMINS = [...SUPER_ADMINS, ...TEAM_ADMINS];

/* =======================
   TOKEN RULES / ECONOMY
   ======================= */
// 8,000,000 gems = 500 tokens
const GEMS_PER_TOKEN_CHUNK = 8_000_000;
const TOKENS_PER_CHUNK = 500;

const CHEST_COST_TOKENS = 500; // per chest

// ✅ NERF: lower jackpot max
const CHEST_GEMS_JACKPOT_MAX = 25_000_000;

/* =======================
   PET CONVERSION DEFAULTS (NERFED)
   ======================= */
const HUGE_CONVERT_GEMS_DEFAULT = 8_000_000;
const TITANIC_CONVERT_GEMS_DEFAULT = 250_000_000;

/* =======================
   MULTI OPEN BEHAVIOR
   ======================= */
const MULTI_BATCH_SIZE = 100;         // opens 100 at a time
const MAX_MULTI_OPEN_TOTAL = 50_000;  // safety cap

/* =======================
   DEFAULT CHEST REWARDS (NERFED)
   ======================= */
function defaultChestRewards() {
  return [
    // Tokens (more common)
    { id: "TOK_500", icon: "🍥", name: "500 Cosmic Tokens", type: "tokens", amount: 500, chancePct: 28.0 },
    { id: "TOK_1000", icon: "🍥", name: "1000 Cosmic Tokens", type: "tokens", amount: 1000, chancePct: 16.0 },
    { id: "TOK_1500", icon: "🍥", name: "1500 Cosmic Tokens", type: "tokens", amount: 1500, chancePct: 8.0 },

    // Gems (nerfed)
    { id: "G_500K", icon: "💎", name: "500,000 Gems", type: "gems", amount: 500_000, chancePct: 20.0 },
    { id: "G_1M", icon: "💎", name: "1,000,000 Gems", type: "gems", amount: 1_000_000, chancePct: 14.0 },
    { id: "G_2M", icon: "💎", name: "2,000,000 Gems", type: "gems", amount: 2_000_000, chancePct: 8.0 },
    { id: "G_5M", icon: "💎", name: "5,000,000 Gems", type: "gems", amount: 5_000_000, chancePct: 3.0 },
    { id: "G_10M", icon: "💎", name: "10,000,000 Gems", type: "gems", amount: 10_000_000, chancePct: 1.0 },
    { id: "G_25M", icon: "💎", name: "JACKPOT 25,000,000 Gems", type: "gems", amount: 25_000_000, chancePct: 0.15 },

    // Huge + Titanic (nerfed hard)
    { id: "HUGE", icon: "🔥", name: "Huge", type: "huge", amount: 1, chancePct: 0.12 },
    { id: "TITANIC", icon: "🛸👑", name: "Titanic", type: "titanic", amount: 1, chancePct: 0.005 }
  ];
}

/* =======================
   DATA SCHEMA
   ======================= */
function defaultData() {
  return {
    users: {}, // username -> user obj
    requests: [],
    tx: [],
    posts: [],
    comments: {},

    interest: { rate: 0 },

    redeem: { codes: [] },
    redeemedByUser: {},

    // ✅ HALL OF FAME (HOF)
    hof: {
      slots: [
        { name: "Dev #1", image: "" },
        { name: "Dev #2", image: "" },
        { name: "Dev #3", image: "" },
        { name: "Dev #4", image: "" },
        { name: "Dev #5", image: "" }
      ],
      depositBox: { username: "—", note: "—", image: "" }
    },

    chest: {
      costTokens: CHEST_COST_TOKENS,
      jackpotMaxGems: CHEST_GEMS_JACKPOT_MAX,
      rewards: defaultChestRewards(),
      petValues: {
        hugeToGems: HUGE_CONVERT_GEMS_DEFAULT,
        titanicToGems: TITANIC_CONVERT_GEMS_DEFAULT
      },
      boosts: {
        active: false,
        expiresAt: 0,
        globalMultiplier: 1,
        hugeChanceBonus: 0,
        titanicChanceBonus: 0,
        tokenBonus: 0
      }
    },

    chestFeed: {},

    events: {
      mode: "coming_soon",
      countdownEndsAt: 0,
      broadcast: {
        type: "coming_soon", // coming_soon | admin | winner
        admin: "",
        avatarDataUrl: "",
        text: "⚫ COMING SOON",
        time: Date.now()
      },
      engine: {
        enabled: false,
        title: "Orion Events",
        theme: "orion",
        liveChatEnabled: true
      },
      guessGame: {
        active: false,
        roundId: "",
        min: 1,
        max: 100,
        answer: 0,
        startsAt: 0,
        endsAt: 0,
        durationSeconds: 120,
        maxGuessesPerUser: 3,
        guessesByUser: {},
        winner: null,
        roundLog: [],
        points: {}
      }
    }
  };
}

function safeWriteJson(file, obj) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const d = defaultData();
      safeWriteJson(DATA_FILE, d);
      return d;
    }

    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");
    const base = defaultData();

    // merge base + saved
    const d = Object.assign(base, parsed);

    d.redeem = d.redeem || { codes: [] };
    d.redeem.codes = Array.isArray(d.redeem.codes) ? d.redeem.codes : [];

    d.chest = d.chest || base.chest;

    // keep saved rewards if present, else defaults
    d.chest.rewards =
      Array.isArray(d.chest.rewards) && d.chest.rewards.length
        ? d.chest.rewards
        : defaultChestRewards();

    // ensure pet values exist
    d.chest.petValues = d.chest.petValues || base.chest.petValues;

    // ensure boosts exist
    d.chest.boosts = d.chest.boosts || base.chest.boosts;
    if (typeof d.chest.boosts.titanicChanceBonus !== "number") d.chest.boosts.titanicChanceBonus = 0;

    d.chestFeed = d.chestFeed || {};
    d.interest = d.interest || { rate: 0 };

    d.events = d.events || base.events;
    d.events.engine = d.events.engine || base.events.engine;
    d.events.broadcast = d.events.broadcast || base.events.broadcast;
    d.events.guessGame = d.events.guessGame || base.events.guessGame;

    d.comments = d.comments || {};
    d.posts = Array.isArray(d.posts) ? d.posts : [];
    d.requests = Array.isArray(d.requests) ? d.requests : [];
    d.tx = Array.isArray(d.tx) ? d.tx : [];
    d.users = d.users && typeof d.users === "object" ? d.users : {};

    // ✅ ensure HOF exists for old DB files
    d.hof = d.hof || {
      slots: [
        { name: "Dev #1", image: "" },
        { name: "Dev #2", image: "" },
        { name: "Dev #3", image: "" },
        { name: "Dev #4", image: "" },
        { name: "Dev #5", image: "" }
      ],
      depositBox: { username: "—", note: "—", image: "" }
    };
    d.hof.slots = Array.isArray(d.hof.slots) ? d.hof.slots : [];
    while (d.hof.slots.length < 5) d.hof.slots.push({ name: "Dev", image: "" });
    d.hof.slots = d.hof.slots.slice(0, 5);
    d.hof.depositBox = d.hof.depositBox || { username: "—", note: "—", image: "" };

    // ensure inventory exists for all users
    for (const [, u] of Object.entries(d.users)) {
      u.roles = u.roles || { adminLevel: "none", betaTester: false, earlyAccess: false };
      if (!Number.isFinite(Number(u.tokens))) u.tokens = 0;
      if (!Number.isFinite(Number(u.balance))) u.balance = 0;
      u.inventory = u.inventory || { pets: [] };
      u.inventory.pets = Array.isArray(u.inventory.pets) ? u.inventory.pets : [];
    }

    return d;
  } catch (e) {
    console.log("⚠️ Data load failed, resetting:", e.message);
    const d = defaultData();
    safeWriteJson(DATA_FILE, d);
    return d;
  }
}

let db = loadData();
function saveData() {
  safeWriteJson(DATA_FILE, db);
}

/* =======================
   IN-MEMORY SESSION TOKENS
   ======================= */
const tokens = {}; // token -> username

/* =======================
   HELPERS
   ======================= */
function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

function clampInt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.floor(x));
}

function roleFromBalance(b) {
  b = Number(b) || 0;
  if (b >= 70000000000) return "Celestial";
  if (b >= 20000000000) return "Cosmic";
  if (b >= 2000000000) return "Master";
  if (b >= 250000000) return "Boss";
  if (b >= 50000000) return "Elite";
  if (b >= 1000000) return "Grinder";
  return "Starter";
}

function now() {
  return Date.now();
}

function ensureInventory(userObj) {
  userObj.inventory = userObj.inventory || { pets: [] };
  userObj.inventory.pets = Array.isArray(userObj.inventory.pets) ? userObj.inventory.pets : [];
}

function ensureUser(username, password, adminLevel = "none") {
  if (!db.users[username]) {
    db.users[username] = {
      id: 10000 + Math.floor(Math.random() * 90000),
      password,
      balance: 0,
      tokens: 0,
      avatarDataUrl: "",
      createdAt: Date.now(),
      roles: {
        adminLevel,
        betaTester: false,
        earlyAccess: false
      },
      inventory: { pets: [] }
    };
  } else {
    db.users[username].roles = db.users[username].roles || {};
    if (!db.users[username].roles.adminLevel) db.users[username].roles.adminLevel = adminLevel;
    if (typeof db.users[username].roles.betaTester !== "boolean") db.users[username].roles.betaTester = false;
    if (typeof db.users[username].roles.earlyAccess !== "boolean") db.users[username].roles.earlyAccess = false;
    if (!Number.isFinite(Number(db.users[username].tokens))) db.users[username].tokens = 0;

    ensureInventory(db.users[username]);
  }
}

function ensureDefaultAdmins() {
  SUPER_ADMINS.forEach((u) => ensureUser(u, ADMIN_PASS, "super"));
  TEAM_ADMINS.forEach((u) => ensureUser(u, ADMIN_PASS, "team"));
  saveData();
  console.log("✅ Default admins ensured:", ALL_ADMINS.join(", "));
}
ensureDefaultAdmins();

function getAdminLevel(username) {
  const u = db.users[username];
  return u?.roles?.adminLevel || "none";
}

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.replace("Bearer ", "");
  const username = tokens[token];

  if (!username || !db.users[username]) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.username = username;
  req.user = db.users[username];

  const lvl = getAdminLevel(username);
  req.adminLevel = lvl;
  req.isAdmin = lvl === "team" || lvl === "super";
  req.isSuper = lvl === "super";

  next();
}

function requireAdmin(req, res, next) {
  if (!req.isAdmin) return res.status(403).json({ error: "Admin only" });
  next();
}
function requireSuper(req, res, next) {
  if (!req.isSuper) return res.status(403).json({ error: "Super admin only" });
  next();
}

/* =======================
   CHEST RNG + BOOSTS
   ======================= */
function getActiveChestBoost() {
  const b = db.chest?.boosts;
  if (!b || !b.active) return null;
  if (b.expiresAt && now() > b.expiresAt) {
    db.chest.boosts = {
      active: false,
      expiresAt: 0,
      globalMultiplier: 1,
      hugeChanceBonus: 0,
      titanicChanceBonus: 0,
      tokenBonus: 0
    };
    saveData();
    return null;
  }
  return b;
}

function toWeighted(rewards, boost) {
  const list = rewards.map((r) => ({
    ...r,
    type: String(r.type || "").toLowerCase(),
    weight: Math.max(0, Number(r.chancePct) || 0)
  }));

  if (boost && boost.hugeChanceBonus) {
    const huge = list.find((x) => x.type === "huge");
    if (huge) huge.weight += Math.max(0, Number(boost.hugeChanceBonus) || 0);
  }

  if (boost && boost.titanicChanceBonus) {
    const t = list.find((x) => x.type === "titanic");
    if (t) t.weight += Math.max(0, Number(boost.titanicChanceBonus) || 0);
  }

  const sum = list.reduce((a, x) => a + x.weight, 0);
  if (sum <= 0) list.forEach((x) => (x.weight = 1));
  return list;
}

function pickReward(rewards, boost) {
  const list = toWeighted(rewards, boost);
  const total = list.reduce((a, x) => a + x.weight, 0);
  let roll = Math.random() * total;
  for (const r of list) {
    roll -= r.weight;
    if (roll <= 0) return r;
  }
  return list[list.length - 1];
}

function clampTokensToChunk(amount) {
  let amt = clampInt(amount);
  if (amt <= 0) return 0;
  return Math.max(TOKENS_PER_CHUNK, Math.floor(amt / TOKENS_PER_CHUNK) * TOKENS_PER_CHUNK);
}

function applyReward(baseReward, boost) {
  const out = { ...baseReward };

  const mult = boost ? Number(boost.globalMultiplier) || 1 : 1;
  const tokenBonus = boost ? Number(boost.tokenBonus) || 0 : 0;

  if (out.type === "gems") {
    let amt = clampInt(out.amount);
    amt = clampInt(amt * mult);
    amt = Math.min(amt, db.chest?.jackpotMaxGems || CHEST_GEMS_JACKPOT_MAX);
    out.amount = amt;
  }

  if (out.type === "tokens") {
    let amt = clampInt(out.amount);
    amt = clampInt(amt * mult) + clampInt(tokenBonus);
    out.amount = clampTokensToChunk(amt);
  }

  return out;
}

function addPetToInventory(username, petType, displayName) {
  const u = db.users[username];
  if (!u) return null;
  ensureInventory(u);

  const item = {
    id: "PET_" + crypto.randomBytes(7).toString("hex"),
    type: petType, // "huge" | "titanic"
    name: displayName,
    status: "stored", // stored | claimed | converted
    createdAt: now()
  };

  u.inventory.pets.unshift(item);
  u.inventory.pets = u.inventory.pets.slice(0, 200);
  return item;
}

/* =======================
   ROOT / HEALTH
   ======================= */
app.get("/", (req, res) => {
  res.send("✅ Orion Bank Backend is online. Try /api/health");
});
app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: now(), port: PORT });
});

/* =======================
   HALL OF FAME (HOF)
   ======================= */
// Public read
app.get("/api/hof/state", (req, res) => {
  db.hof = db.hof || defaultData().hof;

  db.hof.slots = Array.isArray(db.hof.slots) ? db.hof.slots : [];
  while (db.hof.slots.length < 5) db.hof.slots.push({ name: "Dev", image: "" });
  db.hof.slots = db.hof.slots.slice(0, 5);
  db.hof.depositBox = db.hof.depositBox || { username: "—", note: "—", image: "" };

  res.json({ ok: true, hof: db.hof });
});

// Admin update slot
app.post("/api/admin/hof/update-slot", auth, requireAdmin, (req, res) => {
  const slot = Number(req.body.slot);
  const name = String(req.body.name || "").trim();
  const imageDataUrl = String(req.body.imageDataUrl || "");

  if (!Number.isFinite(slot) || slot < 1 || slot > 5) {
    return res.status(400).json({ error: "slot must be 1..5" });
  }
  if (imageDataUrl && imageDataUrl.length > 1_800_000) {
    return res.status(400).json({ error: "Image too large" });
  }

  db.hof = db.hof || defaultData().hof;
  db.hof.slots = Array.isArray(db.hof.slots) ? db.hof.slots : [];
  while (db.hof.slots.length < 5) db.hof.slots.push({ name: "Dev", image: "" });

  const idx = slot - 1;
  const cur = db.hof.slots[idx] || { name: "Dev", image: "" };

  if (name) cur.name = name;
  if (imageDataUrl) cur.image = imageDataUrl;

  db.hof.slots[idx] = cur;
  db.hof.slots = db.hof.slots.slice(0, 5);

  saveData();
  res.json({ ok: true, hof: db.hof });
});

// Admin update deposit box
app.post("/api/admin/hof/update-deposit", auth, requireAdmin, (req, res) => {
  const username = String(req.body.username || "").trim();
  const note = String(req.body.note || "").trim();
  const imageDataUrl = String(req.body.imageDataUrl || "");

  if (imageDataUrl && imageDataUrl.length > 1_800_000) {
    return res.status(400).json({ error: "Image too large" });
  }

  db.hof = db.hof || defaultData().hof;
  db.hof.depositBox = db.hof.depositBox || { username: "—", note: "—", image: "" };

  if (username) db.hof.depositBox.username = username;
  if (note) db.hof.depositBox.note = note;
  if (imageDataUrl) db.hof.depositBox.image = imageDataUrl;

  saveData();
  res.json({ ok: true, hof: db.hof });
});

/* =======================
   AUTH
   ======================= */
app.post("/api/register", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  if (!username || !password) return res.status(400).json({ error: "Missing fields" });
  if (db.users[username]) return res.status(400).json({ error: "User already exists" });

  db.users[username] = {
    id: 10000 + Math.floor(Math.random() * 90000),
    password,
    balance: 0,
    tokens: 0,
    avatarDataUrl: "",
    createdAt: now(),
    roles: { adminLevel: "none", betaTester: false, earlyAccess: false },
    inventory: { pets: [] }
  };

  saveData();
  res.json({ ok: true });
});

app.post("/api/login", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  const user = db.users[username];
  if (!user || user.password !== password) {
    return res.status(400).json({ error: "Invalid credentials" });
  }

  const token = makeToken();
  tokens[token] = username;

  const lvl = getAdminLevel(username);
  res.json({ token, isAdmin: lvl === "team" || lvl === "super", adminLevel: lvl });
});

app.post("/api/logout", auth, (req, res) => {
  for (const t of Object.keys(tokens)) {
    if (tokens[t] === req.username) delete tokens[t];
  }
  res.json({ ok: true });
});

/* =======================
   FRONTEND COMPAT ROUTES
   ======================= */
app.get("/api/me", auth, (req, res) => {
  res.json({
    user: {
      username: req.username,
      id: req.user.id,
      balance: req.user.balance || 0,
      tokens: req.user.tokens || 0,
      avatarDataUrl: req.user.avatarDataUrl || "",
      role: roleFromBalance(req.user.balance || 0),
      roles: req.user.roles || { adminLevel: "none", betaTester: false, earlyAccess: false },
      isAdmin: req.isAdmin
    }
  });
});

app.get("/api/tx", auth, (req, res) => {
  res.json({ tx: db.tx || [] });
});

app.get("/api/requests", auth, (req, res) => {
  res.json({ requests: db.requests || [] });
});

app.get("/api/state", auth, (req, res) => {
  ensureInventory(req.user);

  res.json({
    user: {
      username: req.username,
      id: req.user.id,
      balance: req.user.balance || 0,
      tokens: req.user.tokens || 0,
      avatarDataUrl: req.user.avatarDataUrl || "",
      role: roleFromBalance(req.user.balance || 0),
      roles: req.user.roles || { adminLevel: "none", betaTester: false, earlyAccess: false }
    },
    requests: db.requests || [],
    tx: db.tx || [],
    inventory: { pets: req.user.inventory.pets || [] }
  });
});

/* =======================
   LEADERBOARD (compat)
   ======================= */
app.get("/api/leaderboard", (req, res) => {
  const list = Object.entries(db.users).map(([username, u]) => ({
    username,
    id: u.id,
    balance: u.balance || 0,
    tokens: u.tokens || 0,
    role: roleFromBalance(u.balance || 0),
    avatarDataUrl: u.avatarDataUrl || "",
    roles: u.roles || { adminLevel: "none", betaTester: false, earlyAccess: false }
  }));
  list.sort((a, b) => b.balance - a.balance);
  res.json({ list, leaderboard: list });
});

/* =======================
   REQUESTS
   ======================= */
app.post("/api/request", auth, (req, res) => {
  const type = String(req.body.type || "");
  const amount = clampInt(req.body.amount);

  if (!["deposit", "withdraw"].includes(type)) return res.status(400).json({ error: "Invalid type" });
  if (amount <= 0) return res.status(400).json({ error: "Invalid amount" });

  db.requests = db.requests || [];
  db.requests.unshift({
    id: "REQ" + crypto.randomBytes(6).toString("hex"),
    type,
    user: req.username,
    amount,
    status: "pending",
    time: now(),
    handledBy: "",
    handledAt: 0
  });

  saveData();
  res.json({ ok: true });
});

app.post("/api/admin/request/:id/approve", auth, requireAdmin, (req, res) => {
  const id = req.params.id;
  const r = (db.requests || []).find((x) => x.id === id);
  if (!r) return res.status(404).json({ error: "Not found" });
  if (r.status !== "pending") return res.status(400).json({ error: "Already handled" });

  const u = db.users[r.user];
  if (!u) return res.status(400).json({ error: "User missing" });

  if (r.type === "deposit") {
    u.balance = (u.balance || 0) + (r.amount || 0);
  } else {
    if ((u.balance || 0) < (r.amount || 0)) return res.status(400).json({ error: "User has insufficient balance" });
    u.balance = (u.balance || 0) - (r.amount || 0);
  }

  r.status = "approved";
  r.handledBy = req.username;
  r.handledAt = now();

  db.tx = db.tx || [];
  db.tx.unshift({
    kind: r.type === "deposit" ? "deposit_approved" : "withdraw_approved",
    from: r.user,
    to: "bank",
    amount: r.amount,
    time: now()
  });

  saveData();
  res.json({ ok: true });
});

app.post("/api/admin/request/:id/decline", auth, requireAdmin, (req, res) => {
  const id = req.params.id;
  const r = (db.requests || []).find((x) => x.id === id);
  if (!r) return res.status(404).json({ error: "Not found" });
  if (r.status !== "pending") return res.status(400).json({ error: "Already handled" });

  r.status = "declined";
  r.handledBy = req.username;
  r.handledAt = now();

  saveData();
  res.json({ ok: true });
});

/* =======================
   SEND GEMS
   ======================= */
app.post("/api/send", auth, (req, res) => {
  const to = String(req.body.to || "").trim();
  const amount = clampInt(req.body.amount);

  if (!to) return res.status(400).json({ error: "Missing recipient" });
  if (!db.users[to]) return res.status(400).json({ error: "User not found" });
  if (amount <= 0) return res.status(400).json({ error: "Invalid amount" });
  if ((req.user.balance || 0) < amount) return res.status(400).json({ error: "Not enough balance" });

  req.user.balance = (req.user.balance || 0) - amount;
  db.users[to].balance = (db.users[to].balance || 0) + amount;

  db.tx = db.tx || [];
  db.tx.unshift({ kind: "send", from: req.username, to, amount, time: now() });

  saveData();
  res.json({ ok: true });
});

/* =======================
   AVATAR
   ======================= */
app.post("/api/avatar", auth, (req, res) => {
  const s = String(req.body.avatarDataUrl || "");
  if (s.length > 1_500_000) return res.status(400).json({ error: "Avatar too large. Use a smaller image." });
  req.user.avatarDataUrl = s;
  saveData();
  res.json({ ok: true });
});

/* =======================
   CONVERT GEMS -> TOKENS
   ======================= */
app.post("/api/convert", auth, (req, res) => {
  const gems = clampInt(req.body.gems);
  if (gems <= 0) return res.status(400).json({ error: "Invalid amount" });

  const chunks = Math.floor(gems / GEMS_PER_TOKEN_CHUNK);
  const tokensOut = chunks * TOKENS_PER_CHUNK;
  const gemsUsed = chunks * GEMS_PER_TOKEN_CHUNK;

  if (tokensOut <= 0) {
    return res
      .status(400)
      .json({ error: `Minimum convert is ${GEMS_PER_TOKEN_CHUNK.toLocaleString()} gems for ${TOKENS_PER_CHUNK} 🍥` });
  }

  if ((req.user.balance || 0) < gemsUsed) {
    return res.status(400).json({ error: "Not enough gems to convert" });
  }

  req.user.balance = (req.user.balance || 0) - gemsUsed;
  req.user.tokens = (req.user.tokens || 0) + tokensOut;

  db.tx = db.tx || [];
  db.tx.unshift({
    kind: "convert",
    from: req.username,
    to: "tokens",
    amount: gemsUsed,
    time: now(),
    meta: { tokensOut }
  });

  saveData();
  res.json({ ok: true, gemsUsed, tokensOut, newBalance: req.user.balance, newTokens: req.user.tokens });
});

/* =======================
   INVENTORY API
   ======================= */
app.get("/api/inventory", auth, (req, res) => {
  ensureInventory(req.user);
  res.json({ ok: true, pets: req.user.inventory.pets || [] });
});

app.post("/api/inventory/claim", auth, (req, res) => {
  const id = String(req.body.id || "").trim();
  if (!id) return res.status(400).json({ error: "Missing id" });

  ensureInventory(req.user);
  const it = (req.user.inventory.pets || []).find((x) => x.id === id);
  if (!it) return res.status(404).json({ error: "Not found" });
  if (it.status !== "stored") return res.status(400).json({ error: "Already handled" });

  it.status = "claimed";
  it.handledAt = now();

  db.tx = db.tx || [];
  db.tx.unshift({
    kind: "pet_claim",
    from: req.username,
    to: "inventory",
    amount: 1,
    time: now(),
    meta: { petType: it.type, petName: it.name, petId: it.id }
  });

  saveData();
  res.json({ ok: true, item: it });
});

app.post("/api/inventory/convert", auth, (req, res) => {
  // ✅ Supports BOTH:
  // A) { id }  (old)
  // B) { type, count } (new - no ids)

  const id = String(req.body.id || "").trim();
  const typeRaw = String(req.body.type || "").trim().toLowerCase();
  const countRaw = Number(req.body.count);

  ensureInventory(req.user);

  const vals = db.chest?.petValues || {
    hugeToGems: HUGE_CONVERT_GEMS_DEFAULT,
    titanicToGems: TITANIC_CONVERT_GEMS_DEFAULT
  };

  const payoutFor = (t) => {
    if (t === "titanic") return clampInt(vals.titanicToGems);
    if (t === "huge") return clampInt(vals.hugeToGems);
    return 0;
  };

  // -------------------------
  // MODE A: convert by ID
  // -------------------------
  if (id) {
    const it = (req.user.inventory.pets || []).find((x) => x.id === id);
    if (!it) return res.status(404).json({ error: "Not found" });
    if (it.status !== "stored") return res.status(400).json({ error: "Already handled" });

    const payout = payoutFor(String(it.type || "").toLowerCase());
    if (payout <= 0) return res.status(400).json({ error: "Conversion value not set" });

    req.user.balance = (req.user.balance || 0) + payout;

    it.status = "converted";
    it.handledAt = now();
    it.convertedTo = "gems";
    it.convertedAmount = payout;

    db.tx = db.tx || [];
    db.tx.unshift({
      kind: "pet_convert",
      from: req.username,
      to: "gems",
      amount: payout,
      time: now(),
      meta: { petType: it.type, petName: it.name, petId: it.id }
    });

    saveData();
    return res.json({ ok: true, mode: "id", payout, newBalance: req.user.balance, item: it });
  }

  // -------------------------
  // MODE B: convert by TYPE + COUNT (NO IDs)
  // -------------------------
  if (!["huge", "titanic"].includes(typeRaw)) {
    return res.status(400).json({ error: "Missing type (huge/titanic) or id" });
  }

  const count = Math.floor(countRaw);
  if (!Number.isFinite(count) || count <= 0) {
    return res.status(400).json({ error: "Missing/invalid count" });
  }

  const stored = (req.user.inventory.pets || []).filter(
    (p) => String(p.type || "").toLowerCase() === typeRaw && String(p.status || "").toLowerCase() === "stored"
  );

  if (stored.length <= 0) {
    return res.status(400).json({ error: `No stored ${typeRaw} pets to convert` });
  }

  const n = Math.min(count, stored.length);
  const payoutEach = payoutFor(typeRaw);
  if (payoutEach <= 0) return res.status(400).json({ error: "Conversion value not set" });

  let total = 0;
  let converted = 0;

  for (let i = 0; i < n; i++) {
    const it = stored[i];
    it.status = "converted";
    it.handledAt = now();
    it.convertedTo = "gems";
    it.convertedAmount = payoutEach;

    total += payoutEach;
    converted += 1;

    db.tx = db.tx || [];
    db.tx.unshift({
      kind: "pet_convert",
      from: req.username,
      to: "gems",
      amount: payoutEach,
      time: now(),
      meta: { petType: it.type, petName: it.name, petId: it.id }
    });
  }

  req.user.balance = (req.user.balance || 0) + total;

  saveData();
  return res.json({
    ok: true,
    mode: "type_count",
    type: typeRaw,
    converted,
    payoutEach,
    total,
    newBalance: req.user.balance
  });
});
app.post("/api/inventory/convert-many", auth, (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
  if (!ids.length) return res.status(400).json({ error: "Missing ids" });

  ensureInventory(req.user);

  const vals = db.chest?.petValues || {
    hugeToGems: HUGE_CONVERT_GEMS_DEFAULT,
    titanicToGems: TITANIC_CONVERT_GEMS_DEFAULT
  };

  let total = 0;
  let converted = 0;

  for (const id of ids) {
    const it = (req.user.inventory.pets || []).find((x) => x.id === id);
    if (!it) continue;
    if (it.status !== "stored") continue;

    const payout =
      it.type === "titanic" ? clampInt(vals.titanicToGems) :
      it.type === "huge" ? clampInt(vals.hugeToGems) : 0;

    if (payout <= 0) continue;

    it.status = "converted";
    it.handledAt = now();
    it.convertedTo = "gems";
    it.convertedAmount = payout;

    total += payout;
    converted += 1;

    db.tx = db.tx || [];
    db.tx.unshift({
      kind: "pet_convert",
      from: req.username,
      to: "gems",
      amount: payout,
      time: now(),
      meta: { petType: it.type, petName: it.name, petId: it.id }
    });
  }

  if (converted <= 0) return res.status(400).json({ error: "No valid pets to convert" });

  req.user.balance = (req.user.balance || 0) + total;
  saveData();

  res.json({ ok: true, converted, total, newBalance: req.user.balance });
});

/* =======================
   CHEST STATE
   ======================= */
app.get("/api/chest/state", auth, (req, res) => {
  const boost = getActiveChestBoost();

  const rewards = (db.chest?.rewards || defaultChestRewards()).map((r) => ({
    icon: r.icon,
    name: r.name,
    type: r.type,
    amount: r.amount,
    chancePct: r.chancePct,
    desc:
      String(r.type).toLowerCase() === "gems"
        ? `Up to ${(db.chest?.jackpotMaxGems || CHEST_GEMS_JACKPOT_MAX).toLocaleString()} gems`
        : String(r.type).toLowerCase() === "tokens"
        ? "Cosmic token reward"
        : String(r.type).toLowerCase() === "huge"
        ? "Ultra rare!"
        : String(r.type).toLowerCase() === "titanic"
        ? "MYTHIC ultra rare!"
        : "Reward"
  }));

  res.json({
    chest: {
      costTokens: db.chest?.costTokens || CHEST_COST_TOKENS,
      jackpotMaxGems: db.chest?.jackpotMaxGems || CHEST_GEMS_JACKPOT_MAX,
      rewards,
      petValues: db.chest?.petValues || { hugeToGems: HUGE_CONVERT_GEMS_DEFAULT, titanicToGems: TITANIC_CONVERT_GEMS_DEFAULT },
      boosts: boost
        ? {
            active: true,
            expiresAt: boost.expiresAt || 0,
            globalMultiplier: boost.globalMultiplier || 1,
            hugeChanceBonus: boost.hugeChanceBonus || 0,
            titanicChanceBonus: boost.titanicChanceBonus || 0,
            tokenBonus: boost.tokenBonus || 0
          }
        : { active: false }
    }
  });
});

/* =======================
   CHEST OPEN (single)
   ======================= */
function runChestOpen(username) {
  const u = db.users[username];
  if (!u) return { ok: false, error: "User missing" };

  ensureInventory(u);

  const cost = db.chest?.costTokens || CHEST_COST_TOKENS;
  if ((u.tokens || 0) < cost) return { ok: false, error: `Not enough 🍥 tokens. Need ${cost}.` };

  u.tokens -= cost;

  const boost = getActiveChestBoost();
  const base = pickReward(db.chest?.rewards || defaultChestRewards(), boost);
  const reward = applyReward(base, boost);

  let invItem = null;

  if (reward.type === "gems") {
    u.balance = (u.balance || 0) + clampInt(reward.amount);
  } else if (reward.type === "tokens") {
    u.tokens = (u.tokens || 0) + clampInt(reward.amount);
  } else if (reward.type === "huge") {
    invItem = addPetToInventory(username, "huge", "Huge");
  } else if (reward.type === "titanic") {
    invItem = addPetToInventory(username, "titanic", "Titanic");
  }

  db.tx = db.tx || [];
  db.tx.unshift({
    kind: "chest_open",
    from: username,
    to: "chest",
    amount: cost,
    time: now(),
    meta: {
      reward: { type: reward.type, name: reward.name, amount: reward.amount, invItemId: invItem?.id || "" }
    }
  });

  db.chestFeed = db.chestFeed || {};
  db.chestFeed[username] = db.chestFeed[username] || [];
  db.chestFeed[username].unshift({
    time: now(),
    reward: { type: reward.type, name: reward.name, amount: reward.amount, icon: reward.icon }
  });
  db.chestFeed[username] = db.chestFeed[username].slice(0, 30);

  return {
    ok: true,
    reward: { type: reward.type, name: reward.name, amount: reward.amount, icon: reward.icon },
    invItem: invItem ? { id: invItem.id, type: invItem.type, name: invItem.name } : null,
    newBalance: u.balance || 0,
    newTokens: u.tokens || 0
  };
}

app.post("/api/chest/open", auth, (req, res) => {
  try {
    const out = runChestOpen(req.username);
    if (!out.ok) return res.status(400).json({ error: out.error || "Failed" });
    saveData();
    res.json(out);
  } catch (e) {
    console.error("🔥 open crashed:", e);
    res.status(500).json({ error: "Server error in open. Check backend logs." });
  }
});

/* =======================
   CHEST OPEN (multi)
   ======================= */
app.post("/api/chest/open-multi", auth, (req, res) => {
  try {
    const raw = req.body.count ?? req.body.amount ?? req.body.opens ?? req.body.n;
    let requested = clampInt(raw);

    if (requested <= 0) return res.status(400).json({ error: "count must be > 0" });
    if (requested > MAX_MULTI_OPEN_TOTAL) requested = MAX_MULTI_OPEN_TOTAL;

    const u = req.user;
    const cost = db.chest?.costTokens || CHEST_COST_TOKENS;
    if (!Number.isFinite(cost) || cost <= 0) return res.status(500).json({ error: "Chest cost misconfigured." });

    const results = [];
    let remaining = requested;
    let stoppedReason = "";

    while (remaining > 0) {
      const canAfford = Math.floor((u.tokens || 0) / cost);
      if (canAfford <= 0) {
        stoppedReason = "insufficient_tokens";
        break;
      }

      const batch = Math.min(MULTI_BATCH_SIZE, remaining, canAfford);

      for (let i = 0; i < batch; i++) {
        const out = runChestOpen(req.username);
        if (!out.ok) {
          stoppedReason = out.error || "failed";
          remaining = 0;
          break;
        }
        results.push({ reward: out.reward, invItem: out.invItem });
      }

      remaining -= batch;

      if (batch <= 0) {
        stoppedReason = "batch_zero_guard";
        break;
      }
    }

    saveData();

    res.json({
      ok: true,
      countRequested: requested,
      countOpened: results.length,
      batchSize: MULTI_BATCH_SIZE,
      stoppedReason: stoppedReason || (results.length === requested ? "" : "unknown"),
      results,
      newBalance: req.user.balance || 0,
      newTokens: req.user.tokens || 0
    });
  } catch (e) {
    console.error("🔥 open-multi crashed:", e);
    res.status(500).json({ error: "Server error in open-multi. Check backend logs." });
  }
});

/* =======================
   CHEST FEED
   ======================= */
app.get("/api/chest/feed", auth, (req, res) => {
  const all = [];
  const map = db.chestFeed || {};
  for (const [username, arr] of Object.entries(map)) {
    (arr || []).forEach((x) => {
      all.push({
        user: username,
        time: x.time,
        reward: x.reward
      });
    });
  }
  all.sort((a, b) => (b.time || 0) - (a.time || 0));

  const feed = all.slice(0, 40).map((x) => ({
    top: `@${x.user} opened a chest`,
    sub: `${x.reward?.icon || "🎁"} ${x.reward?.name || "Reward"}`,
    amt: x.reward?.amount ?? null,
    unit: x.reward?.type === "tokens" ? "🍥" : x.reward?.type === "gems" ? "💎" : ""
  }));

  res.json({ feed });
});

/* =======================
   ADMIN CHEST BOOST + CONFIG
   ======================= */
app.post("/api/admin/chest/boost", auth, requireAdmin, (req, res) => {
  const globalMultiplier = Number(req.body.globalMultiplier);
  const hugeChanceBonus = Number(req.body.hugeChanceBonus);
  const titanicChanceBonus = Number(req.body.titanicChanceBonus);
  const tokenBonus = Number(req.body.tokenBonus);
  const durationMinutes = Number(req.body.durationMinutes);

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 24 * 60) {
    return res.status(400).json({ error: "durationMinutes must be 1-1440" });
  }

  const gm = Number.isFinite(globalMultiplier) && globalMultiplier > 0 ? globalMultiplier : 1;
  const hb = Number.isFinite(hugeChanceBonus) && hugeChanceBonus >= 0 ? hugeChanceBonus : 0;
  const tcb = Number.isFinite(titanicChanceBonus) && titanicChanceBonus >= 0 ? titanicChanceBonus : 0;
  const tb = Number.isFinite(tokenBonus) && tokenBonus >= 0 ? tokenBonus : 0;

  db.chest = db.chest || defaultData().chest;
  db.chest.boosts = {
    active: true,
    expiresAt: now() + Math.floor(durationMinutes * 60 * 1000),
    globalMultiplier: gm,
    hugeChanceBonus: hb,
    titanicChanceBonus: tcb,
    tokenBonus: tb
  };

  saveData();
  res.json({ ok: true, boosts: db.chest.boosts });
});

app.post("/api/admin/chest/pet-values", auth, requireAdmin, (req, res) => {
  const hugeToGems = clampInt(req.body.hugeToGems);
  const titanicToGems = clampInt(req.body.titanicToGems);

  db.chest = db.chest || defaultData().chest;
  db.chest.petValues = db.chest.petValues || defaultData().chest.petValues;

  if (hugeToGems > 0) db.chest.petValues.hugeToGems = hugeToGems;
  if (titanicToGems > 0) db.chest.petValues.titanicToGems = titanicToGems;

  saveData();
  res.json({ ok: true, petValues: db.chest.petValues });
});

app.post("/api/admin/chest/reset-rewards", auth, requireAdmin, (req, res) => {
  db.chest = db.chest || defaultData().chest;
  db.chest.rewards = defaultChestRewards();
  db.chest.jackpotMaxGems = CHEST_GEMS_JACKPOT_MAX;
  saveData();
  res.json({ ok: true, rewards: db.chest.rewards, jackpotMaxGems: db.chest.jackpotMaxGems });
});

/* =======================
   BLOGS / POSTS
   ======================= */
function makePreview(blocks) {
  const t = (blocks || []).find((b) => b.type === "text" && (b.text || "").trim());
  const s = t ? String(t.text).trim().replace(/\s+/g, " ") : "—";
  return s.slice(0, 120) + (s.length > 120 ? "..." : "");
}

function cleanBlock(b) {
  const type = String(b.type || "");
  if (type === "image") {
    const src = String(b.src || "");
    if (src.length > 1_800_000) return { type: "text", style: "p", text: "[Image too large]" };
    return { type: "image", src };
  }
  if (type === "youtube") return { type: "youtube", url: String(b.url || "").trim() };
  return { type: "text", style: String(b.style || "p"), text: String(b.text || "") };
}

app.get("/api/posts", (req, res) => {
  const list = (db.posts || [])
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((p) => ({
      id: p.id,
      title: p.title,
      coverImage: p.coverImage || "",
      createdAt: p.createdAt,
      author: p.author,
      preview: makePreview(p.blocks || []),
      blocks: p.blocks || []
    }));
  res.json({ list, posts: list });
});

app.get("/api/posts/:id", (req, res) => {
  const p = (db.posts || []).find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  const comments = db.comments && db.comments[p.id] ? db.comments[p.id] : [];
  res.json({ post: p, comments });
});

app.post("/api/admin/posts", auth, requireAdmin, (req, res) => {
  const title = String(req.body.title || "").trim();
  const coverImage = String(req.body.coverImage || "");
  const blocks = Array.isArray(req.body.blocks) ? req.body.blocks : [];

  if (!title) return res.status(400).json({ error: "Title required" });
  if (coverImage.length > 1_800_000) return res.status(400).json({ error: "Cover image too large" });

  const post = {
    id: "POST" + crypto.randomBytes(6).toString("hex"),
    title,
    coverImage,
    createdAt: now(),
    author: req.username,
    blocks: blocks.map(cleanBlock)
  };

  db.posts = db.posts || [];
  db.posts.unshift(post);
  saveData();
  res.json({ ok: true, id: post.id });
});

app.put("/api/admin/posts/:id", auth, requireAdmin, (req, res) => {
  const p = (db.posts || []).find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });

  const title = String(req.body.title || "").trim();
  const coverImage = String(req.body.coverImage || "");
  const blocks = Array.isArray(req.body.blocks) ? req.body.blocks : [];

  if (!title) return res.status(400).json({ error: "Title required" });
  if (coverImage.length > 1_800_000) return res.status(400).json({ error: "Cover image too large" });

  p.title = title;
  p.coverImage = coverImage;
  p.blocks = blocks.map(cleanBlock);

  saveData();
  res.json({ ok: true });
});

app.delete("/api/admin/posts/:id", auth, requireAdmin, (req, res) => {
  const id = req.params.id;
  const before = (db.posts || []).length;
  db.posts = (db.posts || []).filter((p) => p.id !== id);
  if ((db.posts || []).length === before) return res.status(404).json({ error: "Not found" });

  db.comments = db.comments || {};
  delete db.comments[id];

  saveData();
  res.json({ ok: true });
});

app.post("/api/posts/:id/comment", auth, (req, res) => {
  const postId = req.params.id;
  const p = (db.posts || []).find((x) => x.id === postId);
  if (!p) return res.status(404).json({ error: "Post not found" });

  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "Empty comment" });
  if (text.length > 500) return res.status(400).json({ error: "Too long" });

  db.comments = db.comments || {};
  db.comments[postId] = db.comments[postId] || [];
  db.comments[postId].push({
    id: "C" + crypto.randomBytes(5).toString("hex"),
    user: req.username,
    text,
    time: now()
  });

  saveData();
  res.json({ ok: true });
});

/* =======================
   REDEEM CODES
   ======================= */
app.get("/api/redeem/list", (req, res) => {
  const list = (db.redeem?.codes || [])
    .filter((c) => c.enabled)
    .filter((c) => !c.expiresAt || now() < c.expiresAt)
    .filter((c) => Number(c.maxUses || 0) === 0 || Number(c.uses || 0) < Number(c.maxUses || 0))
    .map((c) => ({
      code: c.code,
      type: c.type,
      amount: c.amount,
      expiresAt: c.expiresAt || 0,
      roleLimit: c.roleLimit || "",
      createdAt: c.createdAt,
      createdBy: c.createdBy
    }));

  res.json({ list, codes: list });
});

app.post("/api/redeem", auth, (req, res) => {
  const codeRaw = String(req.body.code || "").trim();
  if (!codeRaw) return res.status(400).json({ error: "Enter a code" });

  db.redeem = db.redeem || { codes: [] };
  db.redeem.codes = db.redeem.codes || [];
  db.redeemedByUser = db.redeemedByUser || {};

  const c = db.redeem.codes.find((x) => String(x.code).toLowerCase() === codeRaw.toLowerCase());
  if (!c || !c.enabled) return res.status(400).json({ error: "Invalid or disabled code" });

  if (c.expiresAt && now() > c.expiresAt) return res.status(400).json({ error: "Code expired" });

  const maxUses = Number(c.maxUses || 0);
  const uses = Number(c.uses || 0);
  if (maxUses !== 0 && uses >= maxUses) return res.status(400).json({ error: "Code exhausted" });

  const usedMap = (db.redeemedByUser[req.username] = db.redeemedByUser[req.username] || {});
  if (usedMap[c.code]) return res.status(400).json({ error: "You already redeemed this code" });

  const roleLimit = String(c.roleLimit || "").trim();
  if (roleLimit === "beta" && !req.user.roles?.betaTester) return res.status(403).json({ error: "Beta Tester only" });
  if (roleLimit === "early" && !req.user.roles?.earlyAccess) return res.status(403).json({ error: "Early Access only" });

  const amount = clampInt(c.amount);
  if (amount <= 0) return res.status(400).json({ error: "Invalid reward" });

  if (c.type === "tokens") req.user.tokens = (req.user.tokens || 0) + amount;
  else req.user.balance = (req.user.balance || 0) + amount;

  c.uses = uses + 1;
  usedMap[c.code] = true;

  db.tx = db.tx || [];
  db.tx.unshift({
    kind: "redeem",
    from: "code",
    to: req.username,
    amount,
    time: now(),
    meta: { type: c.type, code: c.code }
  });

  saveData();
  res.json({ ok: true, type: c.type, amount });
});

app.post("/api/admin/redeem/create", auth, requireAdmin, (req, res) => {
  const code = String(req.body.code || "").trim();
  const type = String(req.body.type || "").trim(); // "tokens" | "gems"
  const amount = clampInt(req.body.amount);

  const maxUses = clampInt(req.body.maxUses);
  const expiresMinutes = clampInt(req.body.expiresMinutes);
  const roleLimit = String(req.body.roleLimit || "").trim();

  if (!code) return res.status(400).json({ error: "Code required" });
  if (!["tokens", "gems"].includes(type)) return res.status(400).json({ error: "Invalid type" });
  if (amount <= 0) return res.status(400).json({ error: "Amount must be > 0" });
  if (roleLimit && !["beta", "early"].includes(roleLimit)) return res.status(400).json({ error: "Invalid roleLimit" });

  db.redeem = db.redeem || { codes: [] };
  db.redeem.codes = db.redeem.codes || [];

  if (db.redeem.codes.find((x) => String(x.code).toLowerCase() === code.toLowerCase())) {
    return res.status(400).json({ error: "Code already exists" });
  }

  const expiresAt = expiresMinutes > 0 ? now() + expiresMinutes * 60 * 1000 : 0;

  db.redeem.codes.unshift({
    code,
    type,
    amount,
    maxUses: maxUses || 0,
    uses: 0,
    expiresAt,
    roleLimit,
    createdAt: now(),
    createdBy: req.username,
    enabled: true
  });

  saveData();
  res.json({ ok: true });
});

app.post("/api/admin/redeem/disable", auth, requireAdmin, (req, res) => {
  const code = String(req.body.code || "").trim();
  const c = (db.redeem?.codes || []).find((x) => String(x.code).toLowerCase() === code.toLowerCase());
  if (!c) return res.status(404).json({ error: "Not found" });
  c.enabled = false;
  saveData();
  res.json({ ok: true });
});

/* =======================
   ADMIN USERS
   ======================= */
app.get("/api/admin/users", auth, requireAdmin, (req, res) => {
  const list = Object.entries(db.users).map(([username, u]) => ({
    username,
    id: u.id,
    balance: u.balance || 0,
    tokens: u.tokens || 0,
    role: roleFromBalance(u.balance || 0),
    avatarDataUrl: u.avatarDataUrl || "",
    adminLevel: u.roles?.adminLevel || "none",
    betaTester: !!u.roles?.betaTester,
    earlyAccess: !!u.roles?.earlyAccess
  }));
  list.sort((a, b) => b.balance - a.balance);
  res.json({ list });
});

app.get("/api/admin/users-mini", auth, requireAdmin, (req, res) => {
  const users = Object.entries(db.users).map(([username, u]) => ({
    username,
    id: u.id,
    balance: u.balance || 0,
    tokens: u.tokens || 0,
    role: roleFromBalance(u.balance || 0),
    avatarDataUrl: u.avatarDataUrl || "",
    roles: u.roles || { adminLevel: "none", betaTester: false, earlyAccess: false }
  }));
  users.sort((a, b) => b.balance - a.balance);
  res.json({ users });
});

app.post("/api/admin/user/balance", auth, requireAdmin, (req, res) => {
  const username = String(req.body.username || "").trim();
  const amount = Number(req.body.amount);
  if (!username) return res.status(400).json({ error: "Missing username" });
  if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ error: "Invalid amount" });

  const u = db.users[username];
  if (!u) return res.status(404).json({ error: "User not found" });

  const nextBal = (Number(u.balance) || 0) + amount;
  if (nextBal < 0) return res.status(400).json({ error: "Balance cannot go below 0" });
  u.balance = Math.floor(nextBal);

  db.tx = db.tx || [];
  db.tx.unshift({ kind: "admin_adjust", from: req.username, to: username, amount: Math.floor(amount), time: now() });

  saveData();
  res.json({ ok: true, newBalance: u.balance });
});

app.post("/api/admin/user/role", auth, requireAdmin, (req, res) => {
  const username = String(req.body.username || "").trim();
  const role = String(req.body.role || "").trim();
  if (!username) return res.status(400).json({ error: "Missing username" });
  if (!["beta", "early"].includes(role)) return res.status(400).json({ error: "Invalid role" });

  const u = db.users[username];
  if (!u) return res.status(404).json({ error: "User not found" });

  u.roles = u.roles || { adminLevel: "none", betaTester: false, earlyAccess: false };
  if (role === "beta") u.roles.betaTester = true;
  if (role === "early") u.roles.earlyAccess = true;

  saveData();
  res.json({ ok: true });
});

app.post("/api/admin/interest", auth, requireAdmin, (req, res) => {
  const rate = Number(req.body.rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    return res.status(400).json({ error: "rate must be 0-100" });
  }
  db.interest = db.interest || { rate: 0 };
  db.interest.rate = rate;
  saveData();
  res.json({ ok: true, rate });
});

/* =======================
   SUPER ADMIN: WIPE
   ======================= */
app.post("/api/admin/wipe", auth, requireSuper, (req, res) => {
  const fresh = defaultData();
  fresh.users = {};
  db = fresh;
  ensureDefaultAdmins();
  saveData();
  res.json({ ok: true });
});

/* =======================
   EVENTS ENGINE
   ======================= */
app.get("/api/events/state", (req, res) => {
  const gg = db.events?.guessGame || {};
  const safeGuess = {
    active: !!gg.active,
    roundId: gg.roundId || "",
    min: gg.min,
    max: gg.max,
    startsAt: gg.startsAt || 0,
    endsAt: gg.endsAt || 0,
    maxGuessesPerUser: gg.maxGuessesPerUser || 3,
    winner: gg.winner || null,
    roundLog: Array.isArray(gg.roundLog) ? gg.roundLog.slice(-20) : []
  };

  const state = {
    mode: db.events?.mode || "coming_soon",
    countdownEndsAt: db.events?.countdownEndsAt || 0,
    title: db.events?.engine?.title || "",
    broadcast: db.events?.broadcast || { type: "coming_soon", text: "⚫ COMING SOON", time: now() },
    engine: db.events?.engine || { enabled: false },
    guessGame: safeGuess
  };

  res.json(state);
});

app.get("/api/events/points", (req, res) => {
  const pts = db.events?.guessGame?.points || {};
  const list = Object.entries(pts).map(([username, points]) => ({ username, points: Number(points) || 0 }));
  list.sort((a, b) => b.points - a.points);
  res.json({ list });
});

app.post("/api/admin/events/engine/enable", auth, requireAdmin, (req, res) => {
  db.events = db.events || defaultData().events;
  db.events.engine = db.events.engine || defaultData().events.engine;
  db.events.engine.enabled = true;
  db.events.mode = "live";
  saveData();
  res.json({ ok: true });
});

app.post("/api/admin/events/engine/disable", auth, requireAdmin, (req, res) => {
  db.events = db.events || defaultData().events;
  db.events.engine = db.events.engine || defaultData().events.engine;
  db.events.engine.enabled = false;
  db.events.mode = "coming_soon";
  saveData();
  res.json({ ok: true });
});

app.post("/api/admin/events/coming-soon", auth, requireAdmin, (req, res) => {
  db.events = db.events || defaultData().events;
  db.events.mode = "coming_soon";
  db.events.broadcast = db.events.broadcast || defaultData().events.broadcast;

  db.events.broadcast.type = "coming_soon";
  db.events.broadcast.admin = req.username;
  db.events.broadcast.avatarDataUrl = req.user?.avatarDataUrl || "";
  db.events.broadcast.text = "⚫ COMING SOON";
  db.events.broadcast.time = now();

  saveData();
  res.json({ ok: true });
});

app.post("/api/admin/events/broadcast", auth, requireAdmin, (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "Missing text" });

  db.events = db.events || defaultData().events;
  db.events.broadcast = db.events.broadcast || defaultData().events.broadcast;

  db.events.broadcast.type = "admin";
  db.events.broadcast.admin = req.username;
  db.events.broadcast.avatarDataUrl = req.user?.avatarDataUrl || "";
  db.events.broadcast.text = text;
  db.events.broadcast.time = now();

  if (db.events.engine?.enabled) db.events.mode = "live";

  saveData();
  res.json({ ok: true });
});

app.post("/api/admin/events/winner", auth, requireAdmin, (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "Missing text" });

  db.events = db.events || defaultData().events;
  db.events.broadcast = db.events.broadcast || defaultData().events.broadcast;

  db.events.broadcast.type = "winner";
  db.events.broadcast.admin = req.username;
  db.events.broadcast.avatarDataUrl = req.user?.avatarDataUrl || "";
  db.events.broadcast.text = text;
  db.events.broadcast.time = now();

  if (db.events.engine?.enabled) db.events.mode = "live";

  saveData();
  res.json({ ok: true });
});

app.post("/api/admin/events/guess/setup", auth, requireAdmin, (req, res) => {
  const min = Number(req.body.min);
  const max = Number(req.body.max);
  const maxGuessesPerUser = Number(req.body.maxGuessesPerUser);
  const durationSeconds = Number(req.body.durationSeconds);

  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    return res.status(400).json({ error: "Min must be less than Max" });
  }
  if (!Number.isFinite(maxGuessesPerUser) || maxGuessesPerUser <= 0) {
    return res.status(400).json({ error: "maxGuessesPerUser must be >= 1" });
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds < 10) {
    return res.status(400).json({ error: "durationSeconds must be >= 10" });
  }

  db.events = db.events || defaultData().events;
  db.events.guessGame = db.events.guessGame || defaultData().events.guessGame;

  db.events.guessGame.min = Math.floor(min);
  db.events.guessGame.max = Math.floor(max);
  db.events.guessGame.maxGuessesPerUser = Math.floor(maxGuessesPerUser);
  db.events.guessGame.durationSeconds = Math.floor(durationSeconds);

  saveData();
  res.json({ ok: true });
});

app.post("/api/admin/events/guess/start", auth, requireAdmin, (req, res) => {
  db.events = db.events || defaultData().events;
  db.events.guessGame = db.events.guessGame || defaultData().events.guessGame;

  const gg = db.events.guessGame;

  const min = Number(gg.min) || 1;
  const max = Number(gg.max) || 100;

  gg.active = true;
  gg.roundId = "GG_" + crypto.randomBytes(6).toString("hex");
  gg.answer = Math.floor(min + Math.random() * (max - min + 1));
  gg.startsAt = now();
  gg.endsAt = gg.startsAt + (Number(gg.durationSeconds) || 120) * 1000;
  gg.guessesByUser = {};
  gg.winner = null;
  gg.roundLog = Array.isArray(gg.roundLog) ? gg.roundLog : [];
  gg.roundLog.push({ time: now(), text: `Round started by ${req.username}` });

  if (db.events.engine?.enabled) db.events.mode = "live";

  saveData();
  res.json({ ok: true, roundId: gg.roundId, endsAt: gg.endsAt });
});

app.post("/api/admin/events/guess/end", auth, requireAdmin, (req, res) => {
  db.events = db.events || defaultData().events;
  db.events.guessGame = db.events.guessGame || defaultData().events.guessGame;

  const gg = db.events.guessGame;
  gg.active = false;
  gg.endsAt = now();
  gg.roundLog = Array.isArray(gg.roundLog) ? gg.roundLog : [];
  gg.roundLog.push({ time: now(), text: `Round ended by ${req.username}` });

  saveData();
  res.json({ ok: true });
});

/* =======================
   START SERVER
   ======================= */
app.listen(PORT, HOST, () => {
  console.log(`✅ Orion Bank API running on ${HOST}:${PORT}`);
});