/**
 * SHOEPHILE Backend — MongoDB Atlas
 * Products, orders, subscribers (no local JSON / disk writes)
 * Images stored as base64 data URLs in MongoDB (Vercel-safe)
 * Customer auth: signup, login, JWT, forgot/reset password, my-orders
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'shoephile218@gmail.com';
const JWT_SECRET = process.env.JWT_SECRET || '';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://shoephile.vercel.app').replace(/\/$/, '');

if (!ADMIN_PASSWORD) {
  console.warn('⚠ ADMIN_PASSWORD is not set. Admin routes will reject all requests.');
}
if (!JWT_SECRET) {
  console.warn('⚠ JWT_SECRET is not set. Customer auth routes will reject token operations.');
}
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.warn('⚠ MONGODB_URI is not set. API will fail until it is configured.');
}

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- MongoDB connection (cached for serverless) ---------- */
let cachedClient = null;
let cachedDb = null;

async function getDb() {
  if (cachedDb) return cachedDb;
  if (!MONGODB_URI) throw new Error('MONGODB_URI environment variable is not set');
  const client = cachedClient || new MongoClient(MONGODB_URI);
  if (!cachedClient) {
    await client.connect();
    cachedClient = client;
  }
  cachedDb = client.db(process.env.MONGODB_DB || 'shoephile');
  return cachedDb;
}

async function productsCol() {
  return (await getDb()).collection('products');
}
async function ordersCol() {
  return (await getDb()).collection('orders');
}
async function subscribersCol() {
  return (await getDb()).collection('subscribers');
}
async function couponsCol() {
  return (await getDb()).collection('coupons');
}
async function reviewsCol() {
  return (await getDb()).collection('reviews');
}
async function contentCol() {
  return (await getDb()).collection('websiteContent');
}
async function usersCol() {
  const col = (await getDb()).collection('users');
  // Ensure unique index on email (safe to call repeatedly)
  try {
    await col.createIndex({ email: 1 }, { unique: true });
  } catch (_) {
    /* index may already exist */
  }
  return col;
}

/* Shipping constants — PKR */
const SHIPPING_FEE = 300;
const FREE_SHIPPING_THRESHOLD = 3000;

/* Default CMS content (used when DB has no document yet) */
const DEFAULT_HOME_CONTENT = {
  key: 'home',
  heroImage: '',
  eyebrow: "PREMIUM WOMEN'S FLATS",
  heading: 'Love Affair with Shoes',
  description:
    'Elegant, comfortable flats designed for everyday sophistication. Discover the refined collection crafted for the modern woman.',
  btn1Text: 'Shop Flats',
  btn1Url: 'shop.html',
  btn2Text: 'Explore Collection',
  btn2Url: 'shop.html?category=new',
  updatedAt: null,
};

const DEFAULT_ABOUT_CONTENT = {
  key: 'about',
  heroImage: '',
  craftLabel: 'Craftsmanship',
  craftHeading: 'Made With Intention',
  craftPara1:
    'Every SHOEPHILE piece begins with a sketch and ends with the hands of a master artisan. We partner exclusively with ateliers that share our standards for refined women\'s flats.',
  craftPara2:
    'From the selection of quality materials to the final finishing of each pair, no detail is left to chance. Limited production runs ensure that every pair receives the attention it deserves.',
  pillarsLabel: 'What We Stand For',
  pillarsHeading: 'Our Pillars',
  pillars: [
    {
      id: '1',
      title: 'Timeless Design',
      description:
        'We create silhouettes that transcend seasons. Clean lines, balanced proportions, and a refusal of fleeting trends define every collection.',
      image: '',
    },
    {
      id: '2',
      title: 'Exceptional Quality',
      description:
        'Only the finest materials make the cut. We source premium materials and work with artisans who share our uncompromising standards.',
      image: '',
    },
    {
      id: '3',
      title: 'Conscious Luxury',
      description:
        'We produce thoughtfully to minimize waste, prioritize durability over disposability, and design shoes meant to last.',
      image: '',
    },
  ],
  updatedAt: null,
};

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Admin not configured. Set ADMIN_PASSWORD in environment.' });
  }
  const key = req.headers['x-admin-key'] || req.body?.adminKey || req.query?.adminKey;
  // Accept password only (never expose ADMIN_EMAIL on client). Optional email header for future use.
  if (!key || key !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized. Invalid admin credentials.' });
  }
  next();
}

/* ---------- Customer JWT auth helpers ---------- */
function signUserToken(user) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return jwt.sign(
    { userId: user._id.toString(), email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function serializeUser(doc) {
  if (!doc) return null;
  return {
    id: doc._id.toString(),
    name: doc.name || '',
    email: doc.email || '',
    phone: doc.phone || '',
  };
}

function requireUser(req, res, next) {
  if (!JWT_SECRET) {
    return res.status(503).json({ error: 'Authentication not configured. Set JWT_SECRET.' });
  }
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: 'Unauthorized. Missing or invalid token.' });
  }
  try {
    const payload = jwt.verify(match[1], JWT_SECRET);
    if (!payload || !payload.userId) {
      return res.status(401).json({ error: 'Unauthorized. Invalid token.' });
    }
    req.user = { userId: payload.userId, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized. Invalid or expired token.' });
  }
}

/** Optional auth: attaches req.user if valid Bearer token is present; never blocks. */
function optionalUser(req, _res, next) {
  if (!JWT_SECRET) return next();
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return next();
  try {
    const payload = jwt.verify(match[1], JWT_SECRET);
    if (payload && payload.userId) {
      req.user = { userId: payload.userId, email: payload.email };
    }
  } catch {
    /* ignore invalid token for optional auth */
  }
  next();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/* Memory storage — no disk writes (Vercel-safe) */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files allowed'));
  },
});

function filesToDataUrls(files) {
  return (files || []).map((f) => {
    const b64 = f.buffer.toString('base64');
    return `data:${f.mimetype};base64,${b64}`;
  });
}

const PLACEHOLDER_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='800'%3E%3Crect fill='%23f3f1ec' width='600' height='800'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' fill='%23b8b0a4' font-family='Georgia' font-size='24'%3ESHOEPHILE%3C/text%3E%3C/svg%3E";

function serializeProduct(doc) {
  if (!doc) return null;
  return {
    id: doc.numericId != null ? doc.numericId : doc._id.toString(),
    _id: doc._id.toString(),
    name: doc.name,
    category: doc.category || 'flats',
    price: doc.price,
    oldPrice: doc.oldPrice ?? null,
    specialPrice: doc.specialPrice ?? null,
    badge: doc.badge ?? null,
    rating: doc.rating ?? 5,
    reviews: doc.reviews ?? 0,
    colors: doc.colors || [],
    sizes: doc.sizes || [36, 37, 38, 39, 40, 41],
    stock: doc.stock || {},           // { "Black": { "36": 2, "37": 5, ... }, ... }
    sku: doc.sku || '',
    featured: !!doc.featured,
    isNew: !!doc.isNew,
    isBestSeller: !!doc.isBestSeller,
    images: doc.images?.length ? doc.images : [PLACEHOLDER_IMG],
    description: doc.description || '',
    details: doc.details || '',
    material: doc.material || '',
  };
}

/* Canonical order statuses for tracking timeline */
const ORDER_STATUSES = [
  'Order Placed',
  'Confirmed',
  'Processing',
  'Packed',
  'Shipped',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
];

/* Map legacy short statuses → new labels */
function normalizeStatus(s) {
  if (!s) return 'Order Placed';
  const map = {
    pending: 'Order Placed',
    'order placed': 'Order Placed',
    confirmed: 'Confirmed',
    processing: 'Processing',
    packed: 'Packed',
    shipped: 'Shipped',
    'out for delivery': 'Out for Delivery',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    canceled: 'Cancelled',
    paid: 'Confirmed',
    unpaid: 'Order Placed',
  };
  const key = String(s).trim().toLowerCase();
  if (ORDER_STATUSES.includes(s)) return s;
  return map[key] || s;
}

function serializeOrder(doc) {
  if (!doc) return null;
  return {
    id: doc.numericId != null ? doc.numericId : doc._id.toString(),
    _id: doc._id.toString(),
    orderNumber: doc.orderNumber,
    status: normalizeStatus(doc.status),
    statusHistory: Array.isArray(doc.statusHistory) ? doc.statusHistory : [],
    createdAt: doc.createdAt,
    createdAtLocal: doc.createdAtLocal,
    updatedAt: doc.updatedAt || null,
    customer: doc.customer,
    shipping: doc.shipping,
    payment: doc.payment,
    paymentStatus: doc.paymentStatus || 'unpaid',
    items: doc.items,
    subtotal: doc.subtotal,
    discount: doc.discount || 0,
    couponCode: doc.couponCode || null,
    shippingFee: doc.shippingFee,
    total: doc.total,
    notes: doc.notes || '',
    userId: doc.userId ? doc.userId.toString() : null,
  };
}

async function nextNumericId(col, field = 'numericId') {
  const last = await col.find().sort({ [field]: -1 }).limit(1).toArray();
  if (!last.length || last[0][field] == null) return 1;
  return Number(last[0][field]) + 1;
}

function createMailer() {
  const user = process.env.SMTP_USER || CONTACT_EMAIL;
  const pass = process.env.SMTP_PASS;
  if (!pass) return null;
  return nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user,
    pass,
  },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000,
});
}

async function sendMail({ to, subject, text, html }) {
  const transporter = createMailer();
  if (!transporter) {
    console.log('[EMAIL SKIPPED — set SMTP_PASS]', { to, subject });
    return { skipped: true };
  }
  const from = process.env.SMTP_USER || CONTACT_EMAIL;
  await transporter.sendMail({ from: `"SHOEPHILE" <${from}>`, to, subject, text, html });
  return { sent: true };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------- Auth: Signup ---------- */
app.post('/api/auth/signup', async (req, res) => {
  try {
    if (!JWT_SECRET) {
      return res.status(503).json({ error: 'Authentication not configured. Set JWT_SECRET.' });
    }
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const password = String(body.password || '');
    const confirmPassword = String(body.confirmPassword || '');

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    const col = await usersCol();
    const existing = await col.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();
    const userDoc = {
      name,
      email,
      phone,
      passwordHash,
      resetTokenHash: null,
      resetTokenExpires: null,
      createdAt: now,
      updatedAt: now,
    };
    const result = await col.insertOne(userDoc);
    userDoc._id = result.insertedId;

    const token = signUserToken(userDoc);
    res.status(201).json({
      success: true,
      token,
      user: serializeUser(userDoc),
    });
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    res.status(500).json({ error: err.message || 'Could not create account' });
  }
});

/* ---------- Auth: Login ---------- */
app.post('/api/auth/login', async (req, res) => {
  try {
    if (!JWT_SECRET) {
      return res.status(503).json({ error: 'Authentication not configured. Set JWT_SECRET.' });
    }
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const col = await usersCol();
    const user = await col.findOne({ email });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signUserToken(user);
    res.json({
      success: true,
      token,
      user: serializeUser(user),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Could not log in' });
  }
});

/* ---------- Auth: Current user ---------- */
app.get('/api/auth/me', requireUser, async (req, res) => {
  try {
    const col = await usersCol();
    if (!ObjectId.isValid(req.user.userId)) {
      return res.status(401).json({ error: 'Unauthorized. Invalid token.' });
    }
    const user = await col.findOne({ _id: new ObjectId(req.user.userId) });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized. User not found.' });
    }
    res.json({ success: true, user: serializeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Could not load profile' });
  }
});

/* ---------- Auth: Logout (client should discard token) ---------- */
app.post('/api/auth/logout', (_req, res) => {
  res.json({ success: true, message: 'Logged out. Please remove the token on the client.' });
});

/* ---------- Auth: Forgot password ---------- */
app.post('/api/auth/forgot-password', async (req, res) => {
  const genericMsg = 'If an account exists for this email, a password reset link has been sent.';
  try {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const col = await usersCol();
    const user = await col.findOne({ email });

    // Always return the same response to avoid email enumeration
    if (!user) {
      return res.json({ success: true, message: genericMsg });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = hashResetToken(rawToken);
    const resetTokenExpires = new Date(Date.now() + 15 * 60 * 1000);

    await col.updateOne(
      { _id: user._id },
      {
        $set: {
          resetTokenHash,
          resetTokenExpires,
          updatedAt: new Date(),
        },
      }
    );

    const resetUrl = `${FRONTEND_URL}/reset-password.html?token=${encodeURIComponent(rawToken)}`;

    sendMail({
      to: email,
      subject: 'Reset your password — SHOEPHILE',
      text: `You requested a password reset for your SHOEPHILE account.\n\nThis link expires in 15 minutes:\n${resetUrl}\n\nIf you did not request this, please ignore this email. Your password will remain unchanged.\n\nLove Affair with Shoes\nSHOEPHILE`,
      html: `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#2A2425;">
        <h2 style="font-weight:400;letter-spacing:0.04em;">SHOEPHILE</h2>
        <p>You requested a password reset for your account.</p>
        <p style="margin:1.5em 0;">
          <a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#B97883;color:#fff;text-decoration:none;padding:12px 24px;border-radius:2px;font-size:14px;">Reset password</a>
        </p>
        <p style="font-size:0.9em;color:#7A6F6B;">This link expires in <strong>15 minutes</strong>.</p>
        <p style="font-size:0.9em;color:#7A6F6B;">If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
        <p style="margin-top:2em;font-size:0.85em;color:#7A6F6B;">Love Affair with Shoes<br>SHOEPHILE</p>
      </div>`,
    }).catch(console.error);

    res.json({ success: true, message: genericMsg });
  } catch (err) {
    console.error(err);
    // Still return generic message so callers cannot distinguish failures
    res.json({ success: true, message: genericMsg });
  }
});

/* ---------- Auth: Reset password ---------- */
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const body = req.body || {};
    const token = String(body.token || '').trim();
    const password = String(body.password || '');
    const confirmPassword = String(body.confirmPassword || '');

    if (!token) {
      return res.status(400).json({ error: 'Reset token is required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    const resetTokenHash = hashResetToken(token);
    const col = await usersCol();
    const user = await col.findOne({
      resetTokenHash,
      resetTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await col.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordHash,
          resetTokenHash: null,
          resetTokenExpires: null,
          updatedAt: new Date(),
        },
      }
    );

    res.json({ success: true, message: 'Password has been reset successfully. You can now log in.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Could not reset password' });
  }
});

/* ---------- Customer order history ---------- */
app.get('/api/my-orders', requireUser, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.user.userId)) {
      return res.status(401).json({ error: 'Unauthorized. Invalid token.' });
    }
    const col = await ordersCol();
    const docs = await col
      .find({ userId: new ObjectId(req.user.userId) })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(docs.map(serializeOrder));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Could not load orders' });
  }
});

/* ---------- Products ---------- */
app.get('/api/products', async (_req, res) => {
  try {
    const col = await productsCol();
    const docs = await col.find({}).sort({ numericId: 1 }).toArray();
    res.json(docs.map(serializeProduct));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to load products' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const col = await productsCol();
    const id = req.params.id;
    let doc = null;
    if (/^\d+$/.test(id)) {
      doc = await col.findOne({ numericId: parseInt(id, 10) });
    }
    if (!doc && ObjectId.isValid(id)) {
      doc = await col.findOne({ _id: new ObjectId(id) });
    }
    if (!doc) return res.status(404).json({ error: 'Product not found' });
    res.json(serializeProduct(doc));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', requireAdmin, upload.array('images', 6), async (req, res) => {
  try {
    const col = await productsCol();
    let colors = [];
    try {
      colors = JSON.parse(req.body.colors || '[]');
    } catch {
      colors = [{ name: 'Black', hex: '#1a1a1a' }];
    }
    let sizes = [];
    try {
      sizes = JSON.parse(req.body.sizes || '[]');
    } catch {
      sizes = [36, 37, 38, 39, 40];
    }

    const imageUrls = filesToDataUrls(req.files);
    const numericId = await nextNumericId(col);

    let stock = {};
    try {
      if (req.body.stock) stock = JSON.parse(req.body.stock);
    } catch { /* empty stock */ }

    const product = {
      numericId,
      name: (req.body.name || '').trim(),
      category: req.body.category || 'flats',
      price: parseFloat(req.body.price) || 0,
      oldPrice: req.body.oldPrice ? parseFloat(req.body.oldPrice) : null,
      specialPrice: req.body.specialPrice ? parseFloat(req.body.specialPrice) : null,
      badge: req.body.badge || null,
      rating: parseFloat(req.body.rating) || 5,
      reviews: 0,
      colors,
      sizes,
      stock,
      sku: (req.body.sku || '').trim(),
      featured: req.body.featured === '1' || req.body.featured === 'true' || req.body.featured === true,
      isNew: req.body.isNew === '1' || req.body.isNew === 'true' || req.body.isNew === true,
      isBestSeller: req.body.isBestSeller === '1' || req.body.isBestSeller === 'true' || req.body.isBestSeller === true,
      material: (req.body.material || '').trim(),
      images: imageUrls.length ? imageUrls : [PLACEHOLDER_IMG],
      description: req.body.description || '',
      details: req.body.details || '',
      createdAt: new Date(),
    };

    if (!product.name || !product.price) {
      return res.status(400).json({ error: 'Name and price are required' });
    }

    const result = await col.insertOne(product);
    product._id = result.insertedId;

    if (req.body.notify === '1' || req.body.notify === 'true') {
      notifyNewArrival(serializeProduct(product)).catch(console.error);
    }

    res.json({ success: true, product: serializeProduct(product) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to add product' });
  }
});

app.put('/api/products/:id', requireAdmin, upload.array('images', 6), async (req, res) => {
  try {
    const col = await productsCol();
    const id = req.params.id;
    let filter = null;
    if (/^\d+$/.test(id)) filter = { numericId: parseInt(id, 10) };
    else if (ObjectId.isValid(id)) filter = { _id: new ObjectId(id) };
    else return res.status(400).json({ error: 'Invalid id' });

    const existing = await col.findOne(filter);
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const newImages = filesToDataUrls(req.files);
    let colors = existing.colors;
    if (req.body.colors) {
      try {
        colors = JSON.parse(req.body.colors);
      } catch { /* keep */ }
    }
    let sizes = existing.sizes;
    if (req.body.sizes) {
      try {
        sizes = JSON.parse(req.body.sizes);
      } catch { /* keep */ }
    }

    let stock = existing.stock || {};
    if (req.body.stock) {
      try { stock = JSON.parse(req.body.stock); } catch { /* keep */ }
    }

    const update = {
      name: req.body.name !== undefined ? req.body.name.trim() : existing.name,
      category: req.body.category || existing.category,
      price: req.body.price !== undefined ? parseFloat(req.body.price) : existing.price,
      oldPrice:
        req.body.oldPrice !== undefined && req.body.oldPrice !== ''
          ? parseFloat(req.body.oldPrice)
          : existing.oldPrice,
      specialPrice:
        req.body.specialPrice !== undefined && req.body.specialPrice !== ''
          ? parseFloat(req.body.specialPrice)
          : req.body.specialPrice === ''
            ? null
            : existing.specialPrice,
      badge: req.body.badge !== undefined ? req.body.badge || null : existing.badge,
      colors,
      sizes,
      stock,
      sku: req.body.sku !== undefined ? (req.body.sku || '').trim() : existing.sku,
      featured: req.body.featured !== undefined
        ? (req.body.featured === '1' || req.body.featured === 'true' || req.body.featured === true)
        : existing.featured,
      isNew: req.body.isNew !== undefined
        ? (req.body.isNew === '1' || req.body.isNew === 'true' || req.body.isNew === true)
        : existing.isNew,
      isBestSeller: req.body.isBestSeller !== undefined
        ? (req.body.isBestSeller === '1' || req.body.isBestSeller === 'true' || req.body.isBestSeller === true)
        : existing.isBestSeller,
      material: req.body.material !== undefined ? (req.body.material || '').trim() : existing.material,
      images: newImages.length ? newImages : existing.images,
      description: req.body.description !== undefined ? req.body.description : existing.description,
      details: req.body.details !== undefined ? req.body.details : existing.details,
      updatedAt: new Date(),
    };

    await col.updateOne(filter, { $set: update });
    const updated = await col.findOne(filter);
    res.json({ success: true, product: serializeProduct(updated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to update product' });
  }
});

app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const col = await productsCol();
    const id = req.params.id;
    let filter = null;
    if (/^\d+$/.test(id)) filter = { numericId: parseInt(id, 10) };
    else if (ObjectId.isValid(id)) filter = { _id: new ObjectId(id) };
    else return res.status(400).json({ error: 'Invalid id' });

    const result = await col.deleteOne(filter);
    if (!result.deletedCount) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/products/bulk-delete', requireAdmin, async (req, res) => {
  try {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'ids array required' });
    }
    const col = await productsCol();
    const objectIds = [];
    const numericIds = [];
    for (const id of ids) {
      if (/^\d+$/.test(String(id))) numericIds.push(parseInt(id, 10));
      else if (ObjectId.isValid(id)) objectIds.push(new ObjectId(id));
    }
    const filter = { $or: [] };
    if (numericIds.length) filter.$or.push({ numericId: { $in: numericIds } });
    if (objectIds.length) filter.$or.push({ _id: { $in: objectIds } });
    if (!filter.$or.length) return res.status(400).json({ error: 'No valid ids' });
    const result = await col.deleteMany(filter);
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------- Orders ---------- */
app.get('/api/orders', requireAdmin, async (_req, res) => {
  try {
    const col = await ordersCol();
    const docs = await col.find({}).sort({ createdAt: -1 }).toArray();
    res.json(docs.map(serializeOrder));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    const col = await ordersCol();
    const id = req.params.id;
    let doc = null;
    if (/^\d+$/.test(id)) doc = await col.findOne({ numericId: parseInt(id, 10) });
    if (!doc && ObjectId.isValid(id)) doc = await col.findOne({ _id: new ObjectId(id) });
    if (!doc) return res.status(404).json({ error: 'Order not found' });
    res.json(serializeOrder(doc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', optionalUser, async (req, res) => {
  try {
    const body = req.body || {};
    const rawItems = body.items || [];
    if (!rawItems.length) return res.status(400).json({ error: 'Cart is empty' });
    if (!body.email || !body.firstName) {
      return res.status(400).json({ error: 'Customer name and email required' });
    }

    const products = await productsCol();
    const validatedItems = [];
    let subtotal = 0;

    // Server-side price + stock validation
    for (const it of rawItems) {
      const qty = Math.max(1, parseInt(it.qty, 10) || 1);
      const size = String(it.size || '');
      const color = String(it.color || '').trim();
      let prod = null;
      if (/^\d+$/.test(String(it.id))) {
        prod = await products.findOne({ numericId: parseInt(it.id, 10) });
      } else if (ObjectId.isValid(it.id)) {
        prod = await products.findOne({ _id: new ObjectId(it.id) });
      }
      if (!prod) return res.status(400).json({ error: `Product not found: ${it.name || it.id}` });

      const unitPrice = prod.specialPrice != null ? prod.specialPrice : prod.price;
      // Stock check (if stock map exists)
      if (prod.stock && typeof prod.stock === 'object') {
        const colorStock = prod.stock[color] || prod.stock[Object.keys(prod.stock)[0]];
        if (colorStock && typeof colorStock === 'object') {
          const available = parseInt(colorStock[size], 10);
          if (!isNaN(available) && available < qty) {
            return res.status(400).json({
              error: `Insufficient stock for ${prod.name} (size ${size}, ${color}). Available: ${available}`,
            });
          }
        }
      }

      validatedItems.push({
        id: prod.numericId != null ? prod.numericId : prod._id.toString(),
        name: prod.name,
        price: unitPrice,
        image: (prod.images && prod.images[0]) || '',
        size,
        color,
        qty,
      });
      subtotal += unitPrice * qty;
    }

    // Coupon validation (server-side only)
    let discount = 0;
    let couponCode = null;
    const code = (body.couponCode || body.coupon || '').trim().toUpperCase();
    if (code) {
      const coupons = await couponsCol();
      const coupon = await coupons.findOne({ code, active: true });
      if (!coupon) return res.status(400).json({ error: 'Invalid or inactive coupon code' });
      if (coupon.expiry && new Date(coupon.expiry) < new Date()) {
        return res.status(400).json({ error: 'This coupon has expired' });
      }
      if (coupon.usageLimit != null && (coupon.usedCount || 0) >= coupon.usageLimit) {
        return res.status(400).json({ error: 'This coupon has reached its usage limit' });
      }
      if (coupon.minOrder && subtotal < coupon.minOrder) {
        return res.status(400).json({
          error: `Minimum order of PKR ${coupon.minOrder} required for this coupon`,
        });
      }
      if (coupon.type === 'percent' || coupon.type === 'percentage') {
        discount = Math.round((subtotal * (parseFloat(coupon.value) || 0)) / 100);
      } else {
        discount = Math.min(subtotal, parseFloat(coupon.value) || 0);
      }
      couponCode = coupon.code;
    }

    const afterDiscount = Math.max(0, subtotal - discount);
    const shippingFee = afterDiscount >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
    const total = afterDiscount + shippingFee;

    // Allowed payment methods
    const allowedPayments = ['cod', 'card', 'nayapay', 'Cash on Delivery', 'Card', 'NayaPay'];
    let payment = (body.payment || 'cod').toString().toLowerCase();
    if (payment === 'cash on delivery') payment = 'cod';
    if (!['cod', 'card', 'nayapay'].includes(payment)) payment = 'cod';

    const col = await ordersCol();
    const numericId = (await nextNumericId(col)) + 1000;
    const now = new Date();
    const initialStatus = 'Order Placed';

    const order = {
      numericId,
      orderNumber: 'SP-' + numericId,
      status: initialStatus,
      statusHistory: [
        {
          status: initialStatus,
          at: now.toISOString(),
          atLocal: now.toLocaleString('en-PK', {
            timeZone: 'Asia/Karachi',
            dateStyle: 'medium',
            timeStyle: 'short',
          }),
        },
      ],
      createdAt: now.toISOString(),
      createdAtLocal: now.toLocaleString('en-PK', {
        timeZone: 'Asia/Karachi',
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
      customer: {
        email: (body.email || '').trim().toLowerCase(),
        phone: body.phone || '',
        firstName: (body.firstName || '').trim(),
        lastName: (body.lastName || '').trim(),
      },
      shipping: {
        address: body.address || '',
        apartment: body.apartment || '',
        city: body.city || '',
        province: body.province || '',
        postal: body.postal || '',
        country: body.country || 'Pakistan',
      },
      payment,
      paymentStatus: payment === 'cod' ? 'unpaid' : 'unpaid',
      items: validatedItems,
      subtotal,
      discount,
      couponCode,
      shippingFee,
      total,
      notes: body.notes || '',
    };

    // Link order to logged-in user when present (guest checkout still works)
    if (req.user && req.user.userId && ObjectId.isValid(req.user.userId)) {
      order.userId = new ObjectId(req.user.userId);
    }

    const result = await col.insertOne(order);
    order._id = result.insertedId;

    // Decrement stock
    for (const it of validatedItems) {
      const prod = await products.findOne(
        /^\d+$/.test(String(it.id))
          ? { numericId: parseInt(it.id, 10) }
          : { _id: new ObjectId(it.id) }
      );
      if (prod && prod.stock && prod.stock[it.color] && prod.stock[it.color][it.size] != null) {
        const key = `stock.${it.color}.${it.size}`;
        await products.updateOne(
          { _id: prod._id },
          { $inc: { [key]: -it.qty } }
        );
      }
    }

    // Increment coupon usage
    if (couponCode) {
      const coupons = await couponsCol();
      await coupons.updateOne({ code: couponCode }, { $inc: { usedCount: 1 } });
    }

    // Notify admin + customer
    const itemsText = order.items.map(it => `- ${it.name} (EU ${it.size}, ${it.color}) x${it.qty} = Rs ${it.price * it.qty}`).join('\n');
    const itemsHtml = order.items.map(it => `<tr><td>${escapeHtml(it.name)}</td><td>EU ${escapeHtml(String(it.size))} / ${escapeHtml(it.color)}</td><td>${it.qty}</td><td>Rs ${it.price * it.qty}</td></tr>`).join('');
    const addr = [order.shipping.address, order.shipping.apartment, order.shipping.city, order.shipping.province, order.shipping.postal, order.shipping.country].filter(Boolean).join(', ');
    const discountLine = discount > 0 ? `Discount (${couponCode}): -Rs ${discount}\n` : '';
    const shipLabel = shippingFee === 0 ? 'FREE' : `Rs ${shippingFee}`;

    // Notify admin about new order
try {
  await sendMail({
    to: CONTACT_EMAIL,
    subject: `[SHOEPHILE] New order ${order.orderNumber}`,
    text: `New order ${order.orderNumber}

Date: ${order.createdAtLocal}

Customer: ${order.customer.firstName} ${order.customer.lastName}

Email: ${order.customer.email}

Phone: ${order.customer.phone || '—'}

Address: ${addr}

Payment: ${order.payment}

Products:

${itemsText}

Subtotal: Rs ${order.subtotal}

${discountLine}Shipping: ${shipLabel}

Total: Rs ${order.total}`,

    html: `<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#2A2425;">
      <h2>New SHOEPHILE Order — ${escapeHtml(order.orderNumber)}</h2>

      <p><strong>Date:</strong> ${escapeHtml(order.createdAtLocal)}</p>

      <hr>

      <p><strong>Customer:</strong> ${escapeHtml(
        order.customer.firstName + ' ' + (order.customer.lastName || '')
      )}</p>

      <p><strong>Email:</strong> ${escapeHtml(order.customer.email)}</p>

      <p><strong>Phone:</strong> ${escapeHtml(order.customer.phone || '—')}</p>

      <p><strong>Address:</strong> ${escapeHtml(addr)}</p>

      <p><strong>Payment Method:</strong> ${escapeHtml(order.payment)}</p>

      <h3>Products</h3>

      <table border="1" cellpadding="8" cellspacing="0"
        style="border-collapse:collapse;width:100%;">

        <thead>
          <tr>
            <th>Product</th>
            <th>Size / Color</th>
            <th>Qty</th>
            <th>Price</th>
          </tr>
        </thead>

        <tbody>
          ${itemsHtml}
        </tbody>

      </table>

      <p style="margin-top:20px;">
        <strong>Subtotal:</strong> Rs ${order.subtotal}<br>
        ${discount > 0
          ? `<strong>Discount (${escapeHtml(couponCode)}):</strong> -Rs ${discount}<br>`
          : ''}
        <strong>Shipping:</strong> ${shipLabel}<br>
        <strong style="font-size:18px;">Total: Rs ${order.total}</strong>
      </p>

      <hr>

      <p style="font-size:13px;color:#777;">
        SHOEPHILE — Love Affair with Shoes
      </p>
    </div>`,
  });

  console.log(`✅ Order email sent successfully for ${order.orderNumber}`);

} catch (emailError) {

  console.error(
    `❌ Failed to send order email for ${order.orderNumber}:`,
    emailError
  );
}

    // Customer confirmation
    sendMail({
      to: order.customer.email,
      subject: `Order confirmed — ${order.orderNumber} | SHOEPHILE`,
      text: `Thank you for your order, ${order.customer.firstName}!\n\nOrder ${order.orderNumber} has been received.\nTotal: Rs ${order.total}\n\nTrack your order: https://shoephile.vercel.app/track.html?id=${order.orderNumber}\n\nLove Affair with Shoes\nSHOEPHILE`,
      html: `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#2A2425;">
        <h2 style="font-weight:400;">Thank you, ${escapeHtml(order.customer.firstName)}</h2>
        <p>Your order <strong>${escapeHtml(order.orderNumber)}</strong> has been received.</p>
        <p><strong>Total: Rs ${order.total}</strong> (${escapeHtml(order.payment)})</p>
        <p><a href="https://shoephile.vercel.app/track.html?id=${encodeURIComponent(order.orderNumber)}" style="color:#B97883;">Track your order</a></p>
        <p style="margin-top:2em;font-size:0.9em;color:#7A6F6B;">Love Affair with Shoes<br>SHOEPHILE</p>
      </div>`,
    }).catch(console.error);

    res.json({ success: true, order: serializeOrder(order) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Could not place order' });
  }
});

app.patch('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    const col = await ordersCol();
    const id = req.params.id;
    let filter = null;
    if (/^\d+$/.test(id)) filter = { numericId: parseInt(id, 10) };
    else if (ObjectId.isValid(id)) filter = { _id: new ObjectId(id) };
    else return res.status(400).json({ error: 'Invalid id' });

    const rawStatus = (req.body && req.body.status) || 'Order Placed';
    const status = normalizeStatus(rawStatus);
    const allowed = [...ORDER_STATUSES, 'pending', 'processing', 'confirmed', 'shipped', 'delivered', 'cancelled', 'paid', 'unpaid'];
    if (!allowed.includes(rawStatus) && !ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const existing = await col.findOne(filter);
    if (!existing) return res.status(404).json({ error: 'Order not found' });

    const now = new Date();
    const historyEntry = {
      status,
      at: now.toISOString(),
      atLocal: now.toLocaleString('en-PK', {
        timeZone: 'Asia/Karachi',
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    };
    const prevHistory = Array.isArray(existing.statusHistory) ? existing.statusHistory : [];
    // Avoid duplicate consecutive status
    const last = prevHistory[prevHistory.length - 1];
    const newHistory =
      last && last.status === status ? prevHistory : [...prevHistory, historyEntry];

    const updateFields = {
      status,
      statusHistory: newHistory,
      updatedAt: now.toISOString(),
    };
    // Optional payment status toggle from admin
    if (req.body.paymentStatus === 'paid' || req.body.paymentStatus === 'unpaid') {
      updateFields.paymentStatus = req.body.paymentStatus;
    }

    await col.updateOne(filter, { $set: updateFields });
    const updated = await col.findOne(filter);
    res.json({ success: true, order: serializeOrder(updated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    const col = await ordersCol();
    const id = req.params.id;
    let filter = null;
    if (/^\d+$/.test(id)) filter = { numericId: parseInt(id, 10) };
    else if (ObjectId.isValid(id)) filter = { _id: new ObjectId(id) };
    else return res.status(400).json({ error: 'Invalid id' });

    const result = await col.deleteOne(filter);
    if (!result.deletedCount) return res.status(404).json({ error: 'Order not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------- Contact ---------- */
app.post('/api/contact', async (req, res) => {
  const { name, email, subject, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email and message are required' });
  }
  const when = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' });
  const text = `New contact from SHOEPHILE\n\nDate: ${when}\nName: ${name}\nEmail: ${email}\nSubject: ${subject || '—'}\n\n${message}`;
  const html = `
    <h2>New contact — SHOEPHILE</h2>
    <p><strong>Date & Time:</strong> ${escapeHtml(when)}</p>
    <p><strong>Customer Name:</strong> ${escapeHtml(name)}</p>
    <p><strong>Customer Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Subject:</strong> ${escapeHtml(subject || '—')}</p>
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`;
  try {
    const result = await sendMail({
      to: CONTACT_EMAIL,
      subject: `[SHOEPHILE] ${subject || 'Contact form'} — ${name}`,
      text,
      html,
    });
    res.json({
      success: true,
      message: result.skipped
        ? 'Message received. Email not configured (set SMTP_PASS).'
        : 'Message sent successfully.',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not send message.' });
  }
});

/* ---------- Newsletter ---------- */
app.post('/api/newsletter', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  try {
    const col = await subscribersCol();
    await col.updateOne({ email }, { $set: { email, subscribedAt: new Date() } }, { upsert: true });
    sendMail({
      to: email,
      subject: 'Welcome to SHOEPHILE',
      text: 'Thank you for joining the SHOEPHILE circle.',
      html: '<p>Thank you for joining the <strong>SHOEPHILE</strong> circle.</p>',
    }).catch(console.error);
    res.json({ success: true, message: 'Subscribed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/subscribers', requireAdmin, async (_req, res) => {
  try {
    const col = await subscribersCol();
    const list = await col.find({}).toArray();
    res.json(list.map((s) => s.email));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/newsletter/notify', requireAdmin, async (req, res) => {
  try {
    const { productName, productUrl } = req.body || {};
    const col = await subscribersCol();
    const list = await col.find({}).toArray();
    if (!list.length) return res.json({ success: true, sent: 0, message: 'No subscribers' });
    let sent = 0;
    for (const sub of list) {
      try {
        await sendMail({
          to: sub.email,
          subject: `New Arrival — ${productName || 'SHOEPHILE'}`,
          text: `New at SHOEPHILE: ${productName || 'New style'}`,
          html: `<p>New at <strong>SHOEPHILE</strong></p><p><strong>${escapeHtml(productName || 'New style')}</strong></p>
                 <p><a href="${escapeHtml(productUrl || '/shop.html')}">Shop now</a></p>`,
        });
        sent++;
      } catch (e) {
        console.error(e.message);
      }
    }
    res.json({ success: true, sent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function notifyNewArrival(product) {
  try {
    const col = await subscribersCol();
    const list = await col.find({}).toArray();
    for (const sub of list) {
      try {
        await sendMail({
          to: sub.email,
          subject: `New Arrival — ${product.name}`,
          text: `New at SHOEPHILE: ${product.name}. Rs ${product.price}`,
          html: `<p>New at <strong>SHOEPHILE</strong></p><h3>${escapeHtml(product.name)}</h3>
                 <p>Rs ${product.specialPrice || product.price}</p>
                 <p><a href="/product.html?id=${product.id}">View product</a></p>`,
        });
      } catch (e) {
        console.error(e.message);
      }
    }
  } catch (e) {
    console.error(e);
  }
}

/* ---------- Public Order Tracking (no admin key) ---------- */
app.get('/api/track/:orderNumber', async (req, res) => {
  try {
    const col = await ordersCol();
    const orderNumber = (req.params.orderNumber || '').trim().toUpperCase();
    if (!orderNumber) return res.status(400).json({ error: 'Order ID required' });

    let doc = await col.findOne({ orderNumber });
    if (!doc && /^\d+$/.test(orderNumber.replace(/^SP-?/i, ''))) {
      const num = parseInt(orderNumber.replace(/^SP-?/i, ''), 10);
      doc = await col.findOne({ numericId: num });
    }
    if (!doc) return res.status(404).json({ error: 'Order not found. Please check your Order ID.' });

    // Optional email verification for extra privacy
    const emailQ = (req.query.email || '').trim().toLowerCase();
    if (emailQ && doc.customer?.email && doc.customer.email.toLowerCase() !== emailQ) {
      return res.status(404).json({ error: 'Order not found. Please check your Order ID and email.' });
    }

    const order = serializeOrder(doc);
    // Public payload — omit internal notes if sensitive
    res.json({
      success: true,
      order: {
        orderNumber: order.orderNumber,
        status: order.status,
        statusHistory: order.statusHistory,
        createdAt: order.createdAt,
        createdAtLocal: order.createdAtLocal,
        updatedAt: order.updatedAt,
        items: order.items,
        subtotal: order.subtotal,
        shippingFee: order.shippingFee,
        total: order.total,
        payment: order.payment,
        customer: {
          firstName: order.customer?.firstName,
          lastName: order.customer?.lastName,
          email: order.customer?.email
            ? order.customer.email.replace(/(.{2}).+(@.+)/, '$1***$2')
            : undefined,
        },
      },
      timeline: ORDER_STATUSES.filter((s) => s !== 'Cancelled'),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Could not track order' });
  }
});

/* ---------- Coupons ---------- */
app.get('/api/coupons', requireAdmin, async (_req, res) => {
  try {
    const col = await couponsCol();
    const list = await col.find({}).sort({ createdAt: -1 }).toArray();
    res.json(list.map((c) => ({
      id: c._id.toString(),
      code: c.code,
      type: c.type,
      value: c.value,
      minOrder: c.minOrder || 0,
      expiry: c.expiry || null,
      usageLimit: c.usageLimit ?? null,
      usedCount: c.usedCount || 0,
      active: c.active !== false,
      createdAt: c.createdAt,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/coupons', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const code = (body.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'Coupon code required' });
    const type = body.type === 'percent' || body.type === 'percentage' ? 'percent' : 'fixed';
    const value = parseFloat(body.value);
    if (isNaN(value) || value <= 0) return res.status(400).json({ error: 'Valid discount value required' });

    const col = await couponsCol();
    const existing = await col.findOne({ code });
    if (existing) return res.status(400).json({ error: 'Coupon code already exists' });

    const doc = {
      code,
      type,
      value,
      minOrder: parseFloat(body.minOrder) || 0,
      expiry: body.expiry ? new Date(body.expiry) : null,
      usageLimit: body.usageLimit != null ? parseInt(body.usageLimit, 10) : null,
      usedCount: 0,
      active: body.active !== false && body.active !== 'false',
      createdAt: new Date(),
    };
    const result = await col.insertOne(doc);
    res.json({ success: true, id: result.insertedId.toString(), coupon: doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/coupons/:id', requireAdmin, async (req, res) => {
  try {
    const col = await couponsCol();
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body || {};
    const update = { updatedAt: new Date() };
    if (body.code) update.code = body.code.trim().toUpperCase();
    if (body.type) update.type = body.type === 'percent' || body.type === 'percentage' ? 'percent' : 'fixed';
    if (body.value != null) update.value = parseFloat(body.value);
    if (body.minOrder != null) update.minOrder = parseFloat(body.minOrder) || 0;
    if (body.expiry !== undefined) update.expiry = body.expiry ? new Date(body.expiry) : null;
    if (body.usageLimit !== undefined) update.usageLimit = body.usageLimit != null ? parseInt(body.usageLimit, 10) : null;
    if (body.active !== undefined) update.active = body.active === true || body.active === 'true';
    await col.updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/coupons/:id', requireAdmin, async (req, res) => {
  try {
    const col = await couponsCol();
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    await col.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Public coupon validation (for cart preview — final validation happens on order) */
app.post('/api/coupons/validate', async (req, res) => {
  try {
    const code = (req.body.code || '').trim().toUpperCase();
    const subtotal = parseFloat(req.body.subtotal) || 0;
    if (!code) return res.status(400).json({ error: 'Coupon code required' });
    const col = await couponsCol();
    const coupon = await col.findOne({ code, active: true });
    if (!coupon) return res.status(400).json({ valid: false, error: 'Invalid or inactive coupon' });
    if (coupon.expiry && new Date(coupon.expiry) < new Date()) {
      return res.status(400).json({ valid: false, error: 'Coupon has expired' });
    }
    if (coupon.usageLimit != null && (coupon.usedCount || 0) >= coupon.usageLimit) {
      return res.status(400).json({ valid: false, error: 'Coupon usage limit reached' });
    }
    if (coupon.minOrder && subtotal < coupon.minOrder) {
      return res.status(400).json({
        valid: false,
        error: `Minimum order PKR ${coupon.minOrder} required`,
      });
    }
    let discount = 0;
    if (coupon.type === 'percent') {
      discount = Math.round((subtotal * coupon.value) / 100);
    } else {
      discount = Math.min(subtotal, coupon.value);
    }
    res.json({
      valid: true,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      discount,
      message: coupon.type === 'percent' ? `${coupon.value}% off` : `PKR ${coupon.value} off`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------- Reviews ---------- */
app.get('/api/reviews', async (req, res) => {
  try {
    const col = await reviewsCol();
    const filter = { status: 'approved' };
    if (req.query.productId) {
      filter.productId = isNaN(req.query.productId)
        ? req.query.productId
        : parseInt(req.query.productId, 10);
    }
    const list = await col.find(filter).sort({ createdAt: -1 }).limit(50).toArray();
    res.json(list.map((r) => ({
      id: r._id.toString(),
      productId: r.productId,
      name: r.name,
      rating: r.rating,
      text: r.text,
      verified: !!r.verified,
      createdAt: r.createdAt,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reviews/admin', requireAdmin, async (_req, res) => {
  try {
    const col = await reviewsCol();
    const list = await col.find({}).sort({ createdAt: -1 }).toArray();
    res.json(list.map((r) => ({
      id: r._id.toString(),
      productId: r.productId,
      name: r.name,
      rating: r.rating,
      text: r.text,
      status: r.status,
      verified: !!r.verified,
      createdAt: r.createdAt,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reviews', async (req, res) => {
  try {
    const { productId, name, rating, text } = req.body || {};

    if (!name || !rating || !text) {
      return res.status(400).json({
        error: 'Name, rating and review text are required'
      });
    }

    const r = Math.min(
      5,
      Math.max(1, parseInt(rating, 10) || 5)
    );

    const col = await reviewsCol();

    const doc = {
      productId: productId
        ? (isNaN(productId) ? productId : parseInt(productId, 10))
        : null,

      name: String(name).trim().slice(0, 80),

      rating: r,

      text: String(text).trim().slice(0, 2000),

      status: 'pending',

      verified: false,

      createdAt: new Date()
    };

    const result = await col.insertOne(doc);

    res.status(201).json({
      success: true,
      id: result.insertedId.toString(),
      message: 'Review submitted for approval'
    });

  } catch (err) {
    console.error('Review submission error:', err);

    res.status(500).json({
      error: 'Failed to submit review',
      details: err.message
    });
  }
});
    const result = await col.insertOne(doc);
    res.json({ success: true, id: result.insertedId.toString(), message: 'Review submitted for approval' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/reviews/:id', requireAdmin, async (req, res) => {
  try {
    const col = await reviewsCol();
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const status = (req.body.status || '').toLowerCase();
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'status must be approved, rejected or pending' });
    }
    await col.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status, updatedAt: new Date() } }
    );
    // Optionally update product rating aggregate when approved
    if (status === 'approved') {
      const review = await col.findOne({ _id: new ObjectId(req.params.id) });
      if (review) {
        const products = await productsCol();
        const approved = await col.find({ productId: review.productId, status: 'approved' }).toArray();
        if (approved.length) {
          const avg = approved.reduce((s, r) => s + r.rating, 0) / approved.length;
          const filter = typeof review.productId === 'number'
            ? { numericId: review.productId }
            : ObjectId.isValid(review.productId)
              ? { _id: new ObjectId(review.productId) }
              : null;
          if (filter) {
            await products.updateOne(filter, {
              $set: { rating: Math.round(avg * 10) / 10, reviews: approved.length },
            });
          }
        }
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/reviews/:id', requireAdmin, async (req, res) => {
  try {
    const col = await reviewsCol();
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    await col.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Shipping config (public) */
app.get('/api/shipping', (_req, res) => {
  res.json({
    fee: SHIPPING_FEE,
    freeThreshold: FREE_SHIPPING_THRESHOLD,
    currency: 'PKR',
    note: `Flat shipping PKR ${SHIPPING_FEE}. Free shipping on orders above PKR ${FREE_SHIPPING_THRESHOLD}.`,
  });
});

/* ---------- Website CMS content (Home + About) ---------- */
app.get('/api/content/home', async (_req, res) => {
  try {
    const col = await contentCol();
    let doc = await col.findOne({ key: 'home' });
    if (!doc) {
      await col.updateOne({ key: 'home' }, { $setOnInsert: { ...DEFAULT_HOME_CONTENT } }, { upsert: true });
      doc = await col.findOne({ key: 'home' });
    }
    res.json({
      heroImage: doc.heroImage || '',
      eyebrow: doc.eyebrow || DEFAULT_HOME_CONTENT.eyebrow,
      heading: doc.heading || DEFAULT_HOME_CONTENT.heading,
      description: doc.description || DEFAULT_HOME_CONTENT.description,
      btn1Text: doc.btn1Text || DEFAULT_HOME_CONTENT.btn1Text,
      btn1Url: doc.btn1Url || DEFAULT_HOME_CONTENT.btn1Url,
      btn2Text: doc.btn2Text || DEFAULT_HOME_CONTENT.btn2Text,
      btn2Url: doc.btn2Url || DEFAULT_HOME_CONTENT.btn2Url,
      updatedAt: doc.updatedAt || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to load home content' });
  }
});

app.put('/api/content/home', requireAdmin, upload.single('heroImage'), async (req, res) => {
  try {
    const col = await contentCol();
    const body = req.body || {};
    const existing = (await col.findOne({ key: 'home' })) || { ...DEFAULT_HOME_CONTENT };

    let heroImage = existing.heroImage || '';
    if (req.file) {
      const urls = filesToDataUrls([req.file]);
      if (urls[0]) heroImage = urls[0];
    } else if (body.heroImage === '' || body.clearHeroImage === '1') {
      heroImage = '';
    } else if (body.heroImage && String(body.heroImage).startsWith('data:')) {
      heroImage = body.heroImage;
    }

    const update = {
      key: 'home',
      heroImage,
      eyebrow: (body.eyebrow != null ? String(body.eyebrow) : existing.eyebrow || DEFAULT_HOME_CONTENT.eyebrow).trim(),
      heading: (body.heading != null ? String(body.heading) : existing.heading || DEFAULT_HOME_CONTENT.heading).trim(),
      description: (body.description != null ? String(body.description) : existing.description || DEFAULT_HOME_CONTENT.description).trim(),
      btn1Text: (body.btn1Text != null ? String(body.btn1Text) : existing.btn1Text || DEFAULT_HOME_CONTENT.btn1Text).trim(),
      btn1Url: (body.btn1Url != null ? String(body.btn1Url) : existing.btn1Url || DEFAULT_HOME_CONTENT.btn1Url).trim(),
      btn2Text: (body.btn2Text != null ? String(body.btn2Text) : existing.btn2Text || DEFAULT_HOME_CONTENT.btn2Text).trim(),
      btn2Url: (body.btn2Url != null ? String(body.btn2Url) : existing.btn2Url || DEFAULT_HOME_CONTENT.btn2Url).trim(),
      updatedAt: new Date(),
    };

    await col.updateOne({ key: 'home' }, { $set: update }, { upsert: true });
    res.json({ success: true, content: update });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to save home content' });
  }
});

app.get('/api/content/about', async (_req, res) => {
  try {
    const col = await contentCol();
    let doc = await col.findOne({ key: 'about' });
    if (!doc) {
      await col.updateOne({ key: 'about' }, { $setOnInsert: { ...DEFAULT_ABOUT_CONTENT } }, { upsert: true });
      doc = await col.findOne({ key: 'about' });
    }
    res.json({
      heroImage: doc.heroImage || '',
      craftLabel: doc.craftLabel || DEFAULT_ABOUT_CONTENT.craftLabel,
      craftHeading: doc.craftHeading || DEFAULT_ABOUT_CONTENT.craftHeading,
      craftPara1: doc.craftPara1 || DEFAULT_ABOUT_CONTENT.craftPara1,
      craftPara2: doc.craftPara2 || DEFAULT_ABOUT_CONTENT.craftPara2,
      pillarsLabel: doc.pillarsLabel || DEFAULT_ABOUT_CONTENT.pillarsLabel,
      pillarsHeading: doc.pillarsHeading || DEFAULT_ABOUT_CONTENT.pillarsHeading,
      pillars: Array.isArray(doc.pillars) ? doc.pillars : DEFAULT_ABOUT_CONTENT.pillars,
      updatedAt: doc.updatedAt || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to load about content' });
  }
});

app.put('/api/content/about', requireAdmin, upload.single('heroImage'), async (req, res) => {
  try {
    const col = await contentCol();
    const body = req.body || {};
    const existing = (await col.findOne({ key: 'about' })) || { ...DEFAULT_ABOUT_CONTENT };

    let heroImage = existing.heroImage || '';
    if (req.file) {
      const urls = filesToDataUrls([req.file]);
      if (urls[0]) heroImage = urls[0];
    } else if (body.heroImage === '' || body.clearHeroImage === '1') {
      heroImage = '';
    } else if (body.heroImage && String(body.heroImage).startsWith('data:')) {
      heroImage = body.heroImage;
    }

    let pillars = existing.pillars || DEFAULT_ABOUT_CONTENT.pillars;
    if (body.pillars) {
      try {
        const parsed = typeof body.pillars === 'string' ? JSON.parse(body.pillars) : body.pillars;
        if (Array.isArray(parsed)) pillars = parsed;
      } catch { /* keep existing */ }
    }

    const update = {
      key: 'about',
      heroImage,
      craftLabel: (body.craftLabel != null ? String(body.craftLabel) : existing.craftLabel || DEFAULT_ABOUT_CONTENT.craftLabel).trim(),
      craftHeading: (body.craftHeading != null ? String(body.craftHeading) : existing.craftHeading || DEFAULT_ABOUT_CONTENT.craftHeading).trim(),
      craftPara1: (body.craftPara1 != null ? String(body.craftPara1) : existing.craftPara1 || DEFAULT_ABOUT_CONTENT.craftPara1).trim(),
      craftPara2: (body.craftPara2 != null ? String(body.craftPara2) : existing.craftPara2 || DEFAULT_ABOUT_CONTENT.craftPara2).trim(),
      pillarsLabel: (body.pillarsLabel != null ? String(body.pillarsLabel) : existing.pillarsLabel || DEFAULT_ABOUT_CONTENT.pillarsLabel).trim(),
      pillarsHeading: (body.pillarsHeading != null ? String(body.pillarsHeading) : existing.pillarsHeading || DEFAULT_ABOUT_CONTENT.pillarsHeading).trim(),
      pillars,
      updatedAt: new Date(),
    };

    await col.updateOne({ key: 'about' }, { $set: update }, { upsert: true });
    res.json({ success: true, content: update });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to save about content' });
  }
});

/* Health */
app.get('/api/health', async (_req, res) => {
  try {
    await getDb();
    res.json({ ok: true, db: 'connected' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* SPA / static fallback */
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const file = path.join(__dirname, 'public', req.path === '/' ? 'index.html' : req.path);
  res.sendFile(file, (err) => {
    if (err) res.status(404).send('Not found');
  });
});

/* Export for Vercel serverless; listen locally */
module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  SHOEPHILE running at http://localhost:${PORT}`);
    console.log(`  Admin: ${ADMIN_PASSWORD ? 'configured' : 'NOT SET — set ADMIN_PASSWORD'}; email filter: ${ADMIN_EMAIL || 'any'}`);
    console.log(`  MongoDB: ${MONGODB_URI ? 'URI set' : 'MISSING — set MONGODB_URI'}`);
    console.log(`  JWT: ${JWT_SECRET ? 'configured' : 'NOT SET — set JWT_SECRET for customer auth'}`);
    console.log(`  Contact: ${CONTACT_EMAIL}\n`);
  });
}