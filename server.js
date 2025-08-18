// --- Imports ---
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
app.use(express.json());

// --- CORS (allow only your Netlify site) ---
app.use(
  cors({
    origin: "https://1000homevibes-site.netlify.app", // ✅ change if needed
  })
);

// --- Config ---
const PORT = process.env.PORT || 10000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REPO = process.env.REPO; // e.g. "IYAOAA/1000HomeVibes"
const FILE_PATH = process.env.FILE_PATH || "products.json";
const CLICKS_FILE = "clicks.json";

// --- Utility: GitHub Get File ---
async function getFile(filePath) {
  const url = `https://api.github.com/repos/${REPO}/contents/${filePath}`;
  const res = await fetch(url, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` },
  });
  if (!res.ok) throw new Error(`GitHub fetch failed: ${res.status}`);
  return res.json();
}

// --- Utility: GitHub Save File ---
async function saveFile(filePath, content, message) {
  const url = `https://api.github.com/repos/${REPO}/contents/${filePath}`;
  let sha = null;

  // get existing SHA if file exists
  const res = await fetch(url, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` },
  });
  if (res.ok) {
    const data = await res.json();
    sha = data.sha;
  }

  const body = {
    message,
    content: Buffer.from(content).toString("base64"),
    sha,
  };

  const saveRes = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!saveRes.ok) {
    const errorTxt = await saveRes.text();
    throw new Error(`GitHub save failed: ${saveRes.status} - ${errorTxt}`);
  }
  return saveRes.json();
}

// --- GET products.json ---
app.get("/products", async (req, res) => {
  try {
    const file = await getFile(FILE_PATH);
    const content = Buffer.from(file.content, "base64").toString();
    res.json(JSON.parse(content));
  } catch (e) {
    console.error("GET /products error:", e);
    res.status(500).json({ error: "Failed to load products" });
  }
});

// --- POST update-products ---
app.post("/update-products", async (req, res) => {
  if (req.headers["x-admin-secret"] !== ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const newContent = JSON.stringify(req.body, null, 2);
    await saveFile(FILE_PATH, newContent, "Update products.json via Admin Panel");
    res.json({ success: true });
  } catch (e) {
    console.error("POST /update-products error:", e);
    res.status(500).json({ error: "Failed to save products" });
  }
});

// --- POST track clicks ---
app.post("/track", async (req, res) => {
  try {
    const { product_id, timestamp } = req.body;
    if (!product_id) return res.status(400).json({ error: "Missing product_id" });

    let clicks = [];
    try {
      const file = await getFile(CLICKS_FILE);
      const content = Buffer.from(file.content, "base64").toString();
      clicks = JSON.parse(content);
    } catch {
      clicks = [];
    }

    clicks.push({ product_id, timestamp: timestamp || Date.now() });

    await saveFile(
      CLICKS_FILE,
      JSON.stringify(clicks, null, 2),
      `Track click for ${product_id}`
    );

    res.json({ success: true });
  } catch (e) {
    console.error("POST /track error:", e);
    res.status(500).json({ error: "Failed to track click" });
  }
});

// --- ✅ AI Auto-Update Products ---
app.post("/auto-update", async (req, res) => {
  if (req.headers["x-admin-secret"] !== ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a product curator for an Amazon affiliate website. Respond ONLY with valid JSON array. Each object must include: id, title, category (Air, Sleep, Body), image, description, buy_link (use example.com if unknown).",
          },
          { role: "user", content: "Generate 2 trending home-related products." },
        ],
        temperature: 0.7,
      }),
    });

    const data = await aiRes.json();
    let text = data.choices?.[0]?.message?.content?.trim() || "[]";

    // --- Ensure pure JSON (strip markdown) ---
    text = text.replace(/```json|```/g, "").trim();

    let newProducts = [];
    try {
      newProducts = JSON.parse(text);
    } catch (e) {
      console.error("AI JSON parse error:", e, text);
      newProducts = [];
    }

    // Load old products
    let oldProducts = [];
    try {
      const file = await getFile(FILE_PATH);
      const content = Buffer.from(file.content, "base64").toString();
      oldProducts = JSON.parse(content);
    } catch {
      oldProducts = [];
    }

    const merged = [...oldProducts, ...newProducts];

    await saveFile(
      FILE_PATH,
      JSON.stringify(merged, null, 2),
      "AI Auto-Update products.json"
    );

    res.json({ success: true, products: merged });
  } catch (e) {
    console.error("POST /auto-update error:", e);
    res.status(500).json({ error: "Failed AI auto-update" });
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`✅ Gatekeeper running on :${PORT}`);
});
