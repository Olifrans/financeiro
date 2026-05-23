// ⚠️ LINHA 1 ABSOLUTA
require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { verifyToken } = require('./middleware/auth');
const authRoutes = require('./routes/auth');

const app = express();

// ─────────────────────────────────────────────
// 🔒 SEGURANÇA
// ─────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // CSP desativado para servir static files
app.use(cookieParser());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true // Permite cookies cross-origin
}));

// Rate limiting global
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' }
});
app.use('/api/', limiter);

// Rate limiting específico para auth (mais restritivo)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas de login. Aguarde 15 minutos.' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// 🗄️ POOL MYSQL
// ─────────────────────────────────────────────
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'root',
  database: process.env.DB_NAME || 'financial_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Exporta pool para uso nos routes
global.pool = pool;

// Teste de conexão
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MySQL conectado');
    conn.release();
  } catch (err) {
    console.error('❌ Falha MySQL:', err.message);
    process.exit(1);
  }
})();

// ─────────────────────────────────────────────
// 🛣️ ROTAS PÚBLICAS
// ─────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─────────────────────────────────────────────
// 🔐 ROTAS PROTEGIDAS (todas exigem JWT)
// ─────────────────────────────────────────────
app.use('/api/transactions', verifyToken);
app.use('/api/categories', verifyToken);
app.use('/api/accounts', verifyToken);
app.use('/api/budgets', verifyToken);
app.use('/api/goals', verifyToken);
app.use('/api/summary', verifyToken);
app.use('/api/chart-data', verifyToken);
app.use('/api/export', verifyToken);

// ═══════════════════════════════════════════════
// EXEMPLO: Transações agora filtram por user_id
// ═══════════════════════════════════════════════
app.get('/api/transactions', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const { year, month, account_id } = req.query;

    let conditions = ['t.user_id = ?'];
    const params = [req.userId]; // ← SEMPRE filtra pelo usuário logado

    if (year && month) {
      conditions.push('YEAR(t.date) = ? AND MONTH(t.date) = ?');
      params.push(Number(year), Number(month));
    }
    if (account_id) {
      conditions.push('t.account_id = ?');
      params.push(Number(account_id));
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const [rows] = await pool.query(`
      SELECT t.id, t.description, t.amount, t.type, t.category_id, t.account_id,
             c.name as category, a.name as account, t.date
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      ${whereClause}
      ORDER BY t.date DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM transactions t ${whereClause}`,
      params
    );

    res.json({
      transactions: rows,
      pagination: { page, limit, total: Number(total), pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/transactions também DEVE incluir user_id e validar budget
app.post('/api/transactions', async (req, res) => {
  const transactionSchema = z.object({
    description: z.string().min(1).max(100),
    amount: z.number().positive().min(0.01),
    type: z.enum(['income', 'expense']),
    category_id: z.number().int().positive().nullable(),
    account_id: z.number().int().positive().nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  });

  try {
    const validated = transactionSchema.parse(req.body);

    const [result] = await pool.query(
      `INSERT INTO transactions (user_id, account_id, category_id, description, amount, type, date) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, validated.account_id, validated.category_id, 
       validated.description, validated.amount, validated.type, validated.date]
    );

    // 🔔 Verifica orçamento excedido (apenas para despesas)
    let budgetAlert = null;
    if (validated.type === 'expense' && validated.category_id) {
      const [[budget]] = await pool.query(
        'SELECT month_limit FROM budgets WHERE user_id = ? AND category_id = ?',
        [req.userId, validated.category_id]
      );
      if (budget) {
        const [[spent]] = await pool.query(
          `SELECT COALESCE(SUM(amount),0) as total FROM transactions 
           WHERE user_id = ? AND category_id = ? AND type='expense' 
           AND YEAR(date)=YEAR(?) AND MONTH(date)=MONTH(?)`,
          [req.userId, validated.category_id, validated.date, validated.date]
        );
        const pct = (Number(spent.total) / Number(budget.month_limit)) * 100;
        if (pct >= 100) budgetAlert = { level: 'exceeded', percentage: Math.round(pct) };
        else if (pct >= 80) budgetAlert = { level: 'warning', percentage: Math.round(pct) };
      }
    }

    res.status(201).json({ 
      id: result.insertId, 
      message: 'Transação criada',
      budgetAlert 
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ errors: err.errors.map(e => e.message) });
    }
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// ❌ ERRO GLOBAL
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('💥', err.stack);
  res.status(500).json({ error: 'Erro interno no servidor' });
});

// ─────────────────────────────────────────────
// 🚀 START
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
  console.log(`📁 Ambiente: ${process.env.NODE_ENV || 'development'}`);
});