/* ============================================
   SHOEPHILE — Cart & Wishlist
   ============================================ */

const Cart = {
  STORAGE_KEY: 'shoephile_cart',
  WISHLIST_KEY: 'shoephile_wishlist',

  getCart() {
    try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || []; }
    catch { return []; }
  },

  saveCart(cart) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cart));
    this.updateBadges();
  },

  getWishlist() {
    try { return JSON.parse(localStorage.getItem(this.WISHLIST_KEY)) || []; }
    catch { return []; }
  },

  saveWishlist(list) {
    localStorage.setItem(this.WISHLIST_KEY, JSON.stringify(list));
    this.updateBadges();
  },

  addToCart(productId, size = null, color = null, qty = 1) {
    const cart = this.getCart();
    const product = getProductById(productId);
    if (!product) return false;

    const existing = cart.find(
      item => item.id === productId && item.size === size && item.color === color
    );

    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({
        id: productId,
        name: product.name,
        price: (typeof effectivePrice === 'function' ? effectivePrice(product) : product.price),
        image: (product.images && product.images[0]) || '',
        size: size || product.sizes[2],
        color: color || product.colors[0].name,
        qty
      });
    }

    this.saveCart(cart);
    this.showToast(`${product.name} added to bag`);
    return true;
  },

  removeFromCart(index) {
    const cart = this.getCart();
    cart.splice(index, 1);
    this.saveCart(cart);
    this.showToast('Item removed from bag');
  },

  updateQty(index, qty) {
    const cart = this.getCart();
    if (qty < 1) { this.removeFromCart(index); return; }
    cart[index].qty = qty;
    this.saveCart(cart);
  },

  getCartTotal() {
    return this.getCart().reduce((sum, item) => sum + item.price * item.qty, 0);
  },

  getCartCount() {
    return this.getCart().reduce((sum, item) => sum + item.qty, 0);
  },

  toggleWishlist(productId) {
    let list = this.getWishlist();
    const idx = list.indexOf(productId);
    if (idx > -1) {
      list.splice(idx, 1);
      this.showToast('Removed from wishlist');
    } else {
      list.push(productId);
      this.showToast('Added to wishlist');
    }
    this.saveWishlist(list);
    return list.includes(productId);
  },

  isInWishlist(productId) {
    return this.getWishlist().includes(productId);
  },

  updateBadges() {
    const cartCount = this.getCartCount();
    const wishCount = this.getWishlist().length;

    document.querySelectorAll('.cart-count').forEach(el => {
      el.textContent = cartCount;
      el.style.display = cartCount > 0 ? 'flex' : 'none';
    });
    document.querySelectorAll('.wishlist-count').forEach(el => {
      el.textContent = wishCount;
      el.style.display = wishCount > 0 ? 'flex' : 'none';
    });
  },

  showToast(message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  },

  clearCart() {
    this.saveCart([]);
  }
};

document.addEventListener('DOMContentLoaded', () => Cart.updateBadges());
