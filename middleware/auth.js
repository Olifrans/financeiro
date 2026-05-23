const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  throw new Error('❌ JWT_SECRET não definido no .env! O servidor não pode iniciar sem esta variável.');
}

module.exports = {
  /**
   * Gera um token JWT assinado
   */
  generateToken(user) {
    return jwt.sign(
      { id: user.id, email: user.email },
      SECRET,
      { expiresIn: '7d' }
    );
  },

  /**
   * Verifica o token e injeta req.userId
   * Suporta Bearer token no header OU cookie httpOnly
   */
  verifyToken(req, res, next) {
    let token = null;

    // Prioridade 1: Header Authorization
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    // Prioridade 2: Cookie httpOnly (mais seguro para web)
    if (!token && req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
    }

    try {
      const decoded = jwt.verify(token, SECRET);
      req.userId = decoded.id;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Token inválido ou expirado. Faça login novamente.' });
    }
  }
};