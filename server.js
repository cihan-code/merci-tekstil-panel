// Merci Tekstil Paneli - Sirket Materyalleri dosya depolama API'si
// Render.com uzerinde kalici disk (persistent disk) ile calisir.
// Gerekli ortam degiskenleri (Render > Environment):
//   DATA_DIR      -> disk mount yolu, orn: /data
//   API_KEY       -> panelin gonderdigi gizli anahtar (rastgele uzun bir metin sen belirlersin)
//   CORS_ORIGIN   -> panelin yayinlandigi adres, orn: https://cihan-code.github.io
//   PORT          -> Render otomatik verir, dokunma

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const API_KEY = process.env.API_KEY || '';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const MATERIALS_DIR = path.join(DATA_DIR, 'materials');
const FOLDERS_FILE = path.join(MATERIALS_DIR, 'folders.json');
const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30 MB - kalici diskte rahat yer var

const DEFAULT_FOLDERS = [
  { slug: 'genel', label: 'Genel Belgeler', isDefault: true },
  { slug: 'uretim_formu', label: 'Üretim Formu', isDefault: true },
  { slug: 'fiyat_teklifi', label: 'Fiyat Teklifi', isDefault: true },
  { slug: 'onay_formu', label: 'Onay Formu', isDefault: true },
];

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
ensureDir(MATERIALS_DIR);

function loadFolders() {
  if (!fs.existsSync(FOLDERS_FILE)) {
    fs.writeFileSync(FOLDERS_FILE, JSON.stringify(DEFAULT_FOLDERS, null, 2));
    return DEFAULT_FOLDERS.slice();
  }
  let list;
  try { list = JSON.parse(fs.readFileSync(FOLDERS_FILE, 'utf8')); }
  catch (e) { list = DEFAULT_FOLDERS.slice(); }
  // Eski kayitlarda isDefault alani olmayabilir (kod guncellenmeden once olusmus) - varsayilan
  // klasorleri isaretleyip diske geri yazariz ki yanlislikla silinemesinler.
  const defaultSlugs = new Set(DEFAULT_FOLDERS.map(f => f.slug));
  let changed = false;
  list.forEach(f => { if (defaultSlugs.has(f.slug) && !f.isDefault) { f.isDefault = true; changed = true; } });
  if (changed) saveFolders(list);
  return list;
}
function saveFolders(list) { fs.writeFileSync(FOLDERS_FILE, JSON.stringify(list, null, 2)); }

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 60) || ('klasor_' + Date.now());
}

function folderDir(slug) { return path.join(MATERIALS_DIR, slug); }
function metaFile(slug) { return path.join(folderDir(slug), 'meta.json'); }
function filesDir(slug) { return path.join(folderDir(slug), 'files'); }

function ensureFolderOnDisk(slug) {
  ensureDir(filesDir(slug));
  if (!fs.existsSync(metaFile(slug))) fs.writeFileSync(metaFile(slug), '[]');
}
function loadMeta(slug) {
  ensureFolderOnDisk(slug);
  try { return JSON.parse(fs.readFileSync(metaFile(slug), 'utf8')); }
  catch (e) { return []; }
}
function saveMeta(slug, arr) { fs.writeFileSync(metaFile(slug), JSON.stringify(arr, null, 2)); }

function folderExists(slug) {
  return loadFolders().some(f => f.slug === slug);
}

function fixFilenameEncoding(name) {
  // multer/busboy bazen UTF-8 dosya adlarini latin1 olarak okuyor (Türkçe karakterler bozuluyor).
  // Bunu duzeltmek icin latin1 -> utf8 donusumu deneriz; basarisiz olursa orijinali kullaniriz.
  if (!name) return name;
  try {
    const fixed = Buffer.from(name, 'latin1').toString('utf8');
    // Eger donusum sonrasi "replacement character" (bozuk kod noktasi) yoksa fixed'i kullan.
    if (!fixed.includes('�')) return fixed;
  } catch (e) { /* yoksay */ }
  return name;
}
function safeOriginalName(name) {
  return String(fixFilenameEncoding(name) || 'dosya').replace(/[\/\\]/g, '_').slice(0, 200);
}

// ---- app kurulumu ----
const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '20mb' }));

function checkApiKey(req, res, next) {
  if (!API_KEY) return next(); // API_KEY ayarlanmadiysa kontrol atlanir (kurulum kolaylastirma - onerilmez)
  const key = req.header('x-api-key');
  if (key !== API_KEY) return res.status(401).json({ error: 'Yetkisiz istek (x-api-key hatali veya eksik).' });
  next();
}

app.get('/', (req, res) => {
  res.type('text/plain').send('Merci Tekstil Materyaller API calisiyor.');
});

// ---- Panel verisi (Isler, Gelir, Gider, Gorevler vs.) - tum kullanicilar ayni veriyi paylassin diye ----
const PANEL_DATA_FILE = path.join(DATA_DIR, 'panel-data.json');

app.get('/api/paneldata', checkApiKey, (req, res) => {
  if (!fs.existsSync(PANEL_DATA_FILE)) return res.json({ data: null, auth: null, updatedAt: null });
  try {
    const raw = fs.readFileSync(PANEL_DATA_FILE, 'utf8');
    res.type('application/json').send(raw);
  } catch (e) {
    res.status(500).json({ error: 'Panel verisi okunamadi.' });
  }
});

app.post('/api/paneldata', checkApiKey, (req, res) => {
  const body = req.body || {};
  if (!body.data) return res.status(400).json({ error: 'data alani gerekli.' });
  const payload = {
    data: body.data,
    auth: body.auth || null,
    updatedAt: new Date().toISOString(),
  };
  try {
    ensureDir(DATA_DIR);
    fs.writeFileSync(PANEL_DATA_FILE, JSON.stringify(payload));
    res.json({ ok: true, updatedAt: payload.updatedAt });
  } catch (e) {
    res.status(500).json({ error: 'Panel verisi kaydedilemedi.' });
  }
});

// ---- Sadece Urun Maliyet Sablonlari (Excel/Power Query gibi disaridan salt-okunur baglanti icin) ----
// Bu endpoint TUM panel verisini degil, sadece urun maliyet sablonlarindaki (Kesim/Dikim/Baski-Nakis
// vb.) sabit birim fiyatlari duz bir liste olarak dondurur. Boylece bu baglanti bilgisi (API anahtari)
// Excel dosyasinda saklansa bile sadece fiyat bilgisine erisim riski olusur, musteri/gelir/gider gibi
// hassas verilere degil.
app.get('/api/costtemplates', checkApiKey, (req, res) => {
  if (!fs.existsSync(PANEL_DATA_FILE)) return res.json([]);
  try {
    const raw = JSON.parse(fs.readFileSync(PANEL_DATA_FILE, 'utf8'));
    const products = (raw.data && raw.data.costTemplates && raw.data.costTemplates.products) || [];
    const rows = [];
    products.forEach(p => {
      (p.items || []).forEach(it => {
        rows.push({ urun: p.name, kategori: it.category, fiyat: it.amount });
      });
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Maliyet sablonlari okunamadi.' });
  }
});

// Klasor listesi
app.get('/api/folders', checkApiKey, (req, res) => {
  const folders = loadFolders();
  const withCounts = folders.map(f => ({ ...f, fileCount: loadMeta(f.slug).length }));
  res.json(withCounts);
});

// Yeni klasor olustur
app.post('/api/folders', checkApiKey, (req, res) => {
  const label = (req.body && req.body.label || '').trim();
  if (!label) return res.status(400).json({ error: 'Klasor adi gerekli.' });
  const folders = loadFolders();
  let slug = slugify(label);
  let n = 1;
  const existingSlugs = new Set(folders.map(f => f.slug));
  while (existingSlugs.has(slug)) { slug = slugify(label) + '_' + (++n); }
  folders.push({ slug, label, isDefault: false });
  saveFolders(folders);
  ensureFolderOnDisk(slug);
  res.json({ slug, label, isDefault: false, fileCount: 0 });
});

// Klasoru sil (varsayilan klasorler silinemez, icindeki tum dosyalar da silinir)
app.delete('/api/folders/:folder', checkApiKey, (req, res) => {
  const slug = req.params.folder;
  const folders = loadFolders();
  const target = folders.find(f => f.slug === slug);
  if (!target) return res.status(404).json({ error: 'Klasor bulunamadi.' });
  if (target.isDefault) return res.status(400).json({ error: 'Varsayilan klasorler silinemez.' });
  const dir = folderDir(slug);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  saveFolders(folders.filter(f => f.slug !== slug));
  res.json({ ok: true });
});

// Bir klasordeki dosyalari listele
app.get('/api/materials/:folder', checkApiKey, (req, res) => {
  const slug = req.params.folder;
  if (!folderExists(slug)) return res.status(404).json({ error: 'Klasor bulunamadi.' });
  res.json(loadMeta(slug));
});

// Dosya yukleme
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const slug = req.params.folder;
      if (!folderExists(slug)) return cb(new Error('Klasor bulunamadi.'));
      ensureFolderOnDisk(slug);
      cb(null, filesDir(slug));
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').slice(0, 10);
      cb(null, Date.now() + '_' + crypto.randomBytes(6).toString('hex') + ext);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE },
});

app.post('/api/materials/:folder/upload', checkApiKey, (req, res) => {
  const slug = req.params.folder;
  if (!folderExists(slug)) return res.status(404).json({ error: 'Klasor bulunamadi.' });
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Yukleme basarisiz.' });
    if (!req.file) return res.status(400).json({ error: 'Dosya bulunamadi.' });
    const entry = {
      id: path.parse(req.file.filename).name,
      storedName: req.file.filename,
      name: safeOriginalName(req.file.originalname),
      mime: req.file.mimetype || 'application/octet-stream',
      size: req.file.size,
      kind: 'upload',
      date: new Date().toISOString(),
    };
    const meta = loadMeta(slug);
    meta.unshift(entry);
    saveMeta(slug, meta);
    res.json(entry);
  });
});

// Belge Olusturucu'dan gelen HTML belgeyi kaydet (Uretim/Onay/Fiyat Teklifi)
app.post('/api/materials/:folder/generated', checkApiKey, (req, res) => {
  const slug = req.params.folder;
  if (!folderExists(slug)) return res.status(404).json({ error: 'Klasor bulunamadi.' });
  const { name, html } = req.body || {};
  if (!html) return res.status(400).json({ error: 'html alani gerekli.' });
  ensureFolderOnDisk(slug);
  const storedName = Date.now() + '_' + crypto.randomBytes(6).toString('hex') + '.html';
  fs.writeFileSync(path.join(filesDir(slug), storedName), html, 'utf8');
  const size = Buffer.byteLength(html, 'utf8');
  const entry = {
    id: path.parse(storedName).name,
    storedName,
    name: safeOriginalName(name || 'Belge'),
    mime: 'text/html',
    size,
    kind: 'generated',
    date: new Date().toISOString(),
  };
  const meta = loadMeta(slug);
  meta.unshift(entry);
  saveMeta(slug, meta);
  res.json(entry);
});

// Dosyayi indir / goruntule
app.get('/api/materials/:folder/:id/download', checkApiKey, (req, res) => {
  const slug = req.params.folder;
  if (!folderExists(slug)) return res.status(404).json({ error: 'Klasor bulunamadi.' });
  const meta = loadMeta(slug);
  const entry = meta.find(m => m.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Dosya bulunamadi.' });
  const filePath = path.join(filesDir(slug), entry.storedName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Dosya diskte bulunamadi.' });
  res.setHeader('Content-Type', entry.mime || 'application/octet-stream');
  if (req.query.inline === '1') {
    res.setHeader('Content-Disposition', 'inline; filename="' + encodeURIComponent(entry.name) + '"');
  } else {
    res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(entry.name) + '"');
  }
  fs.createReadStream(filePath).pipe(res);
});

// Dosya sil
app.delete('/api/materials/:folder/:id', checkApiKey, (req, res) => {
  const slug = req.params.folder;
  if (!folderExists(slug)) return res.status(404).json({ error: 'Klasor bulunamadi.' });
  const meta = loadMeta(slug);
  const entry = meta.find(m => m.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Dosya bulunamadi.' });
  const filePath = path.join(filesDir(slug), entry.storedName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  saveMeta(slug, meta.filter(m => m.id !== req.params.id));
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Merci Tekstil Materyaller API port ' + PORT + ' uzerinde calisiyor. DATA_DIR=' + DATA_DIR));
