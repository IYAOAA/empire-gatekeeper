const cors = require("cors");
app.use(cors({
  origin: "https://1000homevibes-site.netlify.app"  // allow your Netlify site
}));

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const REPO = process.env.REPO; // e.g. "IYAOAA/1000HomeVibes"
const FILE_PATH = process.env.FILE_PATH || "products.json";
const CLICKS_FILE = "clicks.json"; // ✅ log clicks here

// --- Utility to get file from GitHub ---
async function getFile(filePath) {
  const url = `https://api.github.com/repos/${REPO}/contents/${filePath}`;
  const res = await fetch(url, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` },
  });
  if (!res.ok) throw new Error(`GitHub fetch failed: ${res.status}`);
  return res.json();
}

// --- Utility to save file to GitHub ---
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

// --- ✅ NEW: POST track ---
app.post("/track", async (req, res) => {
  try {
    const { product_id, timestamp } = req.body;
    if (!product_id) return res.status(400).json({ error: "Missing product_id" });

    // Load current clicks.json (or create empty)
    let clicks = [];
    try {
      const file = await getFile(CLICKS_FILE);
      const content = Buffer.from(file.content, "base64").toString();
      clicks = JSON.parse(content);
    } catch (e) {
      clicks = []; // if file doesn’t exist yet
    }

    // Add new click
    clicks.push({ product_id, timestamp: timestamp || Date.now() });

    // Save back to GitHub
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

app.listen(PORT, () => {
  console.log(`✅ Gatekeeper running on :${PORT}`);
});
