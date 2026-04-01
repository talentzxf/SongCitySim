const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bodyParser = require('body-parser');
const cors = require('cors');
const Database = require('better-sqlite3');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));

const ROOT = path.join(__dirname, '..', '..');
const DB_PATH = path.join(ROOT, 'meta_data.db');
const PUBLIC_DIR = path.join(ROOT, 'public', 'resource', 'meta_data');

if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

// static serve
app.use('/resource/meta_data', express.static(PUBLIC_DIR));

// open DB
const db = new Database(DB_PATH, { verbose: console.log });

// simple endpoints
app.get('/api/meta/categories', (req, res) => {
  res.json(['buildings','professions','crops','names','texts','time_phases','economy','iron_tools']);
});

app.get('/api/meta/buildings', (req, res) => {
  const rows = db.prepare('SELECT id, label, description, raw_json FROM buildings').all();
  res.json(rows.map(r => ({ id: r.id, label: r.label, description: r.description, raw: JSON.parse(r.raw_json) })))
});

app.get('/api/meta/crops', (req, res) => {
  const rows = db.prepare('SELECT id, label, price, fertility_weight, description, raw_json FROM crops').all();
  res.json(rows.map(r => ({ id: r.id, label: r.label, price: r.price, fertilityWeight: r.fertility_weight, description: r.description, raw: JSON.parse(r.raw_json) })))
});

// upload files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const { category, item } = req.body;
    const dest = path.join(PUBLIC_DIR, category || 'misc', item || 'general');
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: function (req, file, cb) {
    // overwrite if same name
    cb(null, file.originalname);
  }
});
const upload = multer({ storage });

app.post('/api/upload', upload.single('file'), (req, res) => {
  const { category, item } = req.body;
  const fileUrl = `/resource/meta_data/${category || 'misc'}/${item || 'general'}/${req.file.originalname}`;
  res.json({ url: fileUrl });
});

// change log
app.get('/api/meta/log', (req, res) => {
  const rows = db.prepare('SELECT id, action, key, ts FROM change_log ORDER BY id DESC LIMIT 100').all();
  res.json(rows);
});

// export DB
app.get('/api/export/sqlite', (req, res) => {
  res.download(DB_PATH, 'meta_data.db');
});

// Start server
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`meta_data_config server listening on ${port}`);
});
