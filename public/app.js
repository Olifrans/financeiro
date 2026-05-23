const API = '/api';

async function loadCategories() {
  const res = await fetch(`${API}/categories`);
  const cats = await res.json();
  const select = document.getElementById('category');
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.type === 'income' ? 'Rec' : 'Desp'})`;
    select.appendChild(opt);
  });
}

async function loadSummary() {
  const res = await fetch(`${API}/summary`);
  const { income, expense, balance } = await res.json();
  document.getElementById('total-income').textContent = formatBRL(income);
  document.getElementById('total-expense').textContent = formatBRL(expense);
  document.getElementById('total-balance').textContent = formatBRL(balance);
}

async function loadTransactions() {
  const res = await fetch(`${API}/transactions`);
  const txs = await res.json();
  const tbody = document.getElementById('transactions-body');
  tbody.innerHTML = '';

  txs.forEach(tx => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDate(tx.date)}</td>
      <td>${escapeHtml(tx.description)}</td>
      <td>${tx.category || '-'}</td>
      <td class="${tx.type}-val">${tx.type === 'income' ? '+' : '-'} ${formatBRL(tx.amount)}</td>
      <td><button class="delete-btn" onclick="deleteTx(${tx.id})">🗑️</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function formatBRL(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v); }
function formatDate(d) { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}`; }
function escapeHtml(t) { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

document.getElementById('transaction-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    description: document.getElementById('desc').value,
    amount: parseFloat(document.getElementById('amount').value),
    type: document.getElementById('type').value,
    category_id: document.getElementById('category').value || null,
    date: document.getElementById('date').value
  };

  const res = await fetch(`${API}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    e.target.reset();
    document.getElementById('date').valueAsDate = new Date();
    loadSummary(); loadTransactions();
  } else {
    alert('Erro ao salvar transação.');
  }
});

window.deleteTx = async (id) => {
  if (!confirm('Confirmar exclusão?')) return;
  const res = await fetch(`${API}/transactions/${id}`, { method: 'DELETE' });
  if (res.ok) { loadSummary(); loadTransactions(); }
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('date').valueAsDate = new Date();
  loadCategories(); loadSummary(); loadTransactions();
});