#!/usr/bin/env node
/**
 * AgentInbox Test 3 — Complex multi-file bug stress test.
 *
 * Real production-level codebases. Bugs hidden across connected files.
 * Task descriptions written like real user reports — no hint of which file.
 * Claude must trace call chains, find root cause, fix it.
 *
 * Usage:
 *   node simulate-complex.js                        # all scenarios
 *   node simulate-complex.js --scenario auth        # single
 *   node simulate-complex.js --scenario pricing
 *   node simulate-complex.js --scenario api
 *   node simulate-complex.js --scenario config
 *   node simulate-complex.js --scenario middleware
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync, spawn } = require("child_process");

const SERVER_URL = "https://useagentinbox.com";
const LOGIN_EMAIL = "robin.devkota@amniltech.com";
const LOGIN_PASSWORD = "Super@123";
const TASK_TIMEOUT_MS = 8 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;

const SINGLE = (() => {
  const idx = process.argv.indexOf("--scenario");
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

// ── Scenarios ─────────────────────────────────────────────────────────────────

const SCENARIOS = [

  // ── 1. Auth chain bug ───────────────────────────────────────────────────────
  // routes.js → middleware/auth.js → services/userService.js → db/userRepository.js
  // Bug: userRepository does case-sensitive email lookup. "Alice@gmail.com" fails,
  // "alice@gmail.com" works. Symptom: "login fails for some users".
  {
    name: "auth",
    description: "Login fails for users with uppercase in email — bug buried in repository layer",
    files: {
      "package.json": JSON.stringify({ name: "auth-app", version: "1.0.0", main: "app.js" }, null, 2),
      "app.js": `const express = require('express');
const router = require('./routes/index');
const app = express();
app.use(express.json());
app.use('/api', router);
app.listen(3000, () => console.log('Server running on port 3000'));
module.exports = app;
`,
      "routes/index.js": `const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const userController = require('../controllers/userController');

router.post('/login', userController.login);
router.get('/profile', authMiddleware.verify, userController.getProfile);
router.post('/register', userController.register);
module.exports = router;
`,
      "controllers/userController.js": `const userService = require('../services/userService');

module.exports = {
  async login(req, res) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }
      const result = await userService.authenticate(email, password);
      if (!result.success) {
        return res.status(401).json({ error: result.error });
      }
      res.json({ token: result.token, user: result.user });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async register(req, res) {
    try {
      const { email, password, name } = req.body;
      const user = await userService.createUser({ email, password, name });
      res.status(201).json({ user });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async getProfile(req, res) {
    const user = await userService.getUserById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  }
};
`,
      "middleware/auth.js": `const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'dev-secret';

module.exports = {
  verify(req, res, next) {
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    try {
      const token = header.slice(7);
      const payload = jwt.verify(token, SECRET);
      req.userId = payload.userId;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  },

  sign(userId) {
    const SECRET = process.env.JWT_SECRET || 'dev-secret';
    return require('jsonwebtoken').sign({ userId }, SECRET, { expiresIn: '7d' });
  }
};
`,
      "services/userService.js": `const userRepository = require('../db/userRepository');
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');

module.exports = {
  async authenticate(email, password) {
    // Look up user — passes email as-is, repository will handle it
    const user = await userRepository.findByEmail(email);
    if (!user) {
      return { success: false, error: 'Invalid credentials' };
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return { success: false, error: 'Invalid credentials' };
    }
    const token = auth.sign(user.id);
    return { success: true, token, user: { id: user.id, email: user.email, name: user.name } };
  },

  async createUser({ email, password, name }) {
    const existing = await userRepository.findByEmail(email.toLowerCase());
    if (existing) throw new Error('Email already registered');
    const password_hash = await bcrypt.hash(password, 10);
    return userRepository.create({ email: email.toLowerCase(), password_hash, name });
  },

  async getUserById(id) {
    return userRepository.findById(id);
  }
};
`,
      // BUG IS HERE: findByEmail does exact match, no .toLowerCase()
      // Users registered as "alice@gmail.com" can't login as "Alice@gmail.com"
      "db/userRepository.js": `const users = [
  { id: '1', email: 'alice@gmail.com', password_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', name: 'Alice' },
  { id: '2', email: 'bob@company.com', password_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', name: 'Bob' },
];

module.exports = {
  // BUG: no case normalization — "Alice@gmail.com" won't match "alice@gmail.com"
  async findByEmail(email) {
    return users.find(u => u.email === email) || null;
  },

  async findById(id) {
    return users.find(u => u.id === id) || null;
  },

  async create({ email, password_hash, name }) {
    const user = { id: String(users.length + 1), email, password_hash, name };
    users.push(user);
    return user;
  }
};
`,
      "db/index.js": `module.exports = {
  userRepository: require('./userRepository'),
};
`,
      "utils/validators.js": `exports.isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
exports.isStrongPassword = (p) => p.length >= 8;
`,
      "utils/errors.js": `class AppError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}
module.exports = { AppError };
`,
      "config/index.js": `module.exports = {
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret',
  PORT: parseInt(process.env.PORT || '3000'),
  DB_PATH: process.env.DB_PATH || './data/app.db',
};
`,
    },
    task: {
      title: "Login fails for some users",
      description: "Some users report they can't log in, but other users on the same app can. One user says it started happening after they updated their email client which autocapitalizes the first letter. Login with 'alice@gmail.com' works but 'Alice@gmail.com' fails even with the correct password. Please investigate and fix.",
      priority: "high",
    },
  },

  // ── 2. Price calculation bug ────────────────────────────────────────────────
  // app.js → routes/checkout.js → services/checkoutService.js → services/cartService.js → utils/pricing.js
  // Bug: tax applied in pricing.js AND again in checkoutService.js — double tax
  // Symptom: "checkout total is always higher than expected"
  {
    name: "pricing",
    description: "Checkout total is wrong — tax applied twice across pricing.js and checkoutService.js",
    files: {
      "package.json": JSON.stringify({ name: "shop-app", version: "1.0.0" }, null, 2),
      "app.js": `const express = require('express');
const checkoutRouter = require('./routes/checkout');
const cartRouter = require('./routes/cart');
const app = express();
app.use(express.json());
app.use('/api/checkout', checkoutRouter);
app.use('/api/cart', cartRouter);
app.listen(4000);
module.exports = app;
`,
      "routes/checkout.js": `const express = require('express');
const router = express.Router();
const checkoutService = require('../services/checkoutService');

router.post('/calculate', async (req, res) => {
  try {
    const { cartId, couponCode } = req.body;
    const total = await checkoutService.calculateTotal(cartId, couponCode);
    res.json(total);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/complete', async (req, res) => {
  try {
    const { cartId, paymentMethod } = req.body;
    const order = await checkoutService.completeCheckout(cartId, paymentMethod);
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
`,
      "routes/cart.js": `const express = require('express');
const router = express.Router();
const cartService = require('../services/cartService');

router.get('/:cartId', async (req, res) => {
  const cart = await cartService.getCart(req.params.cartId);
  res.json(cart);
});

router.post('/:cartId/items', async (req, res) => {
  const cart = await cartService.addItem(req.params.cartId, req.body);
  res.json(cart);
});

module.exports = router;
`,
      "services/cartService.js": `const carts = {
  'cart-001': {
    id: 'cart-001',
    items: [
      { id: 'p1', name: 'Widget', qty: 2, unitPrice: 25.00 },
      { id: 'p2', name: 'Gadget', qty: 1, unitPrice: 49.99 },
    ]
  }
};

module.exports = {
  async getCart(cartId) {
    const cart = carts[cartId];
    if (!cart) throw new Error('Cart not found');
    return cart;
  },

  async getCartSubtotal(cartId) {
    const cart = await this.getCart(cartId);
    return cart.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  },

  async addItem(cartId, item) {
    if (!carts[cartId]) carts[cartId] = { id: cartId, items: [] };
    carts[cartId].items.push(item);
    return carts[cartId];
  }
};
`,
      // BUG: pricing.js already includes tax in the returned subtotal
      "utils/pricing.js": `const TAX_RATE = 0.1; // 10%

module.exports = {
  // Returns subtotal WITH tax already included
  applyTax(subtotal) {
    return subtotal * (1 + TAX_RATE);
  },

  applyDiscount(amount, discountPercent) {
    return amount * (1 - discountPercent / 100);
  },

  formatPrice(amount) {
    return parseFloat(amount.toFixed(2));
  }
};
`,
      // BUG IS HERE: checkoutService calls pricing.applyTax() — but then ALSO
      // multiplies by TAX_RATE again manually, doubling the tax
      "services/checkoutService.js": `const cartService = require('./cartService');
const pricing = require('../utils/pricing');
const TAX_RATE = 0.1;

const COUPONS = {
  'SAVE10': 10,
  'SAVE20': 20,
};

module.exports = {
  async calculateTotal(cartId, couponCode) {
    const subtotal = await cartService.getCartSubtotal(cartId);

    let discounted = subtotal;
    if (couponCode && COUPONS[couponCode]) {
      discounted = pricing.applyDiscount(subtotal, COUPONS[couponCode]);
    }

    // BUG: pricing.applyTax already adds 10% tax, but then we multiply again
    const withTax = pricing.applyTax(discounted);
    const total = pricing.formatPrice(withTax * (1 + TAX_RATE)); // tax applied TWICE

    return {
      subtotal: pricing.formatPrice(subtotal),
      discount: pricing.formatPrice(subtotal - discounted),
      tax: pricing.formatPrice(total - discounted),
      total,
    };
  },

  async completeCheckout(cartId, paymentMethod) {
    const totals = await this.calculateTotal(cartId, null);
    return {
      orderId: 'ord-' + Date.now(),
      cartId,
      paymentMethod,
      ...totals,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };
  }
};
`,
      "models/order.js": `module.exports = class Order {
  constructor({ orderId, cartId, total, status }) {
    this.orderId = orderId;
    this.cartId = cartId;
    this.total = total;
    this.status = status;
    this.createdAt = new Date();
  }
};
`,
      "utils/logger.js": `module.exports = {
  info: (msg, data) => console.log('[INFO]', msg, data || ''),
  error: (msg, err) => console.error('[ERROR]', msg, err?.message || err),
};
`,
    },
    task: {
      title: "Checkout total is always higher than it should be",
      description: "Customers are complaining that the total at checkout is higher than expected. For a cart with 2x Widget ($25) and 1x Gadget ($49.99), the subtotal should be $99.99. With 10% tax it should be $109.99. But the checkout is showing $120.99. No coupons applied. This started happening recently and it's affecting all orders. Please find and fix the calculation bug.",
      priority: "high",
    },
  },

  // ── 3. API response shape bug ───────────────────────────────────────────────
  // server.js → routes/products.js → controllers/productController.js
  //   → services/productService.js → repositories/productRepository.js
  // Bug: repository returns snake_case (product_name, created_at),
  // controller maps to camelCase but misses one field (imageUrl → image_url sent raw)
  // Frontend gets undefined for product images. Symptom: "product images not showing"
  {
    name: "api",
    description: "Product images not showing on frontend — field name mismatch across 4-layer API",
    files: {
      "package.json": JSON.stringify({ name: "product-api", version: "1.0.0" }, null, 2),
      "server.js": `const express = require('express');
const productRoutes = require('./routes/products');
const categoryRoutes = require('./routes/categories');
const app = express();
app.use(express.json());
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.listen(5000, () => console.log('API on :5000'));
module.exports = app;
`,
      "routes/products.js": `const express = require('express');
const router = express.Router();
const controller = require('../controllers/productController');

router.get('/', controller.listProducts);
router.get('/:id', controller.getProduct);
router.post('/', controller.createProduct);
router.put('/:id', controller.updateProduct);
router.delete('/:id', controller.deleteProduct);

module.exports = router;
`,
      "routes/categories.js": `const express = require('express');
const router = express.Router();
router.get('/', (req, res) => res.json([{ id: 1, name: 'Electronics' }]));
module.exports = router;
`,
      "controllers/productController.js": `const productService = require('../services/productService');

// Maps internal DB shape to API response shape
function formatProduct(p) {
  return {
    id: p.id,
    name: p.product_name,          // snake → camel
    description: p.description,
    price: p.price,
    stock: p.stock_count,           // snake → camel
    category: p.category_id,
    imageUrl: p.image_url,          // BUG: should be imageUrl but returns as image_url from DB
                                    // frontend expects "imageUrl" — this maps correctly
    createdAt: p.created_at,        // snake → camel
    updatedAt: p.updated_at,
  };
}

module.exports = {
  async listProducts(req, res) {
    try {
      const products = await productService.getAllProducts();
      res.json(products.map(formatProduct));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getProduct(req, res) {
    try {
      const product = await productService.getProductById(req.params.id);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      res.json(formatProduct(product));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async createProduct(req, res) {
    try {
      const product = await productService.createProduct(req.body);
      res.status(201).json(formatProduct(product));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async updateProduct(req, res) {
    try {
      const product = await productService.updateProduct(req.params.id, req.body);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      res.json(formatProduct(product));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async deleteProduct(req, res) {
    try {
      await productService.deleteProduct(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
};
`,
      "services/productService.js": `const productRepository = require('../repositories/productRepository');
const { validateProduct } = require('../utils/validators');

module.exports = {
  async getAllProducts(filters = {}) {
    return productRepository.findAll(filters);
  },

  async getProductById(id) {
    return productRepository.findById(id);
  },

  async createProduct(data) {
    validateProduct(data);
    return productRepository.create(data);
  },

  async updateProduct(id, data) {
    return productRepository.update(id, data);
  },

  async deleteProduct(id) {
    return productRepository.delete(id);
  }
};
`,
      // BUG IS HERE: repository returns "image_url" but the controller's formatProduct
      // reads p.image_url which IS correct... wait — the actual bug is the repository
      // stores and returns the field as "photo_url" internally but the rest of the
      // app calls it "image_url". So p.image_url is always undefined.
      "repositories/productRepository.js": `// Simulates a database that stores products with a legacy schema
// Legacy column name is "photo_url" — was renamed to "image_url" in the UI layer
// but the repository was never updated to match.

const products = [
  {
    id: '1',
    product_name: 'Wireless Headphones',
    description: 'Premium noise-cancelling headphones',
    price: 149.99,
    stock_count: 50,
    category_id: 1,
    photo_url: 'https://cdn.example.com/headphones.jpg', // BUG: should be image_url
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
  {
    id: '2',
    product_name: 'Mechanical Keyboard',
    description: 'RGB mechanical gaming keyboard',
    price: 89.99,
    stock_count: 120,
    category_id: 1,
    photo_url: 'https://cdn.example.com/keyboard.jpg', // BUG: should be image_url
    created_at: '2024-01-16T10:00:00Z',
    updated_at: '2024-01-16T10:00:00Z',
  },
];

module.exports = {
  async findAll() {
    return [...products];
  },

  async findById(id) {
    return products.find(p => p.id === id) || null;
  },

  async create(data) {
    const product = {
      id: String(products.length + 1),
      product_name: data.name,
      description: data.description || '',
      price: data.price,
      stock_count: data.stock || 0,
      category_id: data.category || 1,
      photo_url: data.imageUrl || null, // still using photo_url
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    products.push(product);
    return product;
  },

  async update(id, data) {
    const idx = products.findIndex(p => p.id === id);
    if (idx === -1) return null;
    products[idx] = { ...products[idx], ...data, updated_at: new Date().toISOString() };
    return products[idx];
  },

  async delete(id) {
    const idx = products.findIndex(p => p.id === id);
    if (idx !== -1) products.splice(idx, 1);
  }
};
`,
      "utils/validators.js": `function validateProduct(data) {
  if (!data.name) throw new Error('Product name is required');
  if (!data.price || data.price <= 0) throw new Error('Valid price is required');
}
module.exports = { validateProduct };
`,
      "middleware/errorHandler.js": `module.exports = (err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message });
};
`,
      "utils/cache.js": `const store = new Map();
module.exports = {
  get: (k) => store.get(k),
  set: (k, v, ttl) => { store.set(k, v); if (ttl) setTimeout(() => store.delete(k), ttl); },
  del: (k) => store.delete(k),
};
`,
    },
    task: {
      title: "Product images not showing on the website",
      description: "All product images are broken on the product listing page and the product detail page. The img src is coming back as undefined or null from the API. The images are definitely uploaded and the URLs are correct in the database. This is affecting all products. The frontend team says the API is returning imageUrl as null for every product. Please investigate the full data flow from database to API response and fix it.",
      priority: "high",
    },
  },

  // ── 4. Config propagation bug ───────────────────────────────────────────────
  // app.js → config/index.js → db/connection.js + mail/mailer.js + queue/worker.js
  // Bug: DB connection timeout in config is in seconds (5) but the DB driver
  // expects milliseconds — so timeout is effectively 5ms, causing silent
  // connection drops under load. Symptom: "database errors under heavy traffic"
  {
    name: "config",
    description: "DB drops connections under load — timeout in wrong units, buried in config layer",
    files: {
      "package.json": JSON.stringify({ name: "backend-service", version: "2.1.0" }, null, 2),
      "app.js": `const express = require('express');
const { initDb } = require('./db/connection');
const { initMailer } = require('./mail/mailer');
const { startWorker } = require('./queue/worker');
const config = require('./config');
const routes = require('./routes');

async function bootstrap() {
  await initDb(config.db);
  await initMailer(config.mail);
  startWorker(config.queue);

  const app = express();
  app.use(express.json());
  app.use('/api', routes);
  app.listen(config.port, () => console.log('App on :' + config.port));
}

bootstrap().catch(console.error);
module.exports = { bootstrap };
`,
      // BUG IS HERE: connectTimeoutMS is 5 — should be 5000 (milliseconds)
      // All other configs look fine, making this easy to miss
      "config/index.js": `module.exports = {
  port: parseInt(process.env.PORT || '3000'),
  env: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    name: process.env.DB_NAME || 'appdb',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'secret',
    pool: {
      min: 2,
      max: 10,
      idleTimeoutMillis: 30000,   // correct: 30 seconds in ms
      connectTimeoutMS: 5,        // BUG: should be 5000 — this is 5ms, not 5 seconds
    }
  },

  mail: {
    host: process.env.MAIL_HOST || 'smtp.mailtrap.io',
    port: parseInt(process.env.MAIL_PORT || '587'),
    user: process.env.MAIL_USER || '',
    pass: process.env.MAIL_PASS || '',
    from: process.env.MAIL_FROM || 'noreply@app.com',
    timeoutMs: 10000,  // correct: 10 seconds in ms
  },

  queue: {
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '3'),
    retryDelayMs: 2000,   // correct: 2 seconds in ms
    maxRetries: 3,
  },

  cache: {
    ttlSeconds: 300,
    maxItems: 1000,
  }
};
`,
      "db/connection.js": `const config_store = {};

module.exports = {
  async initDb(dbConfig) {
    // Simulate DB pool initialization with the provided config
    config_store.db = dbConfig;
    console.log('[db] Pool initialized with connectTimeoutMS:', dbConfig.pool.connectTimeoutMS);
    // If connectTimeoutMS is < 100, connections will drop under any real load
    if (dbConfig.pool.connectTimeoutMS < 100) {
      console.warn('[db] WARNING: connectTimeoutMS is very low — connections may drop under load');
    }
  },

  async query(sql, params) {
    const timeout = config_store.db?.pool?.connectTimeoutMS || 5000;
    if (timeout < 100) {
      throw new Error('Connection timeout: connectTimeoutMS too low (' + timeout + 'ms)');
    }
    return { rows: [], rowCount: 0 };
  },

  getPool() {
    return config_store.db;
  }
};
`,
      "db/migrations/001_init.sql": `CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER REFERENCES users(id),
  expires_at TIMESTAMP NOT NULL
);
`,
      "mail/mailer.js": `const config_store = {};

module.exports = {
  async initMailer(mailConfig) {
    config_store.mail = mailConfig;
    console.log('[mail] Mailer initialized, timeout:', mailConfig.timeoutMs + 'ms');
  },

  async send({ to, subject, body }) {
    console.log('[mail] Sending to', to, ':', subject);
    return { messageId: 'msg-' + Date.now() };
  }
};
`,
      "queue/worker.js": `const config_store = {};

module.exports = {
  startWorker(queueConfig) {
    config_store.queue = queueConfig;
    console.log('[queue] Worker started, concurrency:', queueConfig.concurrency);
  },

  async enqueue(job) {
    console.log('[queue] Job enqueued:', job.type);
  }
};
`,
      "routes/index.js": `const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');

router.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

router.get('/users', async (req, res) => {
  try {
    const result = await query('SELECT * FROM users');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
`,
      "utils/retry.js": `async function withRetry(fn, maxRetries = 3, delayMs = 1000) {
  let lastErr;
  for (let i = 0; i < maxRetries; i++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}
module.exports = { withRetry };
`,
      "utils/logger.js": `const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const current = levels[process.env.LOG_LEVEL] ?? levels.info;
module.exports = {
  error: (m, d) => current >= 0 && console.error('[ERROR]', m, d || ''),
  warn:  (m, d) => current >= 1 && console.warn('[WARN]',  m, d || ''),
  info:  (m, d) => current >= 2 && console.log('[INFO]',   m, d || ''),
  debug: (m, d) => current >= 3 && console.log('[DEBUG]',  m, d || ''),
};
`,
    },
    task: {
      title: "Database connection errors under traffic",
      description: "The app works fine with low traffic but starts throwing database connection timeout errors when more than a few users are active at the same time. The error is 'Connection timeout: connectTimeoutMS too low'. The DB server itself is healthy — this looks like a configuration issue somewhere in our app. We haven't changed the database server. Please trace through the config and connection setup to find and fix the root cause.",
      priority: "high",
    },
  },

  // ── 5. Middleware ordering bug ──────────────────────────────────────────────
  // app.js registers middleware in wrong order: router runs before auth sets req.user
  // routes/protected.js reads req.user → always undefined → 403 on every request
  // Symptom: "all API requests return 403 even with valid token"
  {
    name: "middleware",
    description: "All authenticated routes return 403 — middleware registered in wrong order in app.js",
    files: {
      "package.json": JSON.stringify({ name: "api-server", version: "1.0.0" }, null, 2),
      // BUG IS HERE: router is registered BEFORE authMiddleware in the middleware chain
      // So when protected routes run, req.user is never set by authMiddleware
      "app.js": `const express = require('express');
const authMiddleware = require('./middleware/authMiddleware');
const requestLogger = require('./middleware/requestLogger');
const rateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const publicRoutes = require('./routes/public');
const protectedRoutes = require('./routes/protected');
const adminRoutes = require('./routes/admin');

const app = express();

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(requestLogger);

// Rate limiting
app.use(rateLimiter);

// Public routes (no auth needed)
app.use('/api/public', publicRoutes);
app.use('/api/auth', require('./routes/auth'));

// BUG: protected routes registered BEFORE authMiddleware is applied
// req.user will always be undefined when these handlers run
app.use('/api', protectedRoutes);
app.use('/api/admin', adminRoutes);

// Auth middleware — too late, routes already registered above
app.use(authMiddleware);

// Error handler
app.use(errorHandler);

app.listen(3000, () => console.log('Server on :3000'));
module.exports = app;
`,
      "middleware/authMiddleware.js": `const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'dev-secret';

module.exports = function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, SECRET);
    req.user = payload; // sets req.user for downstream handlers
    next();
  } catch {
    req.user = null;
    next();
  }
};
`,
      "middleware/requestLogger.js": `module.exports = function requestLogger(req, res, next) {
  console.log('[' + new Date().toISOString() + ']', req.method, req.path);
  next();
};
`,
      "middleware/rateLimiter.js": `const counts = new Map();
module.exports = function rateLimiter(req, res, next) {
  const ip = req.ip || 'unknown';
  const count = (counts.get(ip) || 0) + 1;
  counts.set(ip, count);
  if (count > 1000) return res.status(429).json({ error: 'Too many requests' });
  next();
};
`,
      "middleware/errorHandler.js": `module.exports = function errorHandler(err, req, res, next) {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ error: err.message });
};
`,
      "routes/public.js": `const express = require('express');
const router = express.Router();
router.get('/health', (req, res) => res.json({ status: 'ok' }));
router.get('/products', (req, res) => res.json([{ id: 1, name: 'Widget' }]));
module.exports = router;
`,
      "routes/auth.js": `const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'dev-secret';

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (email === 'user@test.com' && password === 'password') {
    const token = jwt.sign({ userId: '1', email, role: 'user' }, SECRET, { expiresIn: '1h' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

module.exports = router;
`,
      "routes/protected.js": `const express = require('express');
const router = express.Router();

// All these routes expect req.user to be set by authMiddleware
router.get('/me', (req, res) => {
  if (!req.user) return res.status(403).json({ error: 'Not authenticated' });
  res.json({ user: req.user });
});

router.get('/dashboard', (req, res) => {
  if (!req.user) return res.status(403).json({ error: 'Not authenticated' });
  res.json({ message: 'Welcome to dashboard', user: req.user });
});

router.post('/orders', (req, res) => {
  if (!req.user) return res.status(403).json({ error: 'Not authenticated' });
  res.status(201).json({ orderId: 'ord-' + Date.now(), userId: req.user.userId });
});

router.get('/orders', (req, res) => {
  if (!req.user) return res.status(403).json({ error: 'Not authenticated' });
  res.json({ orders: [], userId: req.user.userId });
});

module.exports = router;
`,
      "routes/admin.js": `const express = require('express');
const router = express.Router();

router.get('/users', (req, res) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  res.json({ users: [] });
});

module.exports = router;
`,
      "services/userService.js": `module.exports = {
  async getUserById(id) {
    return { id, email: 'user@test.com', role: 'user', name: 'Test User' };
  },
  async updateUser(id, data) {
    return { id, ...data };
  }
};
`,
      "utils/response.js": `exports.success = (res, data, status = 200) => res.status(status).json({ success: true, data });
exports.error = (res, message, status = 400) => res.status(status).json({ success: false, error: message });
`,
    },
    task: {
      title: "All API calls returning 403 even with valid token",
      description: "After the recent server refactor, every authenticated API endpoint is returning 403 'Not authenticated', even when a valid JWT token is sent in the Authorization header. Public routes like /api/public/health still work fine. The login endpoint works and returns a valid token. But any request to /api/me, /api/dashboard, or /api/orders with that token returns 403 immediately. The token is valid — we verified it with jwt.io. Something in the middleware or routing setup is broken. Please investigate and fix.",
      priority: "high",
    },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(prefix, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${prefix}] ${msg}`);
}

async function apiFetch(urlPath, options = {}) {
  const fetch = (await import("node-fetch")).default;
  const url = `${SERVER_URL}/api${urlPath}`;
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`${res.status} ${url}: ${JSON.stringify(body)}`);
  return body;
}

async function login() {
  const data = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
  });
  return { token: data.token, workspaceId: data.workspaceId };
}

async function createTestProject(jwt, workspaceId, name) {
  return apiFetch(`/workspaces/${workspaceId}/projects`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ name: `complex-${name}-${Date.now()}`, require_approval: false }),
  });
}

async function deleteProject(jwt, projectId) {
  return apiFetch(`/projects/${projectId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${jwt}` },
  }).catch(() => {});
}

async function submitTask(projectToken, task) {
  const fetch = (await import("node-fetch")).default;
  const res = await fetch(`${SERVER_URL}/api/submit/${projectToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`submit failed: ${JSON.stringify(body)}`);
  return body;
}

async function pollTaskUntilDone(taskId, timeoutMs) {
  const fetch = (await import("node-fetch")).default;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`${SERVER_URL}/api/tasks/${taskId}/status`);
    const task = await res.json();
    log("poll", `task ${taskId.slice(0, 8)} → ${task.status}`);
    if (["done", "escalated", "failed"].includes(task.status)) return task;
  }
  throw new Error(`Timed out after ${timeoutMs / 1000}s`);
}

function createFiles(dir, files) {
  for (const [relPath, content] of Object.entries(files)) {
    const abs = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

function writeMcpJson(dir, wsToken) {
  fs.writeFileSync(path.join(dir, ".mcp.json"), JSON.stringify({
    mcpServers: {
      agentinbox: {
        command: "npx",
        args: ["-y", "agentinbox-mcp"],
        env: { AGENTINBOX_TOKEN: wsToken },
      },
    },
  }, null, 2));
}

function buildWorkerJs(wsToken) {
  return `const { io } = require("socket.io-client");
const { spawn, execSync } = require("child_process");
const { existsSync } = require("fs");

const TOKEN = "${wsToken}";
const SERVER_URL = "${SERVER_URL}";
const PROJECT_CWD = __dirname;

function findClaude() {
  try { execSync("claude --version", { stdio: "ignore" }); return "claude"; } catch {}
  const p = process.env.CLAUDE_PATH;
  if (p && existsSync(p)) return p;
  return "claude";
}

const CLAUDE_PATH = findClaude();
const TASK_PROMPT =
  "Check AgentInbox for pending tasks using get_pending_tasks. " +
  "For each pending task: call update_task_status(in_progress), call get_task for full details, " +
  "fix the issue in the codebase, then call complete_task with a technical summary and plain-English summary. " +
  "If no pending tasks, exit.";

let claudeRunning = false;

function spawnClaude() {
  if (claudeRunning) { console.log("[worker] Claude already running"); return; }
  claudeRunning = true;
  console.log("[worker] Waking Claude in " + PROJECT_CWD);
  const proc = spawn(CLAUDE_PATH, ["--dangerously-skip-permissions", "--print", TASK_PROMPT], {
    cwd: PROJECT_CWD, stdio: "inherit", detached: false
  });
  proc.on("error", (err) => { console.error("[worker] Failed: " + err.message); claudeRunning = false; });
  proc.on("close", (code) => { console.log("[worker] Claude exited (" + code + ")"); claudeRunning = false; });
}

const socket = io(SERVER_URL, {
  path: "/agent-socket",
  auth: { token: TOKEN },
  reconnection: true,
  reconnectionDelay: 5000,
  reconnectionAttempts: Infinity,
});

socket.on("connect", () => console.log("[worker] Connected to AgentInbox"));
socket.on("connected", (d) => console.log("[worker] Workspace: " + d.workspace_name));
socket.on("task.created", (p) => { console.log("[worker] Task: \\"" + p.title + "\\""); spawnClaude(); });
socket.on("connect_error", (e) => console.error("[worker] Error: " + e.message));
socket.on("disconnect", (r) => console.log("[worker] Disconnected: " + r));

setInterval(() => {}, 60000);
console.log("[worker] Starting...");
`;
}

// ── Run one scenario ──────────────────────────────────────────────────────────

async function runScenario(scenario, jwt, wsToken, wsId) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `aib-complex-${scenario.name}-`));
  let project = null;
  let workerProc = null;

  try {
    const fileCount = Object.keys(scenario.files).length;
    log(scenario.name, `Temp dir: ${dir} (${fileCount} files)`);

    createFiles(dir, scenario.files);
    execSync("npm install socket.io-client --save --loglevel=error", { cwd: dir, stdio: "pipe" });
    fs.writeFileSync(path.join(dir, "agentinbox-worker.js"), buildWorkerJs(wsToken));
    writeMcpJson(dir, wsToken);
    log(scenario.name, "Setup done");

    project = await createTestProject(jwt, wsId, scenario.name);
    log(scenario.name, `Project: ${project.id.slice(0, 8)}...`);

    const workerConnected = new Promise((resolve, reject) => {
      workerProc = spawn("node", ["agentinbox-worker.js"], {
        cwd: dir,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const onData = (chunk) => {
        const line = chunk.toString();
        process.stdout.write(`  [worker:${scenario.name}] ${line}`);
        if (line.includes("Connected to AgentInbox")) resolve();
      };
      workerProc.stdout.on("data", onData);
      workerProc.stderr.on("data", onData);
      workerProc.on("error", reject);
      workerProc.on("close", (code) => {
        if (code !== 0 && code !== null) reject(new Error(`Worker exited ${code}`));
      });
      setTimeout(() => reject(new Error("Worker did not connect within 30s")), 30000);
    });

    await workerConnected;
    log(scenario.name, "Worker connected!");

    const submitted = await submitTask(project.token, scenario.task);
    log(scenario.name, `Task submitted: ${submitted.id.slice(0, 8)}... — "${scenario.task.title}"`);

    log(scenario.name, `Polling (timeout: ${TASK_TIMEOUT_MS / 1000}s)...`);
    const result = await pollTaskUntilDone(submitted.id, TASK_TIMEOUT_MS);

    if (result.status === "done") {
      log(scenario.name, `✅ PASS`);
      log(scenario.name, `   Summary: ${result.summary_plain}`);
      return { scenario: scenario.name, passed: true, taskId: submitted.id, summary: result.summary_plain };
    } else {
      log(scenario.name, `❌ FAIL — status: ${result.status}`);
      return { scenario: scenario.name, passed: false, taskId: submitted.id, status: result.status };
    }
  } catch (err) {
    log(scenario.name, `❌ ERROR — ${err.message}`);
    return { scenario: scenario.name, passed: false, error: err.message };
  } finally {
    if (workerProc) { workerProc.kill(); }
    if (project) { await deleteProject(jwt, project.id); }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    log(scenario.name, "Cleaned up");
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== AgentInbox Complex Multi-File Bug Test ===");
  console.log(`Server: ${SERVER_URL}`);
  if (SINGLE) console.log(`Scenario: ${SINGLE}`);
  console.log("");

  const { token: jwt, workspaceId } = await login();
  log("auth", `Workspace: ${workspaceId}`);

  const tokenData = await apiFetch(`/workspaces/${workspaceId}/token`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const wsToken = tokenData.token;

  const scenarios = SINGLE
    ? SCENARIOS.filter((s) => s.name === SINGLE)
    : SCENARIOS;

  if (scenarios.length === 0) {
    console.error(`Unknown: ${SINGLE}. Available: ${SCENARIOS.map(s => s.name).join(", ")}`);
    process.exit(1);
  }

  const results = [];
  for (const scenario of scenarios) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`Scenario : ${scenario.name}`);
    console.log(`Bug type : ${scenario.description}`);
    console.log(`Task     : "${scenario.task.title}"`);
    console.log("─".repeat(60));
    results.push(await runScenario(scenario, jwt, wsToken, workspaceId));
  }

  console.log("\n" + "═".repeat(60));
  console.log("COMPLEX BUG TEST RESULTS");
  console.log("═".repeat(60));
  let passed = 0;
  for (const r of results) {
    const icon = r.passed ? "✅" : "❌";
    const detail = r.passed ? `"${r.summary}"` : `${r.status || "error"}: ${r.error || ""}`;
    console.log(`${icon} ${r.scenario.padEnd(12)} ${detail}`);
    if (r.passed) passed++;
  }
  console.log("─".repeat(60));
  console.log(`${passed}/${results.length} passed`);
  console.log("");

  if (passed < results.length) process.exit(1);
}

main().catch((err) => {
  console.error("\n[fatal]", err.message);
  process.exit(1);
});
