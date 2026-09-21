const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./stocknest.db');

console.log('🔍 Checking Database...\n');

// 1. Check all tables
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
  if (err) {
    console.log('❌ Error reading tables:', err.message);
    db.close();
    return;
  }
  
  console.log('📊 Tables in database:');
  if (tables.length === 0) {
    console.log('  (No tables found - database is empty)');
  } else {
    tables.forEach(t => console.log('  -', t.name));
  }
  console.log('');

  // 2. Check users
  db.all('SELECT user_id, username, email, role, created_at FROM users', (err, users) => {
    if (err) {
      console.log('❌ Users table error:', err.message);
      console.log('📌 Please restart server to create tables\n');
    } else if (users.length === 0) {
      console.log('👤 No users found');
      console.log('📌 Please register a user first\n');
    } else {
      console.log('👤 Users:');
      console.table(users);
    }
    console.log('');

    // 3. Check warehouses
    db.all('SELECT warehouse_id, name, location, capacity, used FROM warehouses', (err, warehouses) => {
      if (err) {
        console.log('❌ Warehouses table error:', err.message);
      } else if (warehouses.length === 0) {
        console.log('🏢 No warehouses found');
      } else {
        console.log('🏢 Warehouses:');
        console.table(warehouses);
      }
      console.log('');

      // 4. Check products
      db.all('SELECT product_id, name, sku, qty, warehouse_id FROM products', (err, products) => {
        if (err) {
          console.log('❌ Products table error:', err.message);
        } else if (products.length === 0) {
          console.log('📦 No products found');
        } else {
          console.log('📦 Products:');
          console.table(products);
        }
        console.log('');

        // 5. Check stock movements
        db.all('SELECT movement_id, product_id, movement_type, quantity FROM stock_movements', (err, movements) => {
          if (err) {
            console.log('❌ Stock movements table error:', err.message);
          } else if (movements.length === 0) {
            console.log('📊 No stock movements found');
          } else {
            console.log('📊 Stock Movements:');
            console.table(movements);
          }
          console.log('');
          
          console.log('✅ Database check complete!');
          db.close();
        });
      });
    });
  });
});