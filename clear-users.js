// clear-users.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'stocknest.db');
const db = new sqlite3.Database(dbPath);

console.log('🔍 Connecting to database...');

db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
  if (err) {
    console.error('❌ Error checking users:', err.message);
    db.close();
    return;
  }
  console.log(`📊 Found ${row.count} user(s) in database`);
  
  if (row.count === 0) {
    console.log('✅ No users to delete. Database is already clean!');
    db.close();
    return;
  }
  
  // Show current users
  db.all("SELECT user_id, username, email, role FROM users", (err, users) => {
    if (err) {
      console.error('❌ Error fetching users:', err.message);
      db.close();
      return;
    }
    console.log('\n👤 Current users:');
    console.table(users);
    
    // Confirm deletion
    console.log('\n⚠️  WARNING: This will delete ALL users!');
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...');
    
    setTimeout(() => {
      // Delete all users
      db.run('DELETE FROM users', function(err) {
        if (err) {
          console.error('❌ Error deleting users:', err.message);
          db.close();
          return;
        }
        console.log(`✅ Deleted ${this.changes} user(s)`);
        
        // Reset auto-increment
        db.run("DELETE FROM sqlite_sequence WHERE name='users'", function(err) {
          if (err) {
            console.error('❌ Error resetting sequence:', err.message);
          } else {
            console.log('✅ User ID sequence reset');
          }
          
          // Verify deletion
          db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
            if (err) {
              console.error('❌ Error verifying:', err.message);
            } else {
              console.log(`📊 Users remaining: ${row.count}`);
              console.log('✅ All users deleted successfully!');
            }
            db.close();
          });
        });
      });
    }, 5000);
  });
});