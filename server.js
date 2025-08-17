const cors = require("cors");
const express = require("express");
const fetch = require("node-fetch"); // make sure installed

const app = express();
app.use(express.json());
app.use(cors({
  origin: "https://1000homevibes-site.netlify.app"
}));

const PORT = process.env.PORT || 10000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const REPO = process.env.REPO; // e.g. "IYAOAA/1000HomeVibes"
const FILE_PATH = process.env.FILE_PATH || "products.json";
const CLICKS_FILE = "clicks.json";

// --- Utility: fetch file from GitHub ---
async function getFile(filePath) {
  const url = `https://api.github.com/repos/${REPO}/contents/${filePath}`;
  const res = await fetch(url, { headers: { Authorization: `token ${GITHUB_TOKEN}` } });
  if (!res.ok) throw new Error(`GitHub fetch failed: ${res.status}`);
  return res.json();
}

// --- Utility: save file to GitHub ---
async function saveFile(filePath, content, message) {
  const url = `https://api.github.com/repos/${REPO}/contents/${filePath}`;
  let sha = null;
  const res = await fetch(url, { headers: { Authorization: `token ${GITHUB_TOKEN}` } });
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
  if (!saveRes.ok) throw new Error(`GitHub save failed: ${saveRes.status}`);
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

// --- POST track (log clicks) ---
app.post("/track", async (req, res) => {
  try {
    const { product_id, timestamp } = req.body;
    if (!product_id) return res.status(400).json({ error: "Missing product_id" });

    let clicks = [];
    try {
      const file = await getFile(CLICKS_FILE);
      const content = Buffer.from(file.content, "base64").toString();
      clicks = JSON.parse(content);
    } catch (e) {
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

// --- ✅ NEW: Analytics endpoint with BI + AI-ready insights ---
app.get("/analytics", async (req, res) => {
  try {
    let clicks = [];
    try {
      const file = await getFile(CLICKS_FILE);
      const content = Buffer.from(file.content, "base64").toString();
      clicks = JSON.parse(content);
    } catch (e) {
      clicks = [];
    }

    const stats = {};
    clicks.forEach(c => {
      stats[c.product_id] = (stats[c.product_id] || 0) + 1;
    });

    // Top & worst products
    let topProduct = null, worstProduct = null;
    let max = -Infinity, min = Infinity;
    for (const [id, count] of Object.entries(stats)) {
      if (count > max) { max = count; topProduct = id; }
      if (count < min) { min = count; worstProduct = id; }
    }

    // Category totals (need products.json to map categories)
    let categories = {};
    try {
      const productFile = await getFile(FILE_PATH);
      const productContent = Buffer.from(productFile.content, "base64").toString();
      const products = JSON.parse(productContent);
      products.forEach(p => {
        if (stats[p.id]) {
          categories[p.category] = (categories[p.category] || 0) + stats[p.id];
        }
      });
    } catch (e) {
      categories = {};
    }

    // Trends: group last 7 days
    const now = Date.now();
    const last7 = clicks.filter(c => now - c.timestamp <= 7*24*60*60*1000);
    const daily = {};
    last7.forEach(c => {
      const d = new Date(c.timestamp).toISOString().split("T")[0];
      daily[d] = (daily[d] || 0) + 1;
    });

    // --- AI-ready insight placeholder ---
    const aiInsights = [
      topProduct ? `🔥 ${topProduct} is your top performer with ${max} clicks.` : "No top product yet.",
      worstProduct ? `⚠️ ${worstProduct} is underperforming with only ${min} clicks.` : "No weak product yet.",
      Object.keys(categories).length > 0 ? `📊 ${Object.entries(categories).sort((a,b)=>b[1]-a[1])[0][0]} is your strongest category.` : "No category data yet.",
      `📅 You had ${last7.length} clicks in the last 7 days.`
    ];

    res.json({
      total: clicks.length,
      stats,
      clicks,      // raw history
      categories,  // category totals
      daily,       // last 7 days trends
      insights: aiInsights
    });
  } catch (e) {
    console.error("GET /analytics error:", e);
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Gatekeeper running on :${PORT}`);
});
