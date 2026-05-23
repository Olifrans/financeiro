require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const { z } = require('zod');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Pool de conexões
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'root',
  database: process.env.DB_NAME || 'financial_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Schema de validação
const transactionSchema = z.object({
  description: z.string().min(1, 'Descrição obrigatória').max(100),
  amount: z.number().positive('Valor deve ser positivo').min(0.01),
  type: z.enum(['income', 'expense']),
  category_id: z.number().int().positive().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
});

// 📊 Resumo com filtro por período
app.get('/api/summary', async (req, res) => {
  try {
    const { year, month } = req.query;
    let whereClause = '';
    const params = [];
    
    if (year && month) {
      whereClause = 'WHERE YEAR(date) = ? AND MONTH(date) = ?';
      params.push(year, month);
    }

    const [[inc]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions ${whereClause} AND type = 'income'`,
      params
    );
    const [[exp]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions ${whereClause} AND type = 'expense'`,
      params
    );
    
    res.json({ 
      income: inc.total, 
      expense: exp.total, 
      balance: inc.total - exp.total 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📊 Dados para gráficos
app.get('/api/chart-data', async (req, res) => {
  try {
    const { year, month } = req.query;
    let whereClause = '';
    const params = [];
    
    if (year && month) {
      whereClause = 'WHERE YEAR(date) = ? AND MONTH(date) = ?';
      params.push(year, month);
    }

    const [byCategory] = await pool.query(`
      SELECT c.name as category, t.type, SUM(t.amount) as total
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      ${whereClause}
      GROUP BY c.name, t.type
    `, params);

    const [monthly] = await pool.query(`
      SELECT 
        DATE_FORMAT(date, '%Y-%m') as month,
        type,
        SUM(amount) as total
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

// 📂 Categorias
app.get('/api/categories', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM categories ORDER BY type, name');
    res.json(rows);
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// 📥 Listar Transações com paginação e filtros
app.get('/api/transactions', async (req, res) => {
  try {
    const { page = 1, limit = 20, year, month } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = '';
    const params = [];
    
    if (year && month) {
      whereClause = 'WHERE YEAR(t.date) = ? AND MONTH(t.date) = ?';
      params.push(year, month);
    }

    const [rows] = await pool.query(`
      SELECT t.id, t.description, t.amount, t.type, t.category_id, 
             c.name as category, t.date
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      ${whereClause}
      ORDER BY t.date DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), parseInt(offset)]);
    
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM transactions t ${whereClause}`,
      params
    );
    
    res.json({ 
      transactions: rows, 
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// ➕ Criar Transação
app.post('/api/transactions', async (req, res) => {
  try {
    const validated = transactionSchema.parse(req.body);
    const [result] = await pool.query(
      'INSERT INTO transactions (description, amount, type, category_id, date) VALUES (?, ?, ?, ?, ?)',
      [validated.description, validated.amount, validated.type, validated.category_id, validated.date]
    );
    res.status(201).json({ id: result.insertId, message: 'Transação criada' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ errors: err.errors.map(e => e.message) });
    }
    res.status(500).json({ error: err.message });
  }
});

// ✏️ Atualizar Transação
app.put('/api/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const validated = transactionSchema.parse(req.body);
    
    await pool.query(
      'UPDATE transactions SET description = ?, amount = ?, type = ?, category_id = ?, date = ? WHERE id = ?',
      [validated.description, validated.amount, validated.type, validated.category_id, validated.date, id]
    );
    res.json({ message: 'Transação atualizada' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ errors: err.errors.map(e => e.message) });
    }
    res.status(500).json({ error: err.message });
  }
});

// 🗑️ Excluir Transação
app.delete('/api/transactions/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM transactions WHERE id = ?', [req.params.id]);
    res.json({ message: 'Transação removida' });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// 📥 Exportar CSV
app.get('/api/export', async (req, res) => {
  try {
    const { year, month } = req.query;
    let whereClause = '';
    const params = [];
    
    if (year && month) {
      whereClause = 'WHERE YEAR(t.date) = ? AND MONTH(t.date) = ?';
      params.push(year, month);
    }

    const [rows] = await pool.query(`
      SELECT t.date, t.description, c.name as category, t.type, t.amount
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      ${whereClause}
      ORDER BY t.date DESC
    `, params);

    const csv = [
      'Data,Descrição,Categoria,Tipo,Valor',
      ...rows.map(r => `${r.date},"${r.description}","${r.category || ''}",${r.type},${r.amount}`)
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=transacoes_${year || 'all'}_${month || 'all'}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Middleware de erro
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno no servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor rodando em http://localhost:${PORT}`));