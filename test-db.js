const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./stocknest.db', (err) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    return;
  }
  console.log('✅ Database connected successfully!');
  
  db.all("SELECT * FROM users", (err, rows) => {
    if (err) {
      console.error('Error:', err);
    } else {
      console.log('📊 Users:', rows);
    }
    db.close();
  });
});