const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const router = express.Router();

// Importe o pool do seu server.js ou crie um módulo compartilhado
// Para simplificar, assumimos que o pool é passado via app.locals ou importado
const getPool = () => require('../server').pool || global.pool;

const registerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido').toLowerCase(),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres')
});

const loginSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase(),
  password: z.string().min(1, 'Senha é obrigatória')
});

// ➕ REGISTRO
router.post('/register', async (req, res) => {
  try {
    const validated = registerSchema.parse(req.body);
    const pool = getPool();

    // Verifica se email já existe
    const [[existing]] = await pool.query(
      'SELECT id FROM users WHERE email = ?', [validated.email]
    );
    if (existing) {
      return res.status(409).json({ error: 'Este email já está cadastrado' });
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(validated.password, 12);

    // Cria usuário
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [validated.name, validated.email, passwordHash]
    );

    const userId = result.insertId;

    // Cria categorias padrão para o novo usuário
    const defaultCategories = [
      ['Salário', 'income'], ['Freelance', 'income'], ['Investimentos', 'income'],
      ['Aluguel', 'expense'], ['Alimentação', 'expense'], ['Transporte', 'expense'],
      ['Lazer', 'expense'], ['Saúde', 'expense'], ['Educação', 'expense']
    ];
    for (const [name, type] of defaultCategories) {
      await pool.query(
        'INSERT INTO categories (user_id, name, type) VALUES (?, ?, ?)',
        [userId, name, type]
      );
    }

    // Cria conta padrão
    await pool.query(
      'INSERT INTO accounts (user_id, name, type, initial_balance) VALUES (?, ?, ?, ?)',
      [userId, 'Conta Principal', 'checking', 0]
    );

    res.status(201).json({ message: 'Usuário criado com sucesso!', userId });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ errors: err.errors.map(e => e.message) });
    }
    res.status(500).json({ error: err.message });
  }
});

// 🔑 LOGIN
router.post('/login', async (req, res) => {
  try {
    const validated = loginSchema.parse(req.body);
    const pool = getPool();
    const { generateToken } = require('../middleware/auth');

    const [[user]] = await pool.query(
      'SELECT id, name, email, password_hash FROM users WHERE email = ?',
      [validated.email]
    );

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const isValidPassword = await bcrypt.compare(validated.password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = generateToken(user);

    // Define cookie httpOnly (seguro contra XSS)
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias
    });

    res.json({
      token, // Também retorna no body para apps mobile
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ errors: err.errors.map(e => e.message) });
    }
    res.status(500).json({ error: err.message });
  }
});

// 🚪 LOGOUT
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logout realizado' });
});

// 👤 PERFIL DO USUÁRIO
router.get('/me', require('../middleware/auth').verifyToken, async (req, res) => {
  try {
    const pool = getPool();
    const [[user]] = await pool.query(
      'SELECT id, name, email, created_at FROM users WHERE id = ?',
      [req.userId]
    );
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;