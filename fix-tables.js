const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./stocknest.db');

console.log('🔧 Creating missing tables...\n');

// Create warehouses table
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
`, function(err) {
  if (err) {
    console.log('❌ Warehouses error:', err.message);
  } else {
    console.log('✅ Warehouses table created');
  }
});

// Create products table
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
`, function(err) {
  if (err) {
    console.log('❌ Products error:', err.message);
  } else {
    console.log('✅ Products table created');
  }
});

setTimeout(() => {
  console.log('\n✅ Done! Tables created.');
  console.log('📊 Now you can add warehouses and products.');
  db.close();
}, 1000);