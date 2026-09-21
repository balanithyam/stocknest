const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

// ✅ FORCE INDIA STANDARD TIME (IST)
process.env.TZ = 'Asia/Kolkata';

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'stocknest_secret_key_2024';

// ============================================================
// SQLITE DATABASE SETUP
// ============================================================

const db = new sqlite3.Database('./stocknest.db', (err) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
  } else {
    console.log('✅ Connected to SQLite database');
    initializeDatabase();
  }
});

function initializeDatabase() {
  console.log('🔧 Creating database tables...');

  // Drop existing tables (clean start)
  db.run(`DROP TABLE IF EXISTS quality_checks`);
  db.run(`DROP TABLE IF EXISTS audit_log`);
  db.run(`DROP TABLE IF EXISTS stock_movements`);
  db.run(`DROP TABLE IF EXISTS products`);
  db.run(`DROP TABLE IF EXISTS warehouses`);
  db.run(`DROP TABLE IF EXISTS users`);
  db.run(`DROP TABLE IF EXISTS ai_chat_history`);

  // Create tables
  setTimeout(() => {
    // 1. USERS TABLE
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'viewer' CHECK (role IN ('manager', 'viewer', 'auditor')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        is_active TEXT DEFAULT 'Y'
      )
    `, (err) => {
      if (err) console.error('❌ Users error:', err.message);
      else console.log('✅ Users table created');
    });

    // 2. WAREHOUSES TABLE
    db.run(`
      CREATE TABLE IF NOT EXISTS warehouses (
        warehouse_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        location TEXT NOT NULL,
        capacity INTEGER NOT NULL,
        used INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(user_id)
      )
    `, (err) => {
      if (err) console.error('❌ Warehouses error:', err.message);
      else console.log('✅ Warehouses table created');
    });

    // 3. PRODUCTS TABLE
    db.run(`
      CREATE TABLE IF NOT EXISTS products (
        product_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sku TEXT UNIQUE NOT NULL,
        qty INTEGER DEFAULT 0,
        warehouse_id INTEGER REFERENCES warehouses(warehouse_id),
        min_stock_level INTEGER DEFAULT 3,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(user_id),
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_by INTEGER REFERENCES users(user_id)
      )
    `, (err) => {
      if (err) console.error('❌ Products error:', err.message);
      else console.log('✅ Products table created');
    });

    // 4. STOCK MOVEMENTS TABLE
    db.run(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        movement_id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER REFERENCES products(product_id),
        movement_type TEXT CHECK (movement_type IN ('RECEIVE', 'SHIP')),
        quantity REAL NOT NULL,
        movement_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        performed_by INTEGER REFERENCES users(user_id),
        notes TEXT
      )
    `, (err) => {
      if (err) console.error('❌ Stock movements error:', err.message);
      else console.log('✅ Stock movements table created');
    });

    // 5. AUDIT LOG TABLE
    db.run(`
      CREATE TABLE IF NOT EXISTS audit_log (
        audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(user_id),
        action_type TEXT,
        action_details TEXT,
        action_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        ip_address TEXT
      )
    `, (err) => {
      if (err) console.error('❌ Audit log error:', err.message);
      else console.log('✅ Audit log table created');
    });

    // 6. QUALITY CHECKS TABLE
    db.run(`
      CREATE TABLE IF NOT EXISTS quality_checks (
        check_id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER REFERENCES products(product_id),
        user_id INTEGER REFERENCES users(user_id),
        status TEXT CHECK (status IN ('PASS', 'FAIL', 'PENDING')),
        notes TEXT,
        image_url TEXT,
        check_date DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('❌ Quality checks error:', err.message);
      else console.log('✅ Quality checks table created');
    });

    // 7. AI CHAT HISTORY TABLE
    db.run(`
      CREATE TABLE IF NOT EXISTS ai_chat_history (
        chat_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(user_id),
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        chat_date DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('❌ AI Chat History error:', err.message);
      else console.log('✅ AI Chat History table created');
    });

    console.log('✅ Database tables created successfully!');
    console.log('📊 Database is ready - Please register first user');
  }, 500);
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function runSingle(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function runUpdate(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function logAudit(userId, actionType, details, ipAddress = '127.0.0.1') {
  db.run(
    `INSERT INTO audit_log (user_id, action_type, action_details, ip_address) 
     VALUES (?, ?, ?, ?)`,
    [userId, actionType, details, ipAddress]
  );
}

// ✅ HELPER: Update warehouse used count
async function updateWarehouseUsed(warehouseId) {
  if (!warehouseId) return;
  await runUpdate(
    `UPDATE warehouses 
     SET used = (
       SELECT COALESCE(SUM(qty), 0) FROM products WHERE warehouse_id = ?
     )
     WHERE warehouse_id = ?`,
    [warehouseId, warehouseId]
  );
}

// ============================================================
// AUTH ROUTES
// ============================================================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, username, email, password, role } = req.body;

    console.log('📝 Registration attempt:', { fullName, username, email, role });

    const existing = await runSingle(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existing) {
      return res.status(400).json({ 
        message: 'Username or email already exists' 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await runUpdate(
      `INSERT INTO users (full_name, username, email, password_hash, role) 
       VALUES (?, ?, ?, ?, ?)`,
      [fullName, username, email, hashedPassword, role || 'viewer']
    );

    console.log('✅ User created with ID:', result.lastID);

    logAudit(result.lastID, 'REGISTER', `User ${fullName} registered as ${role || 'viewer'}`);

    res.status(201).json({ 
      message: 'Registration successful! Please login.',
      userId: result.lastID
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    console.log('🔐 Login attempt:', { username });

    const user = await runSingle(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );

    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    // ✅ UPDATE LAST LOGIN WITH IST
    await runUpdate(
      `UPDATE users SET last_login = datetime('now', '+5 hours', '+30 minutes') WHERE user_id = ?`,
      [user.user_id]
    );

    logAudit(user.user_id, 'LOGIN', `User ${username} logged in`);

    // ✅ Get updated user with IST time
    const updatedUser = await runSingle(
      `SELECT 
        user_id, 
        full_name, 
        username, 
        email, 
        role,
        datetime(last_login, '+5 hours', '+30 minutes') as last_login
      FROM users 
      WHERE user_id = ?`,
      [user.user_id]
    );

    const token = jwt.sign(
      { userId: user.user_id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: updatedUser.user_id,
        fullName: updatedUser.full_name,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role,
        lastLogin: updatedUser.last_login
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// ============================================================
// MIDDLEWARE
// ============================================================

function authenticate(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

function checkPermission(required) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role) return res.status(401).json({ message: 'Unauthorized' });

    const permissions = {
      manager: ['view', 'edit', 'delete', 'manage_users'],
      viewer: ['view'],
      auditor: ['view', 'audit']
    };

    if (required === 'edit' && !permissions[role]?.includes('edit')) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    if (required === 'manage_users' && role !== 'manager') {
      return res.status(403).json({ message: 'Only managers can manage users' });
    }

    next();
  };
}

// ============================================================
// DASHBOARD ROUTES
// ============================================================

app.get('/api/dashboard/stats', authenticate, async (req, res) => {
  try {
    const totalProducts = await runSingle('SELECT COUNT(*) as count FROM products');
    const lowStock = await runSingle('SELECT COUNT(*) as count FROM products WHERE qty < 3');
    const totalWarehouses = await runSingle('SELECT COUNT(*) as count FROM warehouses');
    const totalStock = await runSingle('SELECT SUM(qty) as total FROM products');
    const monthlyMovements = await runSingle(
      `SELECT ROUND(SUM(quantity), 1) as total FROM stock_movements 
       WHERE strftime('%m', movement_date) = strftime('%m', 'now')`
    );

    const totalStockValue = totalStock?.total || 0;
    const warehouseCount = totalWarehouses?.count || 1;
    const avgStock = warehouseCount > 0 ? Math.round(totalStockValue / warehouseCount) : 0;

    res.json({
      TOTAL_PRODUCTS: totalProducts?.count || 0,
      LOW_STOCK_ALERTS: lowStock?.count || 0,
      TOTAL_WAREHOUSES: warehouseCount,
      MONTHLY_MOVEMENTS: monthlyMovements?.total || 0,
      TOTAL_STOCK: totalStockValue,
      AVG_STOCK: avgStock
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/dashboard/movements', authenticate, async (req, res) => {
  try {
    const movements = await runQuery(`
      SELECT 
        strftime('%m', movement_date) as month_num,
        CASE strftime('%m', movement_date)
          WHEN '01' THEN 'Jan'
          WHEN '02' THEN 'Feb'
          WHEN '03' THEN 'Mar'
          WHEN '04' THEN 'Apr'
          WHEN '05' THEN 'May'
          WHEN '06' THEN 'Jun'
          WHEN '07' THEN 'Jul'
          WHEN '08' THEN 'Aug'
          WHEN '09' THEN 'Sep'
          WHEN '10' THEN 'Oct'
          WHEN '11' THEN 'Nov'
          WHEN '12' THEN 'Dec'
        END as month,
        SUM(CASE WHEN movement_type = 'RECEIVE' THEN quantity ELSE 0 END) as received,
        SUM(CASE WHEN movement_type = 'SHIP' THEN quantity ELSE 0 END) as shipped
      FROM stock_movements
      WHERE movement_date >= date('now', '-6 months')
      GROUP BY month_num
      ORDER BY month_num
    `);
    res.json(movements);
  } catch (error) {
    console.error('Movements error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// PRODUCTS ROUTES
// ============================================================

app.get('/api/products', authenticate, async (req, res) => {
  try {
    const products = await runQuery(`
      SELECT 
        p.product_id,
        p.name,
        p.sku,
        p.qty,
        p.min_stock_level,
        w.name as warehouse,
        w.warehouse_id,
        CASE 
          WHEN p.qty = 0 THEN 'Critical'
          WHEN p.qty < p.min_stock_level THEN 'Low'
          ELSE 'OK'
        END as status
      FROM products p
      JOIN warehouses w ON p.warehouse_id = w.warehouse_id
      ORDER BY p.name
    `);
    res.json(products);
  } catch (error) {
    console.error('Products error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/products', authenticate, checkPermission('edit'), async (req, res) => {
  try {
    const { name, sku, qty, warehouseId } = req.body;
    const userId = req.user.userId;

    const existing = await runSingle('SELECT * FROM products WHERE sku = ?', [sku]);
    if (existing) {
      return res.status(400).json({ message: 'SKU already exists' });
    }

    await runUpdate(
      `INSERT INTO products (name, sku, qty, warehouse_id, created_by, updated_by) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, sku, qty || 0, warehouseId, userId, userId]
    );

    // ✅ UPDATE WAREHOUSE USED COUNT
    await updateWarehouseUsed(warehouseId);

    logAudit(userId, 'ADD_PRODUCT', `Added product: ${name} (SKU: ${sku})`);

    io.emit('product-update', { type: 'ADD', name });
    io.emit('warehouse-update');

    res.json({ message: 'Product added successfully' });

  } catch (error) {
    console.error('Add product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/products/:id', authenticate, checkPermission('edit'), async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.user.userId;

    const product = await runSingle('SELECT name, warehouse_id FROM products WHERE product_id = ?', [productId]);
    const productName = product?.name || 'Unknown';
    const warehouseId = product?.warehouse_id;

    const movements = await runSingle(
      'SELECT COUNT(*) as count FROM stock_movements WHERE product_id = ?',
      [productId]
    );

    if (movements?.count > 0) {
      return res.status(400).json({ message: 'Cannot delete product with movement history' });
    }

    await runUpdate(
      'DELETE FROM products WHERE product_id = ?',
      [productId]
    );

    // ✅ UPDATE WAREHOUSE USED COUNT
    if (warehouseId) {
      await updateWarehouseUsed(warehouseId);
    }

    logAudit(userId, 'DELETE_PRODUCT', `Deleted product: ${productName} (ID: ${productId})`);

    io.emit('product-delete', { productId });
    io.emit('warehouse-update');

    res.json({ message: 'Product deleted successfully' });

  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// WAREHOUSES ROUTES
// ============================================================

app.get('/api/warehouses', authenticate, async (req, res) => {
  try {
    const warehouses = await runQuery(`
      SELECT 
        w.warehouse_id,
        w.name,
        w.location,
        w.capacity,
        w.used,
        w.capacity - w.used as available,
        ROUND((w.used * 100.0) / w.capacity, 2) as utilization_percent
      FROM warehouses w
      ORDER BY w.name
    `);
    res.json(warehouses);
  } catch (error) {
    console.error('Warehouses error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/warehouses', authenticate, checkPermission('edit'), async (req, res) => {
  try {
    const { name, location, capacity } = req.body;
    const userId = req.user.userId;

    console.log('🏢 Adding warehouse:', { name, location, capacity, userId });

    const user = await runSingle('SELECT user_id FROM users WHERE user_id = ?', [userId]);
    if (!user) {
      return res.status(400).json({ message: 'User not found. Please login again.' });
    }

    const result = await runUpdate(
      `INSERT INTO warehouses (name, location, capacity, used, created_by) 
       VALUES (?, ?, ?, 0, ?)`,
      [name.trim(), location.trim(), parseInt(capacity) || 100, userId]
    );

    console.log('✅ Warehouse added with ID:', result.lastID);

    logAudit(userId, 'ADD_WAREHOUSE', `Added warehouse: ${name} (Location: ${location})`);

    io.emit('warehouse-update', { type: 'ADD', name });

    res.json({ 
      message: 'Warehouse added successfully!',
      warehouseId: result.lastID 
    });

  } catch (error) {
    console.error('❌ Add warehouse error:', error);
    res.status(500).json({ 
      message: 'Error adding warehouse: ' + error.message 
    });
  }
});

app.delete('/api/warehouses/:id', authenticate, checkPermission('edit'), async (req, res) => {
  try {
    const warehouseId = req.params.id;
    const userId = req.user.userId;

    const warehouse = await runSingle('SELECT name FROM warehouses WHERE warehouse_id = ?', [warehouseId]);
    const warehouseName = warehouse?.name || 'Unknown';

    const products = await runSingle(
      'SELECT COUNT(*) as count FROM products WHERE warehouse_id = ?',
      [warehouseId]
    );

    if (products?.count > 0) {
      return res.status(400).json({ message: 'Cannot delete warehouse with products' });
    }

    await runUpdate(
      'DELETE FROM warehouses WHERE warehouse_id = ?',
      [warehouseId]
    );

    logAudit(userId, 'DELETE_WAREHOUSE', `Deleted warehouse: ${warehouseName} (ID: ${warehouseId})`);

    io.emit('warehouse-delete', { warehouseId });

    res.json({ message: 'Warehouse deleted successfully' });

  } catch (error) {
    console.error('Delete warehouse error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// STOCK MOVEMENTS ROUTES
// ============================================================

app.get('/api/movements', authenticate, async (req, res) => {
  try {
    const movements = await runQuery(`
      SELECT 
        CASE strftime('%m', movement_date)
          WHEN '01' THEN 'Jan' WHEN '02' THEN 'Feb' WHEN '03' THEN 'Mar'
          WHEN '04' THEN 'Apr' WHEN '05' THEN 'May' WHEN '06' THEN 'Jun'
          WHEN '07' THEN 'Jul' WHEN '08' THEN 'Aug' WHEN '09' THEN 'Sep'
          WHEN '10' THEN 'Oct' WHEN '11' THEN 'Nov' WHEN '12' THEN 'Dec'
        END as month,
        SUM(CASE WHEN movement_type = 'RECEIVE' THEN quantity ELSE 0 END) as received,
        SUM(CASE WHEN movement_type = 'SHIP' THEN quantity ELSE 0 END) as shipped,
        SUM(CASE WHEN movement_type = 'RECEIVE' THEN quantity ELSE 0 END) - 
        SUM(CASE WHEN movement_type = 'SHIP' THEN quantity ELSE 0 END) as net
      FROM stock_movements
      WHERE movement_date >= date('now', '-6 months')
      GROUP BY month
      ORDER BY month
    `);
    res.json(movements);
  } catch (error) {
    console.error('Movements error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/stock/receive', authenticate, checkPermission('edit'), async (req, res) => {
  try {
    const { productId, quantity, notes, batchNumber, supplier } = req.body;
    const userId = req.user.userId;

    const product = await runSingle('SELECT name, warehouse_id FROM products WHERE product_id = ?', [productId]);
    const productName = product?.name || 'Unknown';
    const warehouseId = product?.warehouse_id;

    await runUpdate(
      `UPDATE products 
       SET qty = qty + ?,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = ?
       WHERE product_id = ?`,
      [quantity, userId, productId]
    );

    // ✅ UPDATE WAREHOUSE USED COUNT
    if (warehouseId) {
      await updateWarehouseUsed(warehouseId);
    }

    await runUpdate(
      `INSERT INTO stock_movements (product_id, movement_type, quantity, performed_by, notes) 
       VALUES (?, 'RECEIVE', ?, ?, ?)`,
      [productId, quantity, userId, notes || `Batch: ${batchNumber || 'N/A'}, Supplier: ${supplier || 'N/A'}`]
    );

    logAudit(userId, 'RECEIVE', `Received ${quantity} units of ${productName} (ID: ${productId})`);

    io.emit('stock-update', { type: 'RECEIVE', productId, quantity });
    io.emit('warehouse-update');

    res.json({ message: 'Stock received successfully' });

  } catch (error) {
    console.error('Receive error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/stock/ship', authenticate, checkPermission('edit'), async (req, res) => {
  try {
    const { productId, quantity, notes, orderNumber, customer } = req.body;
    const userId = req.user.userId;

    const product = await runSingle('SELECT name, warehouse_id FROM products WHERE product_id = ?', [productId]);
    const productName = product?.name || 'Unknown';
    const warehouseId = product?.warehouse_id;

    const currentStock = await runSingle(
      'SELECT qty FROM products WHERE product_id = ?',
      [productId]
    );

    if (!currentStock || currentStock.qty < quantity) {
      return res.status(400).json({ message: 'Insufficient stock' });
    }

    await runUpdate(
      `UPDATE products 
       SET qty = qty - ?,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = ?
       WHERE product_id = ?`,
      [quantity, userId, productId]
    );

    // ✅ UPDATE WAREHOUSE USED COUNT
    if (warehouseId) {
      await updateWarehouseUsed(warehouseId);
    }

    await runUpdate(
      `INSERT INTO stock_movements (product_id, movement_type, quantity, performed_by, notes) 
       VALUES (?, 'SHIP', ?, ?, ?)`,
      [productId, quantity, userId, notes || `Order: ${orderNumber || 'N/A'}, Customer: ${customer || 'N/A'}`]
    );

    logAudit(userId, 'SHIP', `Shipped ${quantity} units of ${productName} (ID: ${productId})`);

    io.emit('stock-update', { type: 'SHIP', productId, quantity });
    io.emit('warehouse-update');

    res.json({ message: 'Stock shipped successfully' });

  } catch (error) {
    console.error('Ship error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// USER MANAGEMENT ROUTES
// ============================================================

app.get('/api/users', authenticate, checkPermission('manage_users'), async (req, res) => {
  try {
    const users = await runQuery(`
      SELECT 
        user_id, 
        full_name, 
        username, 
        email, 
        role, 
        datetime(last_login, '+5 hours', '+30 minutes') as last_login,
        created_at
      FROM users
      ORDER BY created_at DESC
    `);
    res.json(users);
  } catch (error) {
    console.error('Users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// AUDIT LOG ROUTES
// ============================================================

app.get('/api/audit', authenticate, checkPermission('manage_users'), async (req, res) => {
  try {
    const audit = await runQuery(`
      SELECT 
        a.audit_id,
        u.username,
        a.action_type,
        a.action_details,
        a.action_date,
        a.ip_address
      FROM audit_log a
      JOIN users u ON a.user_id = u.user_id
      ORDER BY a.action_date DESC
    `);
    res.json(audit);
  } catch (error) {
    console.error('Audit error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// QUALITY CHECKS ROUTES
// ============================================================

app.post('/api/quality/check', authenticate, async (req, res) => {
  try {
    const { productId, status, notes, imageUrl } = req.body;
    const userId = req.user.userId;

    await runUpdate(
      `INSERT INTO quality_checks (product_id, user_id, status, notes, image_url) 
       VALUES (?, ?, ?, ?, ?)`,
      [productId, userId, status, notes, imageUrl]
    );

    logAudit(userId, 'QUALITY_CHECK', `Quality check for product ${productId}: ${status}`);

    res.json({ message: 'Quality check recorded successfully' });

  } catch (error) {
    console.error('Quality check error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/quality/checks', authenticate, async (req, res) => {
  try {
    const checks = await runQuery(`
      SELECT 
        q.*,
        p.name as product_name,
        u.username as performed_by
      FROM quality_checks q
      JOIN products p ON q.product_id = p.product_id
      JOIN users u ON q.user_id = u.user_id
      ORDER BY q.check_date DESC
    `);
    res.json(checks);
  } catch (error) {
    console.error('Quality checks error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/ai/ask', authenticate, async (req, res) => {
  try {
    const { question } = req.body;
    const userId = req.user.userId;

    if (!question || question.trim().length < 1) {
      return res.status(400).json({ 
        message: 'Please ask a valid question' 
      });
    }

    const lowerQuestion = question.toLowerCase().trim();
    let response = '';
    let queryType = '';

    // ============================================================
    // 1. GREETING / HELP QUERIES (FIRST PRIORITY)
    // ============================================================
    const greetingPatterns = /^(hi|hello|hey|greetings|good morning|good afternoon|good evening|howdy|yo|sup|heya|hola|namaste|vanakkam)$/i;
    
    if (greetingPatterns.test(question.trim()) || question.trim().length < 4) {
      const hour = new Date().getHours();
      let timeGreeting = 'Hello';
      if (hour < 12) timeGreeting = 'Good Morning 🌅';
      else if (hour < 17) timeGreeting = 'Good Afternoon ☀️';
      else timeGreeting = 'Good Evening 🌙';
      
      response = `${timeGreeting}! 👋 I'm your StockNest AI Assistant. Ask me anything about your warehouse!`;
      queryType = 'greeting';
      
      await runUpdate(
        `INSERT INTO ai_chat_history (user_id, question, answer) VALUES (?, ?, ?)`,
        [userId, question, response]
      );
      
      logAudit(userId, 'AI_QUERY', `Greeting: "${question}"`);
      return res.json({
        question,
        response,
        type: queryType,
        timestamp: new Date().toISOString()
      });
    }

    // ============================================================
    // 2. HELP QUERIES
    // ============================================================
    if (lowerQuestion.includes('help') || lowerQuestion.includes('what can you do') || 
        lowerQuestion.includes('how to') || lowerQuestion.includes('?')) {
      response = `👋 I'm your StockNest AI Assistant!\n\n💡 Ask me anything about your warehouse, inventory, products, or any data in this application!\n\n📦 Try asking:\n• "Show me low stock items"\n• "Warehouse utilization"\n• "Stock of Widget A"\n• "Give me an overview"`;
      queryType = 'help';
      
      await runUpdate(
        `INSERT INTO ai_chat_history (user_id, question, answer) VALUES (?, ?, ?)`,
        [userId, question, response]
      );
      logAudit(userId, 'AI_QUERY', `Help: "${question}"`);
      return res.json({
        question,
        response,
        type: queryType,
        timestamp: new Date().toISOString()
      });
    }

    // ============================================================
    // 3. PRODUCT QUERIES
    // ============================================================
    const productPatterns = [
      /stock of\s+([\w\s]+)/i,
      /quantity of\s+([\w\s]+)/i,
      /what is the stock of\s+([\w\s]+)/i,
      /how many\s+([\w\s]+)/i,
      /check\s+([\w\s]+)/i,
      /show me\s+([\w\s]+)/i,
      /tell me about\s+([\w\s]+)/i,
      /product\s+([\w\s]+)/i,
      /item\s+([\w\s]+)/i
    ];

    let productName = '';
    let foundProduct = false;

    for (const pattern of productPatterns) {
      const match = question.match(pattern);
      if (match) {
        productName = match[1].trim();
        foundProduct = true;
        break;
      }
    }

    if (!foundProduct && (lowerQuestion.includes('product') || lowerQuestion.includes('item'))) {
      productName = question
        .replace(/what|is|the|stock|of|quantity|about|show|me|tell|check|for|product|item|inventory/g, '')
        .trim();
      if (productName.length > 1) foundProduct = true;
    }

    if (foundProduct && productName.length > 1) {
      const product = await runSingle(`
        SELECT p.*, w.name as warehouse_name 
        FROM products p
        JOIN warehouses w ON p.warehouse_id = w.warehouse_id
        WHERE LOWER(p.name) LIKE ?
      `, [`%${productName.toLowerCase()}%`]);
      
      if (product) {
        const status = product.qty === 0 ? 'CRITICAL' : 
                      product.qty < product.min_stock_level ? 'LOW' : 'OK';
        response = `📦 **${product.name}** (${product.sku})\n\n` +
                  `• Quantity: ${product.qty} units\n` +
                  `• Min Stock Level: ${product.min_stock_level}\n` +
                  `• Status: **${status}**\n` +
                  `• Warehouse: ${product.warehouse_name}`;
        queryType = 'product_search';
        
        await runUpdate(
          `INSERT INTO ai_chat_history (user_id, question, answer) VALUES (?, ?, ?)`,
          [userId, question, response]
        );
        
        logAudit(userId, 'AI_QUERY', `Question: "${question}" -> Product: ${product.name}`);
        return res.json({
          question,
          response,
          type: queryType,
          timestamp: new Date().toISOString()
        });
      } else {
        const allProducts = await runQuery(`
          SELECT name, sku, qty, min_stock_level FROM products ORDER BY name
        `);
        if (allProducts.length > 0) {
          const productList = allProducts.map(p => 
            `• ${p.name} (${p.sku}): ${p.qty} units`
          ).join('\n');
          response = `🔍 I couldn't find "${productName}" specifically.\n\n📦 **All Products in Inventory:**\n\n${productList}\n\n💡 Try searching with a specific product name.`;
        } else {
          response = `🔍 I couldn't find "${productName}".\n\n📦 No products found in inventory. Please add products first.`;
        }
        queryType = 'product_list';
        
        await runUpdate(
          `INSERT INTO ai_chat_history (user_id, question, answer) VALUES (?, ?, ?)`,
          [userId, question, response]
        );
        
        return res.json({
          question,
          response,
          type: queryType,
          timestamp: new Date().toISOString()
        });
      }
    }

    // ============================================================
    // 4. LOW STOCK QUERIES
    // ============================================================
    if (lowerQuestion.includes('low') || lowerQuestion.includes('critical') || 
        lowerQuestion.includes('alert') || lowerQuestion.includes('warning') ||
        lowerQuestion.includes('reorder') || lowerQuestion.includes('restock')) {
      const lowStock = await runQuery(`
        SELECT name, sku, qty, min_stock_level,
          CASE 
            WHEN qty = 0 THEN 'CRITICAL'
            WHEN qty < min_stock_level THEN 'LOW'
            ELSE 'OK'
          END as status
        FROM products 
        WHERE qty < min_stock_level
        ORDER BY qty ASC
      `);
      
      if (lowStock.length === 0) {
        response = '✅ All products have healthy stock levels! No low stock alerts.';
      } else {
        const items = lowStock.map(p => 
          `• **${p.name}** (${p.sku}): ${p.qty} units - ${p.status}`
        ).join('\n');
        response = `⚠️ **Low Stock Alert:**\n\n${items}\n\n📌 Please reorder these items immediately.`;
      }
      queryType = 'low_stock';
      
      await runUpdate(
        `INSERT INTO ai_chat_history (user_id, question, answer) VALUES (?, ?, ?)`,
        [userId, question, response]
      );
    }

    // ============================================================
    // 5. WAREHOUSE QUERIES
    // ============================================================
    else if (lowerQuestion.includes('warehouse') || lowerQuestion.includes('storage') || 
             lowerQuestion.includes('location') || lowerQuestion.includes('facility')) {
      
      if (lowerQuestion.includes('utilization') || lowerQuestion.includes('used') || 
          lowerQuestion.includes('capacity') || lowerQuestion.includes('space') ||
          lowerQuestion.includes('full') || lowerQuestion.includes('available')) {
        
        const warehouses = await runQuery(`
          SELECT 
            name,
            location,
            capacity,
            used,
            capacity - used as available,
            ROUND((used * 100.0) / capacity, 2) as utilization
          FROM warehouses
          ORDER BY utilization DESC
        `);
        
        if (warehouses.length === 0) {
          response = '🏢 No warehouses found. Please add warehouses first.';
        } else {
          const summary = warehouses.map(w => 
            `• **${w.name}** (${w.location}): ${w.utilization}% used (${w.used}/${w.capacity}) - ${w.available} available`
          ).join('\n');
          
          const avgUtil = warehouses.reduce((sum, w) => sum + parseFloat(w.utilization || 0), 0) / warehouses.length;
          response = `🏢 **Warehouse Utilization**\n\n${summary}\n\n📊 Average Utilization: ${avgUtil.toFixed(1)}%`;
        }
        queryType = 'warehouse_utilization';
      } else if (lowerQuestion.includes('list') || lowerQuestion.includes('all')) {
        const warehouses = await runQuery(`
          SELECT warehouse_id, name, location, capacity FROM warehouses ORDER BY name
        `);
        if (warehouses.length === 0) {
          response = '🏢 No warehouses found. Please add warehouses first.';
        } else {
          const list = warehouses.map(w => 
            `• **${w.name}** (${w.location}) - Capacity: ${w.capacity}`
          ).join('\n');
          response = `🏢 **All Warehouses**\n\n${list}`;
        }
        queryType = 'warehouse_list';
      } else {
        const count = await runSingle('SELECT COUNT(*) as count FROM warehouses');
        const totalCapacity = await runSingle('SELECT SUM(capacity) as total FROM warehouses');
        response = `🏢 **Warehouse Summary**\n\n` +
                  `• Total Warehouses: ${count?.count || 0}\n` +
                  `• Total Capacity: ${totalCapacity?.total || 0} units\n\n` +
                  `💡 Ask about "warehouse utilization" or "list all warehouses" for more details.`;
        queryType = 'warehouse_summary';
      }
      
      await runUpdate(
        `INSERT INTO ai_chat_history (user_id, question, answer) VALUES (?, ?, ?)`,
        [userId, question, response]
      );
    }

    // ============================================================
    // 6. STOCK MOVEMENT QUERIES
    // ============================================================
    else if (lowerQuestion.includes('movement') || lowerQuestion.includes('received') || 
             lowerQuestion.includes('shipped') || lowerQuestion.includes('trend') ||
             lowerQuestion.includes('transaction') || lowerQuestion.includes('transfer')) {
      const movements = await runQuery(`
        SELECT 
          CASE strftime('%m', movement_date)
            WHEN '01' THEN 'Jan' WHEN '02' THEN 'Feb' WHEN '03' THEN 'Mar'
            WHEN '04' THEN 'Apr' WHEN '05' THEN 'May' WHEN '06' THEN 'Jun'
            WHEN '07' THEN 'Jul' WHEN '08' THEN 'Aug' WHEN '09' THEN 'Sep'
            WHEN '10' THEN 'Oct' WHEN '11' THEN 'Nov' WHEN '12' THEN 'Dec'
          END as month,
          SUM(CASE WHEN movement_type = 'RECEIVE' THEN quantity ELSE 0 END) as received,
          SUM(CASE WHEN movement_type = 'SHIP' THEN quantity ELSE 0 END) as shipped
        FROM stock_movements
        WHERE movement_date >= date('now', '-6 months')
        GROUP BY month
        ORDER BY MIN(movement_date)
        LIMIT 6
      `);
      
      if (movements.length === 0) {
        response = '📊 No stock movements found. Start receiving or shipping stock to see trends.';
      } else {
        const summary = movements.map(m => 
          `• **${m.month}**: Received ${m.received || 0}, Shipped ${m.shipped || 0}`
        ).join('\n');
        
        const totalReceived = movements.reduce((s, m) => s + (m.received || 0), 0);
        const totalShipped = movements.reduce((s, m) => s + (m.shipped || 0), 0);
        
        response = `📈 **Stock Movement Trend**\n\n${summary}\n\n` +
                  `📊 Total Received: ${totalReceived}\n` +
                  `📊 Total Shipped: ${totalShipped}\n` +
                  `📊 Net Movement: ${totalReceived - totalShipped}`;
      }
      queryType = 'movement_trend';
      
      await runUpdate(
        `INSERT INTO ai_chat_history (user_id, question, answer) VALUES (?, ?, ?)`,
        [userId, question, response]
      );
    }

    // ============================================================
    // 7. SUMMARY / OVERVIEW QUERIES
    // ============================================================
    else if (lowerQuestion.includes('summary') || lowerQuestion.includes('overview') || 
             lowerQuestion.includes('dashboard') || lowerQuestion.includes('report') ||
             lowerQuestion.includes('statistics') || lowerQuestion.includes('stats') ||
             lowerQuestion.includes('total') || lowerQuestion.includes('count')) {
      
      const stats = await runSingle(`
        SELECT 
          (SELECT COUNT(*) FROM products) as total_products,
          (SELECT COUNT(*) FROM products WHERE qty < 3) as low_stock,
          (SELECT COUNT(*) FROM warehouses) as total_warehouses,
          (SELECT SUM(qty) FROM products) as total_stock,
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM stock_movements) as total_movements
      `);
      
      const totalMovements = await runSingle(`
        SELECT ROUND(SUM(quantity), 1) as total 
        FROM stock_movements 
        WHERE strftime('%m', movement_date) = strftime('%m', 'now')
      `);
      
      response = `📊 **Executive Summary**\n\n` +
                `📦 Total Products: ${stats?.total_products || 0}\n` +
                `⚠️ Low Stock Items: ${stats?.low_stock || 0}\n` +
                `🏢 Total Warehouses: ${stats?.total_warehouses || 0}\n` +
                `📦 Total Stock Units: ${stats?.total_stock || 0}\n` +
                `👤 Total Users: ${stats?.total_users || 0}\n` +
                `📊 Total Movements: ${stats?.total_movements || 0}\n` +
                `📈 Monthly Movements: ${totalMovements?.total || 0}`;
      queryType = 'summary';
      
      await runUpdate(
        `INSERT INTO ai_chat_history (user_id, question, answer) VALUES (?, ?, ?)`,
        [userId, question, response]
      );
    }

    // ============================================================
    // 8. USER QUERIES (Manager only)
    // ============================================================
    else if (lowerQuestion.includes('user') || lowerQuestion.includes('users') || 
             lowerQuestion.includes('admin') || lowerQuestion.includes('manager') || 
             lowerQuestion.includes('role') || lowerQuestion.includes('team')) {
      const userRole = req.user.role;
      if (userRole === 'manager') {
        const users = await runQuery(`
          SELECT full_name, username, email, role, last_login FROM users ORDER BY created_at DESC
        `);
        if (users.length === 0) {
          response = '👤 No users found.';
        } else {
          const list = users.map(u => 
            `• **${u.full_name}** (@${u.username}) - ${u.role} - Last login: ${u.last_login || 'Never'}`
          ).join('\n');
          response = `👤 **All Users**\n\n${list}`;
        }
      } else {
        response = '🔒 Only managers can view user information.';
      }
      queryType = 'users';
      
      await runUpdate(
        `INSERT INTO ai_chat_history (user_id, question, answer) VALUES (?, ?, ?)`,
        [userId, question, response]
      );
    }

    // ============================================================
    // 9. UNKNOWN QUERY - Try to help
    // ============================================================
    else {
      const allProducts = await runQuery(`
        SELECT name, sku, qty FROM products LIMIT 5
      `);
      
      if (allProducts.length > 0) {
        const productList = allProducts.map(p => 
          `• ${p.name} (${p.sku}): ${p.qty} units`
        ).join('\n');
        response = `🤔 I'm not sure about that.\n\n` +
                  `📦 **Here are some products in your inventory:**\n\n${productList}\n\n` +
                  `💡 Try asking:\n` +
                  `• "Stock of [product name]"\n` +
                  `• "Warehouse utilization"\n` +
                  `• "Give me an overview"\n` +
                  `• "Show me low stock items"`;
      } else {
        response = `🤔 I'm not sure about that.\n\n` +
                  `💡 Try asking:\n` +
                  `• "Show me low stock items"\n` +
                  `• "Warehouse utilization"\n` +
                  `• "Give me an overview"`;
      }
      queryType = 'unknown';
      
      await runUpdate(
        `INSERT INTO ai_chat_history (user_id, question, answer) VALUES (?, ?, ?)`,
        [userId, question, response]
      );
    }

    logAudit(userId, 'AI_QUERY', `Question: "${question}" -> Type: ${queryType}`);

    res.json({
      question,
      response,
      type: queryType,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('AI Assistant error:', error);
    res.status(500).json({ 
      message: 'I encountered an error. Please try again.' 
    });
  }
});

// ============================================================
// GET AI CHAT HISTORY
// ============================================================

app.get('/api/ai/history', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const history = await runQuery(`
      SELECT chat_id, question, answer, chat_date 
      FROM ai_chat_history 
      WHERE user_id = ? 
      ORDER BY chat_date DESC
    `, [userId]);
    
    res.json(history);
  } catch (error) {
    console.error('AI History error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// CLEAR AI CHAT HISTORY
// ============================================================

app.delete('/api/ai/history', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    await runUpdate(
      'DELETE FROM ai_chat_history WHERE user_id = ?',
      [userId]
    );
    
    res.json({ message: 'Chat history cleared successfully' });
  } catch (error) {
    console.error('Clear history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📊 Using SQLite database`);
  console.log(`🔗 http://localhost:${PORT}`);
  console.log(`🤖 AI Assistant endpoint: /api/ai/ask`);
  console.log(`👤 No default users - Register first!`);
});

process.on('SIGINT', () => {
  db.close(() => {
    console.log('📁 Database connection closed');
    process.exit(0);
  });
});