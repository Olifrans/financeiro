'use strict';

// ─────────────────────────────────────────────
// 🔧 CONFIG & UTILS
// ─────────────────────────────────────────────
const API = '/api/auth';

const showToast = (message, type = 'success') => {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || ''} ${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease-out forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
};

// Verifica se já está logado → redireciona para dashboard
(async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.ok) window.location.href = '/index.html';
  } catch {}
})();

// ─────────────────────────────────────────────
// 🎨 TEMA
// ─────────────────────────────────────────────
const savedTheme = localStorage.getItem('theme') || 'light';
document.body.setAttribute('data-theme', savedTheme);

document.getElementById('theme-toggle-auth')?.addEventListener('click', () => {
  const current = document.body.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  document.body.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

// ─────────────────────────────────────────────
// 🔄 ALTERNÂNCIA DE ABAS
// ─────────────────────────────────────────────
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    // Atualiza abas
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Atualiza formulários
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    document.getElementById(`${tab.dataset.tab}-form`).classList.add('active');
  });
});

// ─────────────────────────────────────────────
// 👁️ TOGGLE SENHA
// ─────────────────────────────────────────────
document.querySelectorAll('.toggle-pass').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    btn.textContent = isPassword ? '🙈' : '👁️';
  });
});

// ─────────────────────────────────────────────
// 🔑 LOGIN
// ─────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  
  btn.disabled = true;
  btn.textContent = '⏳ Entrando...';

  try {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // ← ESSENCIAL para cookies httpOnly
      body: JSON.stringify({
        email: document.getElementById('login-email').value.trim(),
        password: document.getElementById('login-pass').value
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao fazer login');

    // Salva token no localStorage (para app mobile/fallback)
    if (data.token) localStorage.setItem('token', data.token);
    
    showToast(`Bem-vindo, ${data.user.name}! 🎉`);
    setTimeout(() => window.location.href = '/index.html', 800);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

// ─────────────────────────────────────────────
// 📝 REGISTRO
// ─────────────────────────────────────────────
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const pass = document.getElementById('reg-pass').value;
  const confirm = document.getElementById('reg-confirm').value;
  
  if (pass !== confirm) {
    showToast('As senhas não coincidem!', 'warning');
    return;
  }

  const btn = e.target.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Criando conta...';

  try {
    const res = await fetch(`${API}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('reg-name').value.trim(),
        email: document.getElementById('reg-email').value.trim(),
        password: pass
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.errors?.join(', ') || 'Erro ao registrar');

    showToast('Conta criada! Faça login para continuar.', 'success');
    
    // Muda para aba de login automaticamente
    document.querySelector('[data-tab="login"]').click();
    document.getElementById('login-email').value = document.getElementById('reg-email').value;
    document.getElementById('login-pass').focus();
    e.target.reset();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});