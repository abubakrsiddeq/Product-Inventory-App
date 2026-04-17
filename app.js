// ============================================================
//  STOCKR — Product Inventory Management
//  app.js
// ============================================================

const PRIMARY_API_BASE = 'https://fakestoreapi.com/products';
const FALLBACK_API_BASE = 'https://dummyjson.com/products';

// ------- State -------
let allProducts   = [];   // master list
let activeFilter  = 'all';
let activeProvider = 'fakestore';

// ------- DOM refs -------
const grid        = document.getElementById('productsGrid');
const loadingEl   = document.getElementById('loadingState');
const errorEl     = document.getElementById('errorState');
const emptyEl     = document.getElementById('emptyState');
const errorMsgEl  = document.getElementById('errorMsg');
const countLabel  = document.getElementById('productCountLabel');
const statsBar    = document.getElementById('statsBar');
const modal       = document.getElementById('productModal');
const modalTitle  = document.getElementById('modalTitle');
const form        = document.getElementById('productForm');
const editIdInput = document.getElementById('editId');
const submitBtn   = document.getElementById('formSubmitBtn');
const headerStat  = document.getElementById('statCount');
const categoryFilterEl = document.getElementById('categoryFilter');

// ============================================================
//  INIT
// ============================================================
async function init() {
  showState('loading');
  try {
    allProducts = await fetchProductsWithFailover();
    renderProducts(allProducts);
    updateStats(allProducts);
    showState('grid');
  } catch (err) {
    console.error('Fetch error:', err);
    errorMsgEl.textContent = err.message || 'Failed to fetch products.';
    showState('error');
  }
}

async function fetchProductsWithFailover() {
  try {
    activeProvider = 'fakestore';
    const res = await fetch(PRIMARY_API_BASE);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.map((item) => normalizeProduct(item, 'fakestore'));
  } catch (primaryErr) {
    try {
      activeProvider = 'dummyjson';
      const res = await fetch(`${FALLBACK_API_BASE}?limit=100`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      const products = Array.isArray(payload.products) ? payload.products : [];
      showToast('Primary API unreachable. Running on backup product source.', 'error');
      return products.map((item) => normalizeProduct(item, 'dummyjson'));
    } catch (fallbackErr) {
      activeProvider = 'fakestore';
      throw new Error(`Primary and fallback APIs failed: ${primaryErr.message}`);
    }
  }
}

function normalizeProduct(item, source) {
  if (source === 'dummyjson') {
    return {
      id: item.id,
      title: item.title,
      price: Number(item.price) || 0,
      description: item.description,
      category: item.category,
      image: item.thumbnail || (Array.isArray(item.images) ? item.images[0] : ''),
    };
  }

  return {
    id: item.id,
    title: item.title,
    price: Number(item.price) || 0,
    description: item.description,
    category: item.category,
    image: item.image,
  };
}

// ============================================================
//  RENDER
// ============================================================
function renderProducts(products) {
  grid.innerHTML = '';

  countLabel.textContent = `(${products.length})`;
  headerStat.textContent = allProducts.length;

  if (!products.length) {
    showState('empty');
    return;
  }

  showState('grid');

  products.forEach((p, i) => {
    const card = createCard(p, i);
    grid.appendChild(card);
  });
}

function createCard(p, delay = 0) {
  const isLow = p.price < 20;
  const div = document.createElement('div');
  div.className = `product-card card-enter ${isLow ? 'low-price' : ''}`;
  div.dataset.id = p.id;
  div.style.animationDelay = `${Math.min(delay * 0.04, 0.6)}s`;
  div.style.opacity = '0';

  const shortDesc = p.description
    ? (p.description.length > 80 ? p.description.slice(0, 80) + '…' : p.description)
    : '—';

  const catColor = getCatColor(p.category);

  div.innerHTML = `
    <div class="img-container">
      <img src="${p.image || 'https://placehold.co/200x200?text=No+Image'}"
           alt="${escHtml(p.title)}"
           onerror="this.src='https://placehold.co/200x200?text=No+Image'" />
    </div>
    <div class="p-4 flex flex-col gap-3">
      <div class="flex items-start justify-between gap-2">
        <span class="category-badge" style="border-color:${catColor};color:${catColor};">
          ${escHtml(p.category || '—')}
        </span>
        ${isLow ? '<span class="low-price-badge">LOW PRICE</span>' : ''}
      </div>
      <div>
        <p class="condensed font-semibold text-base leading-snug line-clamp-2" style="color:var(--text)">
          ${escHtml(p.title || 'Untitled')}
        </p>
        <p class="text-xs mt-1 leading-relaxed" style="color:var(--muted)">${escHtml(shortDesc)}</p>
      </div>
      <div class="flex items-center justify-between mt-auto pt-2" style="border-top:1px solid var(--border)">
        <span class="price-tag">$${Number(p.price).toFixed(2)}</span>
        <div class="flex gap-2">
          <button class="btn-edit" onclick="openEditModal(${p.id})">EDIT</button>
          <button class="btn-danger" onclick="deleteProduct(${p.id})">DEL</button>
        </div>
      </div>
    </div>
  `;

  // Trigger animation
  requestAnimationFrame(() => { div.style.opacity = ''; });

  return div;
}

function getCatColor(cat) {
  const map = {
    'electronics':    '#47b8ff',
    'jewelery':       '#ffd47a',
    "men's clothing": '#a78bfa',
    "women's clothing": '#f472b6',
  };
  return map[cat] || '#6b7080';
}

// ============================================================
//  STATS
// ============================================================
function updateStats(products) {
  statsBar.classList.remove('hidden');
  document.getElementById('s-total').textContent = products.length;
  const avg = products.length
    ? (products.reduce((s, p) => s + p.price, 0) / products.length).toFixed(2)
    : '0.00';
  document.getElementById('s-avg').textContent = `$${avg}`;
  document.getElementById('s-low').textContent = products.filter(p => p.price < 20).length;
  const cats = new Set(products.map(p => p.category).filter(Boolean));
  document.getElementById('s-cats').textContent = cats.size;
}

// ============================================================
//  FILTER
// ============================================================
async function filterProducts(category, btn) {
  // Update pill UI
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
  const activePill = document.querySelector(`.filter-pill[data-cat="${cssEscape(category)}"]`);
  if (btn && btn.classList.contains('filter-pill')) btn.classList.add('active');
  else if (activePill) activePill.classList.add('active');

  if (categoryFilterEl && categoryFilterEl.value !== category) {
    categoryFilterEl.value = category;
  }

  activeFilter = category;

  if (category === 'all') {
    renderProducts(allProducts);
    updateStats(allProducts);
    return;
  }

  if (activeProvider === 'dummyjson') {
    const local = allProducts.filter((p) => p.category === category);
    renderProducts(local);
    updateStats(local);
    return;
  }

  showState('loading');
  try {
    const res = await fetch(`${PRIMARY_API_BASE}/category/${encodeURIComponent(category)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const normalized = data.map((item) => normalizeProduct(item, 'fakestore'));
    renderProducts(normalized);
    updateStats(normalized);
  } catch (err) {
    errorMsgEl.textContent = err.message || 'Failed to filter products.';
    showState('error');
  }
}

// ============================================================
//  ADD PRODUCT  (CREATE)
// ============================================================
function openAddModal() {
  modalTitle.textContent = 'Add Product';
  submitBtn.textContent  = 'SAVE PRODUCT';
  editIdInput.value = '';
  form.reset();
  modal.classList.remove('hidden');
}

async function handleAddProduct(data) {
  setFormLoading(true);
  try {
    const url = activeProvider === 'dummyjson' ? `${FALLBACK_API_BASE}/add` : PRIMARY_API_BASE;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rawProduct = await res.json();
    const newProduct = normalizeProduct(rawProduct, activeProvider);

    // Some demo APIs may return repeated ids for writes.
    newProduct.id    = newProduct.id || Date.now();
    newProduct.title = data.title;
    newProduct.price = data.price;
    newProduct.description = data.description;
    newProduct.category    = data.category;
    newProduct.image       = data.image || 'https://placehold.co/200x200?text=New';

    allProducts.unshift(newProduct);
    refreshActiveView();

    showToast('Product added successfully!', 'success');
    closeModal();
  } catch (err) {
    showToast(err.message || 'Failed to add product.', 'error');
  } finally {
    setFormLoading(false);
  }
}

// ============================================================
//  EDIT PRODUCT  (UPDATE)
// ============================================================
function openEditModal(id) {
  const product = allProducts.find(p => p.id === id);
  if (!product) return;

  modalTitle.textContent    = 'Edit Product';
  submitBtn.textContent     = 'UPDATE PRODUCT';
  editIdInput.value         = id;
  document.getElementById('f-title').value       = product.title || '';
  document.getElementById('f-price').value       = product.price || '';
  document.getElementById('f-description').value = product.description || '';
  document.getElementById('f-category').value    = product.category || '';
  document.getElementById('f-image').value       = product.image || '';

  modal.classList.remove('hidden');
}

async function handleEditProduct(id, data) {
  setFormLoading(true);
  try {
    const url = `${activeProvider === 'dummyjson' ? FALLBACK_API_BASE : PRIMARY_API_BASE}/${id}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Update local state
    const idx = allProducts.findIndex(p => p.id === id);
    if (idx !== -1) {
      allProducts[idx] = { ...allProducts[idx], ...data };
    }

    refreshActiveView();
    showToast('Product updated!', 'success');
    closeModal();
  } catch (err) {
    showToast(err.message || 'Failed to update product.', 'error');
  } finally {
    setFormLoading(false);
  }
}

// ============================================================
//  DELETE PRODUCT
// ============================================================
async function deleteProduct(id) {
  if (!confirm('Delete this product? This cannot be undone.')) return;

  try {
    const url = `${activeProvider === 'dummyjson' ? FALLBACK_API_BASE : PRIMARY_API_BASE}/${id}`;
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Remove from local state
    allProducts = allProducts.filter(p => p.id !== id);
    refreshActiveView();

    showToast('Product deleted.', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to delete product.', 'error');
  }
}

// ============================================================
//  FORM SUBMIT ROUTER
// ============================================================
async function handleFormSubmit(e) {
  e.preventDefault();

  const data = {
    title:       document.getElementById('f-title').value.trim(),
    price:       parseFloat(document.getElementById('f-price').value),
    description: document.getElementById('f-description').value.trim(),
    category:    document.getElementById('f-category').value,
    image:       document.getElementById('f-image').value.trim() || 'https://i.pravatar.cc/300',
  };

  const id = editIdInput.value;
  if (id) {
    await handleEditProduct(Number(id), data);
  } else {
    await handleAddProduct(data);
  }
}

// ============================================================
//  MODAL HELPERS
// ============================================================
function closeModal() {
  modal.classList.add('hidden');
  form.reset();
  editIdInput.value = '';
}

function handleOverlayClick(e) {
  if (e.target === modal) closeModal();
}

function setFormLoading(loading) {
  submitBtn.disabled    = loading;
  submitBtn.textContent = loading ? 'SAVING…' : (editIdInput.value ? 'UPDATE PRODUCT' : 'SAVE PRODUCT');
}

// ============================================================
//  UI STATE MANAGER
// ============================================================
function showState(state) {
  loadingEl.classList.add('hidden');
  errorEl.classList.add('hidden');
  emptyEl.classList.add('hidden');
  grid.classList.add('hidden');

  if (state === 'loading') loadingEl.classList.remove('hidden');
  else if (state === 'error')   errorEl.classList.remove('hidden');
  else if (state === 'empty')   emptyEl.classList.remove('hidden');
  else if (state === 'grid')    grid.classList.remove('hidden');
}

// ============================================================
//  TOAST
// ============================================================
let toastTimer = null;

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast ${type}`;
  el.classList.remove('hidden');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('hidden');
  }, 3500);
}

function refreshActiveView() {
  const list = activeFilter === 'all'
    ? allProducts
    : allProducts.filter((p) => p.category === activeFilter);

  renderProducts(list);
  updateStats(list);
}

function cssEscape(value) {
  return String(value).replace(/(["\\])/g, '\\$1');
}

// ============================================================
//  UTILS
// ============================================================
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
//  BOOT
// ============================================================
document.addEventListener('DOMContentLoaded', init);
