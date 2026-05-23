// ⚠️ OBRIGATÓRIO: dotenv DEVE ser a primeira linha para carregar as variáveis antes de qualquer uso
require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const { z } = require('zod');

const app = express();

// ─────────────────────────────────────────────
// 🔧 MIDDLEWARES
// ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// 🗄️ POOL DE CONEXÃO MYSQL
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

// ✅ Teste de conexão na inicialização
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅ Conexão MySQL estabelecida com sucesso!');
    conn.release();
  } catch (err) {
    console.error('❌ Falha na conexão MySQL:', err.message);
    console.error('💡 Verifique seu arquivo .env e se o MySQL está rodando.');
    process.exit(1);
  }
})();

// ─────────────────────────────────────────────
// 🛡️ SCHEMA DE VALIDAÇÃO (ZOD)
// ─────────────────────────────────────────────
const transactionSchema = z.object({
  description: z.string().min(1, 'Descrição é obrigatória').max(100, 'Máximo de 100 caracteres'),
  amount: z.number().positive('Valor deve ser positivo').min(0.01, 'Valor mínimo é R$ 0,01'),
  type: z.enum(['income', 'expense'], { errorMap: () => ({ message: 'Tipo deve ser income ou expense' }) }),
  category_id: z.number().int().positive().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD')
});

// ─────────────────────────────────────────────
// 📊 RESUMO FINANCEIRO (com filtros)
// ─────────────────────────────────────────────
app.get('/api/summary', async (req, res) => {
  try {
    const { year, month } = req.query;
    let whereClause = '';
    const params = [];

    if (year && month) {
      whereClause = 'WHERE YEAR(date) = ? AND MONTH(date) = ?';
      params.push(Number(year), Number(month));
    }

    const incomeQuery = `SELECT COALESCE(SUM(amount), 0) as total FROM transactions ${whereClause} ${whereClause ? 'AND' : 'WHERE'} type = 'income'`;
    const expenseQuery = `SELECT COALESCE(SUM(amount), 0) as total FROM transactions ${whereClause} ${whereClause ? 'AND' : 'WHERE'} type = 'expense'`;

    const [[inc]] = await pool.query(incomeQuery, params);
    const [[exp]] = await pool.query(expenseQuery, params);

    res.json({
      income: Number(inc.total),
      expense: Number(exp.total),
      balance: Number(inc.total) - Number(exp.total)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// 📈 DADOS PARA GRÁFICOS
// ─────────────────────────────────────────────
app.get('/api/chart-data', async (req, res) => {
  try {
    const { year, month } = req.query;
    let whereClause = '';
    const params = [];

    if (year && month) {
      whereClause = 'WHERE YEAR(date) = ? AND MONTH(date) = ?';
      params.push(Number(year), Number(month));
    }

    const [byCategory] = await pool.query(`
      SELECT c.name as category, t.type, SUM(t.amount) as total
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      ${whereClause}
      GROUP BY c.name, t.type
    `, params);

    const [monthly] = await pool.query(`
      SELECT DATE_FORMAT(date, '%Y-%m') as month, type, SUM(amount) as total
      FROM transactions
      ${whereClause}
      GROUP BY DATE_FORMAT(date, '%Y-%m'), type
      ORDER BY month DESC
      LIMIT 12
    `, params);

    res.json({ byCategory, monthly });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// 📂 CATEGORIAS
// ─────────────────────────────────────────────
app.get('/api/categories', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM categories ORDER BY type, name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// 📋 LISTAR TRANSAÇÕES (paginação + filtros)
// ─────────────────────────────────────────────
app.get('/api/transactions', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const { year, month } = req.query;

    let whereClause = '';
    const params = [];

    if (year && month) {
      whereClause = 'WHERE YEAR(t.date) = ? AND MONTH(t.date) = ?';
      params.push(Number(year), Number(month));
    }

    const [rows] = await pool.query(`
      SELECT t.id, t.description, t.amount, t.type, t.category_id, c.name as category, t.date
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
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
      pagination: {
        page,
        limit,
        total: Number(total),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// ➕ CRIAR TRANSAÇÃO
// ─────────────────────────────────────────────
app.post('/api/transactions', async (req, res) => {
  try {
    const validated = transactionSchema.parse(req.body);

    const [result] = await pool.query(
      'INSERT INTO transactions (description, amount, type, category_id, date) VALUES (?, ?, ?, ?, ?)',
      [validated.description, validated.amount, validated.type, validated.category_id, validated.date]
    );

    res.status(201).json({ id: result.insertId, message: 'Transação criada com sucesso' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ errors: err.errors.map(e => e.message) });
    }
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// ✏️ ATUALIZAR TRANSAÇÃO
// ─────────────────────────────────────────────
app.put('/api/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const validated = transactionSchema.parse(req.body);

    const [result] = await pool.query(
      'UPDATE transactions SET description = ?, amount = ?, type = ?, category_id = ?, date = ? WHERE id = ?',
      [validated.description, validated.amount, validated.type, validated.category_id, validated.date, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    res.json({ message: 'Transação atualizada com sucesso' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ errors: err.errors.map(e => e.message) });
    }
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// 🗑️ EXCLUIR TRANSAÇÃO
// ─────────────────────────────────────────────
app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM transactions WHERE id = ?', [req.params.id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    res.json({ message: 'Transação removida com sucesso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// 📥 EXPORTAR CSV
// ─────────────────────────────────────────────
app.get('/api/export', async (req, res) => {
  try {
    const { year, month } = req.query;
    let whereClause = '';
    const params = [];

    if (year && month) {
      whereClause = 'WHERE YEAR(t.date) = ? AND MONTH(t.date) = ?';
      params.push(Number(year), Number(month));
    }

    const [rows] = await pool.query(`
      SELECT t.date, t.description, c.name as category, t.type, t.amount
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      ${whereClause}
      ORDER BY t.date DESC
    `, params);

    const escapeCSV = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const csv = [
      'Data,Descricao,Categoria,Tipo,Valor',
      ...rows.map(r => `${r.date},${escapeCSV(r.description)},${escapeCSV(r.category)},${r.type},${r.amount}`)
    ].join('\n');

    const filename = `transacoes_${year || 'todos'}_${month || 'todos'}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv); // BOM UTF-8 para Excel abrir corretamente
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// ❌ MIDDLEWARE DE ERRO GLOBAL
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('💥 Erro não tratado:', err.stack);
  res.status(500).json({ error: 'Erro interno no servidor' });
});

// ─────────────────────────────────────────────
// 🚀 INICIAR SERVIDOR
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
  console.log(`📁 Ambiente: ${process.env.NODE_ENV || 'development'}`);
});