// server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const PRODUCTS_FILE = path.join(__dirname, 'products.json');

let products = [];

// Load products
async function loadProducts() {
  try {
    const data = await fs.readFile(PRODUCTS_FILE, 'utf8');
    products = JSON.parse(data);
  } catch (err) {
    console.error("No existing products.json, starting fresh");
    products = [];
  }
}

// Save products
async function saveProducts() {
  try {
    await fs.writeFile(PRODUCTS_FILE, JSON.stringify(products, null, 2));
  } catch (err) {
    console.error("Failed to save products:", err);
  }
}

// --- API ROUTES ---

// Get products
app.get('/products', (req, res) => {
  res.json(products);
});

// Add product
app.post('/products', async (req, res) => {
  products.push(req.body);
  await saveProducts();
  res.json({ success: true, products });
});

// Auto AI update (demo mode)
app.post('/auto-update', async (req, res) => {
  try {
    const newProducts = [
      {
        title: "Smart Air Purifier",
        id: "air-001",
        image: "https://via.placeholder.com/150",
        category: "Air",
        description: "Cleans your room air efficiently",
        buy_link: "https://example.com/air-purifier",
        mode: "affiliate"
      },
      {
        title: "Memory Foam Pillow",
        id: "sleep-001",
        image: "https://via.placeholder.com/150",
        category: "Sleep",
        description: "Comfortable pillow for better rest",
        buy_link: "https://example.com/pillow",
        mode: "direct"
      }
    ];

    products = newProducts; // overwrite with demo products
    await saveProducts();
    res.json({ success: true, products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Auto-update failed' });
  }
});

// Analytics (basic)
app.get('/analytics', (req, res) => {
  res.json({ stats: {}, clicks: [] });
});

// Start server
loadProducts().then(() => {
  app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
});
