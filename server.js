require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Conexão com pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || '3.33.132.188:',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'root',
  database: process.env.DB_NAME || 'financial_db',
  waitForConnections: true,
  connectionLimit: 10
});

// 📊 Resumo
app.get('/api/summary', async (req, res) => {
  try {
    const [[inc]] = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = "income"');
    const [[exp]] = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = "expense"');
    res.json({ income: inc.total, expense: exp.total, balance: inc.total - exp.total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📂 Categorias
app.get('/api/categories', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM categories');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 📥 Listar Transações
app.get('/api/transactions', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT t.id, t.description, t.amount, t.type, c.name as category, t.date
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      ORDER BY t.date DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ➕ Criar Transação
app.post('/api/transactions', async (req, res) => {
  const { description, amount, type, category_id, date } = req.body;
  if (!description || !amount || !type || !date) return res.status(400).json({ error: 'Campos obrigatórios' });

  try {
    const [result] = await pool.query(
      'INSERT INTO transactions (description, amount, type, category_id, date) VALUES (?, ?, ?, ?, ?)',
      [description, parseFloat(amount), type, category_id || null, date]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🗑️ Excluir Transação
app.delete('/api/transactions/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM transactions WHERE id = ?', [req.params.id]);
    res.json({ message: 'Transação removida' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Tratamento de erros genérico
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno no servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor rodando em http://localhost:${PORT}`));