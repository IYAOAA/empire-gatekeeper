import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";
import { Octokit } from "@octokit/rest";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

// --- Config ---
const PORT = process.env.PORT || 5000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = "IYAOAA";
const REPO_NAME = "1000HomeVibes";
const FILE_PATH = "data/products.json";
const CLICKS_PATH = "data/clicks.json"; // ✅ new
const ADMIN_SECRET = process.env.ADMIN_SECRET || "supersecretkey";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// --- GitHub Octokit instance ---
const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function getFile(path) {
  try {
    const res = await octokit.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path,
    });
    return res.data;
  } catch {
    return null;
  }
}

async function saveFile(path, content, message) {
  const file = await getFile(path);
  const opts = {
    owner: REPO_OWNER,
    repo: REPO_NAME,
    path,
    message,
    content: Buffer.from(content).toString("base64"),
  };
  if (file?.sha) opts.sha = file.sha;
  await octokit.repos.createOrUpdateFileContents(opts);
}

// --- GET products ---
app.get("/products", async (req, res) => {
  try {
    const file = await getFile(FILE_PATH);
    if (!file) return res.json([]);
    const data = Buffer.from(file.content, "base64").toString();
    res.json(JSON.parse(data));
  } catch (e) {
    console.error("GET /products error:", e);
    res.status(500).json({ error: "Failed to load products" });
  }
});

// --- POST single product ---
app.post("/products", async (req, res) => {
  if (req.headers["x-admin-secret"] !== ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });
  try {
    const newProduct = req.body;
    let products = [];
    try {
      const file = await getFile(FILE_PATH);
      if (file) products = JSON.parse(Buffer.from(file.content, "base64").toString());
    } catch {}
    products.push(newProduct);
    await saveFile(FILE_PATH, JSON.stringify(products, null, 2), "Added product");
    res.json({ success: true, products });
  } catch (e) {
    console.error("POST /products error:", e);
    res.status(500).json({ error: "Failed to save product" });
  }
});

// --- ✅ NEW: Update entire products list ---
app.post("/update-products", async (req, res) => {
  if (req.headers["x-admin-secret"] !== ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });

  try {
    const products = req.body;
    if (!Array.isArray(products))
      return res.status(400).json({ error: "Invalid data format" });

    await saveFile(FILE_PATH, JSON.stringify(products, null, 2), "Updated products.json");
    res.json({ success: true, products });
  } catch (e) {
    console.error("POST /update-products error:", e);
    res.status(500).json({ error: "Failed to update products" });
  }
});

// --- ✅ AI Auto-Update ---
app.post("/auto-update", async (req, res) => {
  if (req.headers["x-admin-secret"] !== ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });
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
            content: `You are a strict JSON generator. 
Return ONLY a JSON array with exactly 2 home-related products. 
Each object MUST have: id, title, category, image, description, buy_link. 
Do not include explanations, comments, or markdown fences.`,
          },
          { role: "user", content: "Generate 2 trending home products now." },
        ],
        temperature: 0.2,
      }),
    });

    const data = await aiRes.json();
    let text = data.choices?.[0]?.message?.content || "[]";

    console.log("🤖 AI raw response:", text);

    let newProducts = [];
    try {
      text = text.replace(/```json|```/g, "").trim();
      newProducts = JSON.parse(text);
    } catch (err) {
      console.error("❌ Failed to parse AI:", err, text);
      newProducts = [];
    }

    // --- 🚨 FORCE fallback if AI gave nothing ---
    if (!Array.isArray(newProducts) || newProducts.length === 0) {
      console.warn("⚠️ AI gave empty result. Using demo products.");
      newProducts = [
        {
          id: "demo-air-1",
          title: "Smart Home Air Purifier",
          category: "Air",
          image: "https://placehold.co/300x200?text=Air+Purifier",
          description: "High-efficiency HEPA filter removes 99% of airborne particles.",
          buy_link: "https://example.com/demo-air",
        },
        {
          id: "demo-sleep-1",
          title: "Cooling Gel Memory Foam Pillow",
          category: "Sleep",
          image: "https://placehold.co/300x200?text=Gel+Pillow",
          description: "Keeps you cool and comfortable throughout the night.",
          buy_link: "https://example.com/demo-sleep",
        },
      ];
    }

    // Merge with old products + safeguard duplicates
    let oldProducts = [];
    try {
      const file = await getFile(FILE_PATH);
      oldProducts = JSON.parse(Buffer.from(file.content, "base64").toString());
    } catch {}

    const ids = new Set(oldProducts.map((p) => p.id));
    const merged = [
      ...oldProducts,
      ...newProducts.filter((p) => !ids.has(p.id)),
    ];

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

// --- ✅ Analytics: Track Clicks ---
app.post("/track-click", async (req, res) => {
  try {
    const { productId, type = "click", timestamp = new Date().toISOString() } = req.body;
    if (!productId) return res.status(400).json({ error: "Missing productId" });

    let clicks = [];
    try {
      const file = await getFile(CLICKS_PATH);
      if (file) clicks = JSON.parse(Buffer.from(file.content, "base64").toString());
    } catch {}

    const newClick = { productId, type, timestamp };
    clicks.push(newClick);

    await saveFile(CLICKS_PATH, JSON.stringify(clicks, null, 2), "Recorded click");

    res.json({ success: true, click: newClick });
  } catch (e) {
    console.error("POST /track-click error:", e);
    res.status(500).json({ error: "Failed to record click" });
  }
});
// --- ✅ Analytics Endpoint ---
app.get("/analytics", async (req, res) => {
  try {
    // Load products
    let products = [];
    try {
      const file = await getFile(FILE_PATH);
      if (file) products = JSON.parse(Buffer.from(file.content, "base64").toString());
    } catch {}

    // Load clicks
    let clicks = [];
    try {
      const file = await getFile("data/clicks.json");
      if (file) clicks = JSON.parse(Buffer.from(file.content, "base64").toString());
    } catch {}

    res.json({ products, clicks });
  } catch (e) {
    console.error("GET /analytics error:", e);
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

// --- 🚦 Health Check ---
app.get("/status", (req, res) => {
  res.json({ ok: true, message: "Empire gatekeeper is strong 💪" });
});

app.listen(PORT, () =>
  console.log(`✅ Server running on http://localhost:${PORT}`)
);
