/* ============================================================
   💰 GESTÃO FINANCEIRA PRO - Frontend JS
   ============================================================ */

'use strict';

// ─────────────────────────────────────────────
// 🔧 CONFIGURAÇÃO
// ─────────────────────────────────────────────
const CONFIG = {
  API_BASE: '/api',
  TOAST_DURATION: 3000,
  ITEMS_PER_PAGE: 15,
  CHART_COLORS: {
    income: '#10b981',
    expense: '#ef4444',
    primary: '#3b82f6',
    muted: '#94a3b8'
  }
};

// ─────────────────────────────────────────────
// 📦 ESTADO GLOBAL
// ─────────────────────────────────────────────
const state = {
  currentPage: 1,
  editingId: null,
  categories: [],
  categoryChart: null,
  monthlyChart: null,
  isLoading: false
};

// ─────────────────────────────────────────────
// 🎯 SELETORES DOM (cache)
// ─────────────────────────────────────────────
const DOM = {
  // Resumo
  totalIncome: document.getElementById('total-income'),
  totalExpense: document.getElementById('total-expense'),
  totalBalance: document.getElementById('total-balance'),

  // Filtros
  monthFilter: document.getElementById('month-filter'),
  yearFilter: document.getElementById('year-filter'),

  // Formulário
  form: document.getElementById('transaction-form'),
  formTitle: document.getElementById('form-title'),
  submitBtn: document.getElementById('submit-btn'),
  cancelBtn: document.getElementById('cancel-btn'),
  txId: document.getElementById('transaction-id'),
  desc: document.getElementById('desc'),
  amount: document.getElementById('amount'),
  type: document.getElementById('type'),
  category: document.getElementById('category'),
  date: document.getElementById('date'),

  // Tabela
  tbody: document.getElementById('transactions-body'),
  pagination: document.getElementById('pagination'),

  // Gráficos
  categoryChart: document.getElementById('categoryChart'),
  monthlyChart: document.getElementById('monthlyChart'),

  // Ações
  themeToggle: document.getElementById('theme-toggle'),
  exportBtn: document.getElementById('export-btn'),
  toastContainer: document.getElementById('toast-container')
};

// ─────────────────────────────────────────────
// 🛠️ UTILITÁRIOS
// ─────────────────────────────────────────────

/** Formata valor em BRL */
const formatBRL = (value) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value) || 0);

/** Formata data ISO para dd/mm/aaaa */
const formatDate = (isoDate) => {
  if (!isoDate) return '-';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
};

/** Escapa HTML para prevenir XSS */
const escapeHtml = (text) => {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
};

/** Constrói query string de filtros atuais */
const getFilters = () => {
  const params = new URLSearchParams();
  if (DOM.monthFilter.value) params.append('month', DOM.monthFilter.value);
  if (DOM.yearFilter.value) params.append('year', DOM.yearFilter.value);
  return params.toString();
};

/** Faz requisição HTTP com tratamento de erros */
const api = async (endpoint, options = {}) => {
  try {
    const res = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data.errors?.join(', ') || data.error || 'Erro na requisição');
      error.status = res.status;
      throw error;
    }
    return data;
  } catch (err) {
    if (err.message === 'Failed to fetch') {
      throw new Error('Sem conexão com o servidor');
    }
    throw err;
  }
};

// ─────────────────────────────────────────────
// 🔔 SISTEMA DE TOASTS
// ─────────────────────────────────────────────
const showToast = (message, type = 'success') => {
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `<span>${icons[type] || ''} ${escapeHtml(message)}</span>`;
  DOM.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease-out forwards';
    setTimeout(() => toast.remove(), 300);
  }, CONFIG.TOAST_DURATION);
};

// ─────────────────────────────────────────────
// 🎨 TEMA (DARK/LIGHT)
// ─────────────────────────────────────────────
const applyTheme = (theme) => {
  document.body.setAttribute('data-theme', theme);
  DOM.themeToggle.textContent = theme === 'light' ? '🌙' : '☀️';
  localStorage.setItem('theme', theme);
};

const toggleTheme = () => {
  const current = document.body.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  applyTheme(next);
  loadCharts(); // Recarrega para aplicar cores novas
};

// ─────────────────────────────────────────────
// 📅 ANOS DISPONÍVEIS
// ─────────────────────────────────────────────
const loadYears = () => {
  const currentYear = new Date().getFullYear();
  DOM.yearFilter.innerHTML = '<option value="">Todos os anos</option>';
  for (let y = currentYear + 1; y >= currentYear - 5; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    DOM.yearFilter.appendChild(opt);
  }
  DOM.yearFilter.value = currentYear; // Ano atual como padrão
};

// ─────────────────────────────────────────────
// 📂 CATEGORIAS
// ─────────────────────────────────────────────
const loadCategories = async () => {
  try {
    state.categories = await api('/categories');
    updateCategoryOptions();
  } catch (err) {
    showToast(`Erro ao carregar categorias: ${err.message}`, 'error');
  }
};

/** Atualiza opções de categoria baseado no tipo selecionado */
const updateCategoryOptions = () => {
  const selectedType = DOM.type.value;
  const currentValue = DOM.category.value;
  const filtered = state.categories.filter(c => c.type === selectedType);

  DOM.category.innerHTML = '<option value="">Selecione uma categoria</option>';
  filtered.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    DOM.category.appendChild(opt);
  });

  // Mantém seleção se ainda for válida
  if (filtered.some(c => c.id == currentValue)) {
    DOM.category.value = currentValue;
  } else {
    DOM.category.value = '';
  }
};

// ─────────────────────────────────────────────
// 📊 RESUMO FINANCEIRO
// ─────────────────────────────────────────────
const loadSummary = async () => {
  try {
    const data = await api(`/summary?${getFilters()}`);
    DOM.totalIncome.textContent = formatBRL(data.income);
    DOM.totalExpense.textContent = formatBRL(data.expense);
    DOM.totalBalance.textContent = formatBRL(data.balance);
  } catch (err) {
    showToast(`Erro ao carregar resumo: ${err.message}`, 'error');
  }
};

// ─────────────────────────────────────────────
// 📋 TRANSAÇÕES (com paginação)
// ─────────────────────────────────────────────
const loadTransactions = async (page = 1) => {
  state.currentPage = page;
  DOM.tbody.innerHTML = `
    <tr><td colspan="5" class="text-center text-muted">Carregando...</td></tr>
  `;

  try {
    const filters = getFilters();
    const data = await api(
      `/transactions?page=${page}&limit=${CONFIG.ITEMS_PER_PAGE}&${filters}`
    );

    renderTransactions(data.transactions);
    renderPagination(data.pagination);
  } catch (err) {
    DOM.tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-muted">
          ❌ Erro ao carregar transações
        </td>
      </tr>
    `;
    showToast(`Erro: ${err.message}`, 'error');
  }
};

const renderTransactions = (transactions) => {
  DOM.tbody.innerHTML = '';

  if (!transactions || transactions.length === 0) {
    DOM.tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-muted">
          📭 Nenhuma transação encontrada para o período selecionado
        </td>
      </tr>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  transactions.forEach(tx => {
    const tr = document.createElement('tr');
    const sign = tx.type === 'income' ? '+' : '-';
    const valClass = tx.type === 'income' ? 'income-val' : 'expense-val';

    tr.innerHTML = `
      <td>${formatDate(tx.date)}</td>
      <td>${escapeHtml(tx.description)}</td>
      <td>${escapeHtml(tx.category || '-')}</td>
      <td class="${valClass}">${sign} ${formatBRL(tx.amount)}</td>
      <td>
        <button
          class="action-btn edit-btn"
          data-action="edit"
          data-id="${tx.id}"
          title="Editar"
        >✏️</button>
        <button
          class="action-btn delete-btn"
          data-action="delete"
          data-id="${tx.id}"
          title="Excluir"
        >🗑️</button>
      </td>
    `;

    // Armazena dados completos no botão de editar via dataset (JSON)
    tr.querySelector('[data-action="edit"]').dataset.payload = JSON.stringify({
      id: tx.id,
      description: tx.description,
      amount: tx.amount,
      type: tx.type,
      category_id: tx.category_id,
      date: tx.date
    });

    fragment.appendChild(tr);
  });

  DOM.tbody.appendChild(fragment);
};

const renderPagination = (pagination) => {
  DOM.pagination.innerHTML = '';
  if (!pagination || pagination.pages <= 1) return;

  const createBtn = (text, page, disabled = false, active = false) => {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.disabled = disabled;
    if (active) btn.classList.add('active');
    btn.addEventListener('click', () => loadTransactions(page));
    return btn;
  };

  DOM.pagination.appendChild(
    createBtn('←', pagination.page - 1, pagination.page === 1)
  );

  // Exibe até 5 páginas no máximo
  const start = Math.max(1, pagination.page - 2);
  const end = Math.min(pagination.pages, pagination.page + 2);

  if (start > 1) {
    DOM.pagination.appendChild(createBtn('1', 1));
    if (start > 2) {
      const dots = document.createElement('span');
      dots.textContent = '…';
      dots.style.padding = '8px';
      DOM.pagination.appendChild(dots);
    }
  }

  for (let i = start; i <= end; i++) {
    DOM.pagination.appendChild(
      createBtn(i, i, false, i === pagination.page)
    );
  }

  if (end < pagination.pages) {
    if (end < pagination.pages - 1) {
      const dots = document.createElement('span');
      dots.textContent = '…';
      dots.style.padding = '8px';
      DOM.pagination.appendChild(dots);
    }
    DOM.pagination.appendChild(createBtn(pagination.pages, pagination.pages));
  }

  DOM.pagination.appendChild(
    createBtn('→', pagination.page + 1, pagination.page === pagination.pages)
  );
};

// ─────────────────────────────────────────────
// 📈 GRÁFICOS (Chart.js)
// ─────────────────────────────────────────────

/** Retorna a cor do texto atual (para legendas/labels) */
const getTextColor = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#333';

const getBorderColor = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#e0e0e0';

const loadCharts = async () => {
  try {
    const data = await api(`/chart-data?${getFilters()}`);
    renderCategoryChart(data.byCategory);
    renderMonthlyChart(data.monthly);
  } catch (err) {
    console.warn('Erro ao carregar gráficos:', err);
  }
};

const renderCategoryChart = (data) => {
  if (!window.Chart || !DOM.categoryChart) return;

  if (state.categoryChart) state.categoryChart.destroy();
  const textColor = getTextColor();

  const hasData = data && data.length > 0;
  const labels = hasData ? data.map(d => d.category || 'Sem categoria') : ['Sem dados'];
  const values = hasData ? data.map(d => d.total) : [1];
  const colors = hasData
    ? data.map(d => d.type === 'income' ? CONFIG.CHART_COLORS.income : CONFIG.CHART_COLORS.expense)
    : [CONFIG.CHART_COLORS.muted];

  state.categoryChart = new Chart(DOM.categoryChart, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: getComputedStyle(document.documentElement).getPropertyValue('--card').trim(),
        borderWidth: 3,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false, // ⚠️ ESSENCIAL para não ocupar a tela
      cutout: '60%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: textColor,
            padding: 12,
            font: { size: 12 },
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${formatBRL(ctx.parsed)}`
          }
        }
      }
    }
  });
};

const renderMonthlyChart = (data) => {
  if (!window.Chart || !DOM.monthlyChart) return;

  if (state.monthlyChart) state.monthlyChart.destroy();
  const textColor = getTextColor();
  const borderColor = getBorderColor();

  const hasData = data && data.length > 0;
  const months = hasData ? [...new Set(data.map(d => d.month))].reverse() : [];

  const incomeData = months.map(m => {
    const item = data.find(d => d.month === m && d.type === 'income');
    return item ? item.total : 0;
  });
  const expenseData = months.map(m => {
    const item = data.find(d => d.month === m && d.type === 'expense');
    return item ? item.total : 0;
  });

  state.monthlyChart = new Chart(DOM.monthlyChart, {
    type: 'bar',
    data: {
      labels: months.map(m => {
        const [y, mo] = m.split('-');
        return `${mo}/${y.slice(2)}`;
      }),
      datasets: [
        {
          label: 'Receitas',
          data: incomeData,
          backgroundColor: CONFIG.CHART_COLORS.income,
          borderRadius: 6,
          borderSkipped: false
        },
        {
          label: 'Despesas',
          data: expenseData,
          backgroundColor: CONFIG.CHART_COLORS.expense,
          borderRadius: 6,
          borderSkipped: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false, // ⚠️ ESSENCIAL para não ocupar a tela
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: textColor,
            callback: (v) => formatBRL(v)
          },
          grid: { color: borderColor }
        },
        x: {
          ticks: { color: textColor },
          grid: { display: false }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: textColor,
            padding: 12,
            usePointStyle: true
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatBRL(ctx.parsed.y)}`
          }
        }
      }
    }
  });
};

// ─────────────────────────────────────────────
// ✏️ EDIÇÃO DE TRANSAÇÃO
// ─────────────────────────────────────────────
const startEdit = (payload) => {
  state.editingId = payload.id;
  DOM.txId.value = payload.id;
  DOM.desc.value = payload.description;
  DOM.amount.value = payload.amount;
  DOM.type.value = payload.type;
  updateCategoryOptions(); // Atualiza lista pelo novo tipo
  DOM.category.value = payload.category_id || '';
  DOM.date.value = payload.date;

  DOM.formTitle.textContent = '✏️ Editar Transação';
  DOM.submitBtn.textContent = '💾 Salvar Alterações';
  DOM.cancelBtn.style.display = 'inline-flex';

  window.scrollTo({ top: 0, behavior: 'smooth' });
  DOM.desc.focus();
};

const cancelEdit = () => {
  state.editingId = null;
  DOM.form.reset();
  DOM.txId.value = '';
  DOM.date.valueAsDate = new Date();
  updateCategoryOptions();
  DOM.formTitle.textContent = '➕ Nova Transação';
  DOM.submitBtn.textContent = '➕ Adicionar';
  DOM.cancelBtn.style.display = 'none';
};

// ─────────────────────────────────────────────
// 🗑️ EXCLUSÃO DE TRANSAÇÃO
// ─────────────────────────────────────────────
const deleteTransaction = async (id) => {
  if (!confirm('Tem certeza que deseja excluir esta transação?')) return;

  try {
    await api(`/transactions/${id}`, { method: 'DELETE' });
    showToast('Transação excluída com sucesso!');
    await refreshAll();
  } catch (err) {
    showToast(`Erro ao excluir: ${err.message}`, 'error');
  }
};

// ─────────────────────────────────────────────
// 🔄 RECARREGAMENTO GERAL
// ─────────────────────────────────────────────
const refreshAll = async () => {
  await Promise.all([
    loadSummary(),
    loadTransactions(state.currentPage),
    loadCharts()
  ]);
};

// ─────────────────────────────────────────────
// 📤 EXPORTAR CSV
// ─────────────────────────────────────────────
const exportCSV = () => {
  const filters = getFilters();
  window.open(`${CONFIG.API_BASE}/export?${filters}`, '_blank');
  showToast('Exportação iniciada!', 'info');
};

// ─────────────────────────────────────────────
// 📝 SUBMIT DO FORMULÁRIO
// ─────────────────────────────────────────────
const handleSubmit = async (e) => {
  e.preventDefault();
  if (state.isLoading) return;

  const payload = {
    description: DOM.desc.value.trim(),
    amount: parseFloat(DOM.amount.value),
    type: DOM.type.value,
    category_id: DOM.category.value ? parseInt(DOM.category.value) : null,
    date: DOM.date.value
  };

  // Validação client-side extra
  if (!payload.description || isNaN(payload.amount) || payload.amount <= 0) {
    showToast('Preencha todos os campos corretamente', 'warning');
    return;
  }

  state.isLoading = true;
  DOM.submitBtn.disabled = true;
  const originalText = DOM.submitBtn.textContent;
  DOM.submitBtn.textContent = '⏳ Salvando...';

  try {
    const url = state.editingId
      ? `/transactions/${state.editingId}`
      : '/transactions';
    const method = state.editingId ? 'PUT' : 'POST';

    await api(url, {
      method,
      body: JSON.stringify(payload)
    });

    showToast(
      state.editingId ? 'Transação atualizada!' : 'Transação adicionada!'
    );

    cancelEdit();
    await refreshAll();
  } catch (err) {
    showToast(`Erro: ${err.message}`, 'error');
  } finally {
    state.isLoading = false;
    DOM.submitBtn.disabled = false;
    DOM.submitBtn.textContent = state.editingId ? '💾 Salvar' : originalText;
  }
};

// ─────────────────────────────────────────────
// 🖱️ EVENT DELEGATION (tabela)
// ─────────────────────────────────────────────
const handleTableClick = (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === 'delete') {
    deleteTransaction(id);
  } else if (action === 'edit') {
    try {
      const payload = JSON.parse(btn.dataset.payload);
      startEdit(payload);
    } catch {
      showToast('Erro ao carregar dados para edição', 'error');
    }
  }
};

// ─────────────────────────────────────────────
// 🚀 INICIALIZAÇÃO
// ─────────────────────────────────────────────
const init = () => {
  // Tema salvo
  const savedTheme = localStorage.getItem('theme') || 'light';
  applyTheme(savedTheme);

  // Data atual no input de data
  DOM.date.valueAsDate = new Date();

  // Carregar anos
  loadYears();

  // Event listeners
  DOM.themeToggle.addEventListener('click', toggleTheme);
  DOM.exportBtn.addEventListener('click', exportCSV);
  DOM.form.addEventListener('submit', handleSubmit);
  DOM.cancelBtn.addEventListener('click', cancelEdit);
  DOM.type.addEventListener('change', updateCategoryOptions);
  DOM.tbody.addEventListener('click', handleTableClick);

  // Filtros disparam recarregamento
  DOM.monthFilter.addEventListener('change', () => {
    state.currentPage = 1;
    refreshAll();
  });
  DOM.yearFilter.addEventListener('change', () => {
    state.currentPage = 1;
    refreshAll();
  });

  // Carregar dados iniciais
  loadCategories().then(() => refreshAll());
};

// Inicia quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}