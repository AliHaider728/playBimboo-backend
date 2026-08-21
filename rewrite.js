const fs = require('fs');
let code = fs.readFileSync('src/server.ts.bak', 'utf8'); // assuming we make a backup

code = code.replace(/import \{ connectToDatabase \} from '\.\/lib\/database\.js';\n/g, '');
code = code.replace(/import categoryRoutes.*?\n/g, '');
code = code.replace(/import productRoutes.*?\n/g, '');
code = code.replace(/import orderRoutes.*?\n/g, '');
code = code.replace(/import couponRoutes.*?\n/g, '');
code = code.replace(/import settingsRoutes.*?\n/g, '');
code = code.replace(/import reviewRoutes.*?\n/g, '');
code = code.replace(/import authRoutes.*?\n/g, '');
code = code.replace(/import seedRoutes.*?\n/g, '');
code = code.replace(/import contactRoutes.*?\n/g, '');
code = code.replace(/import \{ pool \} from '\.\/mysql-lib\/db\.js';\n/g, ''); // in case it's there
code = code.replace(/import mysqlContactRoutes/g, "import { pool } from './mysql-lib/db.js';\nimport mysqlContactRoutes");

code = code.replace(/const requireDatabaseConnection = [\s\S]*?};\n\n/g, '');
code = code.replace(/app\.use\('\/api\/.*?', requireDatabaseConnection, .*?Routes\);\n/g, '');
code = code.replace(/app\.use\('\/api\/seed', requireDatabaseConnection, seedRoutes\);\n/g, '');

code = code.replace(/app\.use\('\/api\/mysql-test\//g, "app.use('/api/");

code = code.replace(/let dbStatus = 'disconnected';[\s\S]*?res\.json\(\{/g, "let dbStatus = 'disconnected';\n  try {\n    await pool.execute('SELECT 1');\n    dbStatus = 'connected (MySQL)';\n  } catch {\n    dbStatus = 'error';\n  }\n\n  res.json({");
code = code.replace(/message: 'PlayBimboo API Backend is running'/g, "message: 'PlayBimboo API Backend is running (MySQL)'");

code = code.replace(/const mongoose = await connectToDatabase\(\);\n    \/\/ Run migration once per boot when DB is reachable/g, "await pool.execute('SELECT 1');");
code = code.replace(/dbConnected: mongoose\.connection\.readyState === 1/g, "dbConnected: true");

code = code.replace(/const mongoose = await connectToDatabase\(\);[\s\S]*?db\.collection\('users'\)\.countDocuments\(\)\n        \]\);/g, 
  "await pool.execute('SELECT 1');\n        const [[{ count: products }]] = await pool.execute('SELECT COUNT(*) as count FROM products');\n        const [[{ count: reviews }]] = await pool.execute('SELECT COUNT(*) as count FROM reviews');\n        const [[{ count: orders }]] = await pool.execute('SELECT COUNT(*) as count FROM orders');\n        const [[{ count: categories }]] = await pool.execute('SELECT COUNT(*) as count FROM categories');\n        const [[{ count: coupons }]] = await pool.execute('SELECT COUNT(*) as count FROM coupons');\n        const [[{ count: users }]] = await pool.execute('SELECT COUNT(*) as count FROM users');");

code = code.replace(/Database: CONNECTED \(\\\$\{dbName\}\)/g, "Database: CONNECTED (MySQL)");
fs.writeFileSync('src/server.ts', code);
