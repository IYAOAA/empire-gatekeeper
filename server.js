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
const REPO_NAME = "EverlastingMemories";
const FILE_PATH = "data/products.json";
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

// --- POST product ---
app.post("/products", async (req, res) => {
  if (req.headers["x-admin-secret"] !== ADMIN_SECRET) return res.status(403).json({ error: "Forbidden" });
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

// --- ✅ AI Auto-Update ---
app.post("/auto-update", async (req, res) => {
  if (req.headers["x-admin-secret"] !== ADMIN_SECRET) return res.status(403).json({ error: "Forbidden" });
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
            content: `You are a product curator. Return EXACTLY 2 home-related products in a JSON array. 
Each product must include id, title, category, image, description, buy_link. 
Output ONLY raw JSON array.`
          },
          { role: "user", content: "Generate 2 trending home products now." },
        ],
        temperature: 0.3,
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
          image: "https://via.placeholder.com/300x200?text=Air+Purifier",
          description: "High-efficiency HEPA filter removes 99% of airborne particles.",
          buy_link: "https://example.com/demo-air"
        },
        {
          id: "demo-sleep-1",
          title: "Cooling Gel Memory Foam Pillow",
          category: "Sleep",
          image: "https://via.placeholder.com/300x200?text=Gel+Pillow",
          description: "Keeps you cool and comfortable throughout the night.",
          buy_link: "https://example.com/demo-sleep"
        }
      ];
    }

    // Merge with old products
    let oldProducts = [];
    try {
      const file = await getFile(FILE_PATH);
      oldProducts = JSON.parse(Buffer.from(file.content, "base64").toString());
    } catch {}
    const merged = [...oldProducts, ...newProducts];

    await saveFile(FILE_PATH, JSON.stringify(merged, null, 2), "AI Auto-Update products.json");

    res.json({ success: true, products: merged });
  } catch (e) {
    console.error("POST /auto-update error:", e);
    res.status(500).json({ error: "Failed AI auto-update" });
  }
});

app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
