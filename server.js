
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(express.json({ limit: '2mb' }));

// CORS: lock this to your Netlify domain later
app.use(cors({ origin: '*' }));

// --- Environment Variables ---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER   = process.env.REPO_OWNER   || 'IYAOAA';
const REPO_NAME    = process.env.REPO_NAME    || '1000HomeVibes';
const FILE_PATH    = process.env.FILE_PATH    || 'content/products/products.json';
const BRANCH       = process.env.BRANCH       || 'main';
const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!GITHUB_TOKEN || !ADMIN_SECRET) {
  console.error('❌ Missing required env vars: GITHUB_TOKEN and ADMIN_SECRET');
}

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// Fetch current products.json
app.get('/products', async (req, res) => {
  try {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}?ref=${BRANCH}`;
    const gh = await axios.get(url, {
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'empire-gatekeeper' }
    });
    const content = Buffer.from(gh.data.content, 'base64').toString('utf8');
    res.json({ json: JSON.parse(content) });
  } catch (err) {
    console.error('GET /products error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch products.json' });
  }
});

// Update products.json
app.post('/update-products', async (req, res) => {
  try {
    const secret = req.headers['x-admin-secret'];
    if (!secret || secret !== ADMIN_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const newJson = req.body;
    if (!newJson) return res.status(400).json({ error: 'Missing body' });

    // Get current file SHA
    const getUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}?ref=${BRANCH}`;
    const current = await axios.get(getUrl, {
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'empire-gatekeeper' }
    });
    const sha = current.data.sha;

    // Commit new file
    const putUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;
    const putBody = {
      message: '🔄 Update products.json via Gatekeeper',
      content: Buffer.from(JSON.stringify(newJson, null, 2)).toString('base64'),
      sha,
      branch: BRANCH
    };

    const updated = await axios.put(putUrl, putBody, {
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'empire-gatekeeper' }
    });

    res.json({ ok: true, commit: updated.data.commit.sha });
  } catch (err) {
    console.error('POST /update-products error:', err?.response?.data || err.message);
    const code = err?.response?.status || 500;
    res.status(code).json({ error: 'Failed to update products.json', details: err?.response?.data || err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ Gatekeeper running on :${port}`));
