// server.js
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
const REPO_OWNER = "IYAOAA";            // your GitHub username
const REPO_NAME = "1000HomeVibes";      // your repo name
const FILE_PATH = "data/products.json";
const CLICKS_PATH = "data/clicks.json";
const WISDOM_PATH = "data/product-wisdom.json"; // ✅ new file
const ADMIN_SECRET = process.env.ADMIN_SECRET || "supersecretkey";

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
    let products = JSON.parse(data);

    // sort newest first
    products.sort((a, b) => {
      const da = new Date(b.dateAdded || b.id);
      const db = new Date(a.dateAdded || a.id);
      return da - db;
    });

    res.json(products);
  } catch (e) {
    console.error("GET /products error:", e);
    res.status(500).json({ error: "Failed to load products" });
  }
});

// --- POST new product ---
app.post("/products", async (req, res) => {
  if (req.headers["x-admin-secret"] !== ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });
  try {
    const newProduct = {
      ...req.body,
      dateAdded: Date.now(),
      image2: req.body.image2 || "",
      image3: req.body.image3 || "",
      video: req.body.video || "",
      provider: req.body.provider || "Amazon",
    };

    let products = [];
    try {
      const file = await getFile(FILE_PATH);
      if (file)
        products = JSON.parse(Buffer.from(file.content, "base64").toString());
    } catch {}

    products.push(newProduct);
    products.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));

    await saveFile(
      FILE_PATH,
      JSON.stringify(products, null, 2),
      "Added product"
    );
    res.json({ success: true, products });
  } catch (e) {
    console.error("POST /products error:", e);
    res.status(500).json({ error: "Failed to save product" });
  }
});

// --- Update all products ---
app.post("/update-products", async (req, res) => {
  if (req.headers["x-admin-secret"] !== ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });

  try {
    let products = req.body;
    if (!Array.isArray(products))
      return res.status(400).json({ error: "Invalid data format" });

    products = products.map((p) => ({
      ...p,
      image2: p.image2 || "",
      image3: p.image3 || "",
      video: p.video || "",
      provider: p.provider || "Amazon",
      dateAdded: p.dateAdded || Date.now(),
    }));

    products.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));

    await saveFile(
      FILE_PATH,
      JSON.stringify(products, null, 2),
      "Updated products.json"
    );
    res.json({ success: true, products });
  } catch (e) {
    console.error("POST /update-products error:", e);
    res.status(500).json({ error: "Failed to update products" });
  }
});

// --- Track Clicks ---
app.post("/track-click", async (req, res) => {
  try {
    const { product_id } = req.body;
    if (!product_id) return res.status(400).json({ error: "Missing product_id" });

    let clicks = [];
    try {
      const file = await getFile(CLICKS_PATH);
      if (file)
        clicks = JSON.parse(Buffer.from(file.content, "base64").toString());
    } catch {}

    clicks.push({ product_id, timestamp: Date.now() });

    await saveFile(
      CLICKS_PATH,
      JSON.stringify(clicks, null, 2),
      "Updated clicks.json"
    );

    res.json({ success: true });
  } catch (e) {
    console.error("POST /track-click error:", e);
    res.status(500).json({ error: "Failed to record click" });
  }
});

// --- Analytics ---
app.get("/analytics", async (req, res) => {
  try {
    let products = [];
    let clicks = [];

    try {
      const file = await getFile(FILE_PATH);
      if (file)
        products = JSON.parse(Buffer.from(file.content, "base64").toString());
    } catch {}

    try {
      const file = await getFile(CLICKS_PATH);
      if (file)
        clicks = JSON.parse(Buffer.from(file.content, "base64").toString());
    } catch {}

    res.json({ products, clicks });
  } catch (e) {
    console.error("GET /analytics error:", e);
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

// --- Product Wisdom ---
app.get("/product-wisdom", async (req, res) => {
  try {
    const file = await getFile(WISDOM_PATH);
    if (!file) return res.json([]);
    const data = Buffer.from(file.content, "base64").toString();
    const wisdom = JSON.parse(data || "[]");
    res.json(wisdom);
  } catch (e) {
    console.error("GET /product-wisdom error:", e);
    res.status(500).json({ error: "Failed to load product-wisdom" });
  }
});

app.post("/product-wisdom", async (req, res) => {
  if (req.headers["x-admin-secret"] !== ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });
  try {
    let wisdom = [];
    try {
      const file = await getFile(WISDOM_PATH);
      if (file)
        wisdom = JSON.parse(Buffer.from(file.content, "base64").toString());
    } catch {}

    const newItem = {
      ...req.body,
      dateAdded: Date.now(),
    };
    wisdom.push(newItem);

    await saveFile(
      WISDOM_PATH,
      JSON.stringify(wisdom, null, 2),
      "Updated product-wisdom.json"
    );

    res.json({ success: true, wisdom });
  } catch (e) {
    console.error("POST /product-wisdom error:", e);
    res.status(500).json({ error: "Failed to save product-wisdom" });
  }
});// --- Update ALL product-wisdom (from admin panel) ---
app.post("/update-product-wisdom", async (req, res) => {
  // ✅ Security: check admin secret
  if (req.headers["x-admin-secret"] !== ADMIN_SECRET)
    return res.status(403).json({ error: "Forbidden" });

  try {
    let wisdom = req.body;
    // ✅ must be an array
    if (!Array.isArray(wisdom))
      return res.status(400).json({ error: "Invalid data format" });

    // add defaults / dateAdded
    wisdom = wisdom.map((item) => ({
      ...item,
      dateAdded: item.dateAdded || Date.now(),
    }));

    // ✅ save to GitHub
    await saveFile(
      WISDOM_PATH,
      JSON.stringify(wisdom, null, 2),
      "Updated product-wisdom.json"
    );

    res.json({ success: true, wisdom });
  } catch (e) {
    console.error("POST /update-product-wisdom error:", e);
    res.status(500).json({ error: "Failed to update product-wisdom" });
  }
});

// --- Health Check ---
app.get("/status", (req, res) => {
  res.json({ ok: true, message: "Backend working 💪" });
});

app.listen(PORT, () =>
  console.log(`✅ Server running on http://localhost:${PORT}`)
);
