const API = '/api';
let currentPage = 1;
let editingId = null;
let categoryChart = null;
let monthlyChart = null;

// Sistema de Toast
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease-out reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Carregar anos disponíveis
function loadYears() {
  const select = document.getElementById('year-filter');
  const currentYear = new Date().getFullYear();
  select.innerHTML = '<option value="">Todos os anos</option>';
  for (let y = currentYear; y >= currentYear - 5; y--) {
    select.innerHTML += `<option value="${y}">${y}</option>`;
  }
}

// Carregar categorias
async function loadCategories() {
  try {
    const res = await fetch(`${API}/categories`);
    const cats = await res.json();
    const select = document.getElementById('category');
    select.innerHTML = '<option value="">Selecione uma categoria</option>';
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name} (${c.type === 'income' ? '💵 Rec' : '💸 Desp'})`;
      opt.dataset.type = c.type;
      select.appendChild(opt);
    });
  } catch (err) {
    showToast('Erro ao carregar categorias', 'error');
  }
}

// Carregar resumo
async function loadSummary() {
  try {
    const filters = getFilters();
    const res = await fetch(`${API}/summary?${filters}`);
    const { income, expense, balance } = await res.json();
    document.getElementById('total-income').textContent = formatBRL(income);
    document.getElementById('total-expense').textContent = formatBRL(expense);
    document.getElementById('total-balance').textContent = formatBRL(balance);
  } catch (err) {
    showToast('Erro ao carregar resumo', 'error');
  }
}

// Carregar transações com paginação
async function loadTransactions(page = 1) {
  try {
    currentPage = page;
    const filters = getFilters();
    const res = await fetch(`${API}/transactions?page=${page}&${filters}`);
    const { transactions, pagination } = await res.json();
    const tbody = document.getElementById('transactions-body');
    tbody.innerHTML = '';

    if (transactions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma transação encontrada</td></tr>';
    } else {
      transactions.forEach(tx => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${formatDate(tx.date)}</td>
          <td>${escapeHtml(tx.description)}</td>
          <td>${tx.category || '-'}</td>
          <td class="${tx.type}-val">${tx.type === 'income' ? '+' : '-'} ${formatBRL(tx.amount)}</td>
          <td>
            <button class="action-btn edit-btn" onclick="editTransaction(${tx.id}, '${escapeHtml(tx.description)}', ${tx.amount}, '${tx.type}', ${tx.category_id || 'null'}, '${tx.date}')">✏️</button>
            <button class="action-btn delete-btn" onclick="deleteTx(${tx.id})">🗑️</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    renderPagination(pagination);
  } catch (err) {
    showToast('Erro ao carregar transações', 'error');
  }
}

// Renderizar paginação
function renderPagination(pagination) {
  const container = document.getElementById('pagination');
  container.innerHTML = '';

  if (pagination.pages <= 1) return;

  const prevBtn = document.createElement('button');
  prevBtn.textContent = '←';
  prevBtn.disabled = pagination.page === 1;
  prevBtn.onclick = () => loadTransactions(pagination.page - 1);
  container.appendChild(prevBtn);

  for (let i = 1; i <= pagination.pages; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.className = i === pagination.page ? 'active' : '';
    btn.onclick = () => loadTransactions(i);
    container.appendChild(btn);
  }

  const nextBtn = document.createElement('button');
  nextBtn.textContent = '→';
  nextBtn.disabled = pagination.page === pagination.pages;
  nextBtn.onclick = () => loadTransactions(pagination.page + 1);
  container.appendChild(nextBtn);
}

// Carregar dados dos gráficos
async function loadCharts() {
  try {
    const filters = getFilters();
    const res = await fetch(`${API}/chart-data?${filters}`);
    const data = await res.json();
    
    renderCategoryChart(data.byCategory);
    renderMonthlyChart(data.monthly);
  } catch (err) {
    console.error('Erro ao carregar gráficos:', err);
  }
}

// Gráfico por categoria
function renderCategoryChart(data) {
  const ctx = document.getElementById('categoryChart').getContext('2d');
  
  if (categoryChart) categoryChart.destroy();

  const labels = data.map(d => d.category || 'Sem categoria');
  const values = data.map(d => d.total);
  const colors = data.map(d => d.type === 'income' ? '#4caf50' : '#f44336');

  categoryChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text') }
        }
      }
    }
  });
}

// Gráfico mensal
function renderMonthlyChart(data) {
  const ctx = document.getElementById('monthlyChart').getContext('2d');
  
  if (monthlyChart) monthlyChart.destroy();

  const months = [...new Set(data.map(d => d.month))].reverse();
  const incomeData = months.map(m => {
    const item = data.find(d => d.month === m && d.type === 'income');
    return item ? item.total : 0;
  });
  const expenseData = months.map(m => {
    const item = data.find(d => d.month === m && d.type === 'expense');
    return item ? item.total : 0;
  });

  monthlyChart = new Chart(ctx, {
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
          backgroundColor: '#4caf50'
        },
        {
          label: 'Despesas',
          data: expenseData,
          backgroundColor: '#f44336'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text') }
        },
        x: {
          ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text') }
        }
      },
      plugins: {
        legend: {
          labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text') }
        }
      }
    }
  });
}

// Editar transação
window.editTransaction = function(id, description, amount, type, categoryId, date) {
  editingId = id;
  document.getElementById('transaction-id').value = id;
  document.getElementById('desc').value = description;
  document.getElementById('amount').value = amount;
  document.getElementById('type').value = type;
  document.getElementById('category').value = categoryId || '';
  document.getElementById('date').value = date;
  
  document.getElementById('form-title').textContent = '✏️ Editar Transação';
  document.getElementById('submit-btn').textContent = '💾 Salvar';
  document.getElementById('cancel-btn').style.display = 'block';
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// Cancelar edição
document.getElementById('cancel-btn').addEventListener('click', () => {
  editingId = null;
  document.getElementById('transaction-form').reset();
  document.getElementById('date').valueAsDate = new Date();
  document.getElementById('form-title').textContent = '➕ Nova Transação';
  document.getElementById('submit-btn').textContent = '➕ Adicionar';
  document.getElementById('cancel-btn').style.display = 'none';
});

// Obter filtros
function getFilters() {
  const month = document.getElementById('month-filter').value;
  const year = document.getElementById('year-filter').value;
  const params = new URLSearchParams();
  if (month) params.append('month', month);
  if (year) params.append('year', year);
  return params.toString();
}

// Utilitários
function formatBRL(v) { 
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v); 
}

function formatDate(d) { 
  const [y, m, day] = d.split('-'); 
  return `${day}/${m}/${y}`; 
}

function escapeHtml(t) { 
  const div = document.createElement('div');
  div.textContent = t;
  return div.innerHTML;
}

// Formulário
document.getElementById('transaction-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const payload = {
    description: document.getElementById('desc').value.trim(),
    amount: parseFloat(document.getElementById('amount').value),
    type: document.getElementById('type').value,
    category_id: document.getElementById('category').value ? parseInt(document.getElementById('category').value) : null,
    date: document.getElementById('date').value
  };

  try {
    const url = editingId 
      ? `${API}/transactions/${editingId}`
      : `${API}/transactions`;
    
    const method = editingId ? 'PUT' : 'POST';
    
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (res.ok) {
      showToast(editingId ? 'Transação atualizada!' : 'Transação adicionada!');
      e.target.reset();
      document.getElementById('date').valueAsDate = new Date();
      
      if (editingId) {
        editingId = null;
        document.getElementById('form-title').textContent = '➕ Nova Transação';
        document.getElementById('submit-btn').textContent = '➕ Adicionar';
        document.getElementById('cancel-btn').style.display = 'none';
      }
      
      loadAll();
    } else {
      showToast(data.errors ? data.errors.join(', ') : data.error, 'error');
    }
  } catch (err) {
    showToast('Erro de conexão', 'error');
  }
});

// Excluir transação
window.deleteTx = async (id) => {
  if (!confirm('Confirmar exclusão?')) return;
  
  try {
    const res = await fetch(`${API}/transactions/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Transação removida!');
      loadAll();
    } else {
      showToast('Erro ao remover transação', 'error');
    }
  } catch (err) {
    showToast('Erro de conexão', 'error');
  }
};

// Exportar CSV
document.getElementById('export-btn').addEventListener('click', () => {
  const filters = getFilters();
  window.open(`${API}/export?${filters}`, '_blank');
  showToast('Exportando CSV...');
});

// Tema
document.getElementById('theme-toggle').addEventListener('click', () => {
  const body = document.body;
  const current = body.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  body.setAttribute('data-theme', next);
  document.getElementById('theme-toggle').textContent = next === 'light' ? '🌙' : '☀️';
  localStorage.setItem('theme', next);
  loadCharts(); // Recarregar gráficos com cores do tema
});

// Filtros
document.getElementById('month-filter').addEventListener('change', loadAll);
document.getElementById('year-filter').addEventListener('change', loadAll);

// Carregar tudo
function loadAll() {
  loadSummary();
  loadTransactions(currentPage);
  loadCharts();
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.body.setAttribute('data-theme', savedTheme);
  document.getElementById('theme-toggle').textContent = savedTheme === 'light' ? '🌙' : '☀️';
  
  document.getElementById('date').valueAsDate = new Date();
  loadYears();
  loadCategories();
  loadAll();
});