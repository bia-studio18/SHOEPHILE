/* ============================================
   SHOEPHILE — Products (API + helpers)
   ============================================ */

const API_BASE = '';

let PRODUCTS = [];
let productsReady = null;

function formatPrice(price) {
  return 'Rs ' + Number(price).toLocaleString('en-PK');
}

function renderStars(rating) {
  const full = Math.floor(rating || 0);
  const half = (rating || 0) % 1 >= 0.5;
  let stars = '★'.repeat(full);
  if (half) stars += '½';
  return stars || '—';
}

async function fetchProducts() {
  try {
    const res = await fetch(API_BASE + '/api/products');
    if (!res.ok) throw new Error('Failed to load products');
    PRODUCTS = await res.json();
    return PRODUCTS;
  } catch (e) {
    console.warn('API unavailable, empty catalog:', e.message);
    PRODUCTS = [];
    return PRODUCTS;
  }
}

function loadProductsFromAPI() {
  if (!productsReady) {
    productsReady = fetchProducts();
  }
  return productsReady;
}

function getProductById(id) {
  return PRODUCTS.find((p) => p.id === parseInt(id));
}

function filterProducts(category = 'all', sort = 'featured') {
  let filtered =
    category === 'all'
      ? [...PRODUCTS]
      : PRODUCTS.filter(
          (p) =>
            p.category === category ||
            (category === 'new' && p.badge === 'New') ||
            (category === 'luxury' && p.badge === 'Luxury')
        );

  switch (sort) {
    case 'price-asc':
      filtered.sort((a, b) => a.price - b.price);
      break;
    case 'price-desc':
      filtered.sort((a, b) => b.price - a.price);
      break;
    case 'name':
      filtered.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'rating':
      filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      break;
    default:
      filtered.sort((a, b) => {
        if (a.badge === 'Bestseller' && b.badge !== 'Bestseller') return -1;
        if (b.badge === 'Bestseller' && a.badge !== 'Bestseller') return 1;
        return 0;
      });
  }
  return filtered;
}

function productImageUrl(src) {
  if (!src) return '/uploads/placeholder.svg';
  if (src.startsWith('http') || src.startsWith('data:')) return src;
  return src;
}


function effectivePrice(product) {
  if (!product) return 0;
  if (product.specialPrice != null && product.specialPrice > 0) return Number(product.specialPrice);
  return Number(product.price) || 0;
}

function priceHtml(product) {
  const special = product.specialPrice != null && product.specialPrice > 0;
  if (special) {
    return `<span class="old">${formatPrice(product.price)}</span> ${formatPrice(product.specialPrice)}`;
  }
  if (product.oldPrice) {
    return `<span class="old">${formatPrice(product.oldPrice)}</span> ${formatPrice(product.price)}`;
  }
  return formatPrice(product.price);
}
