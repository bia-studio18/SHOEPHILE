/* ============================================
   SHOEPHILE — Main Application
   ============================================ */

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initHeader();
  initMobileNav();
  initSearch();
  initFadeIn();
  initNewsletterPopup();
  initFAQ();
  initCartPage();
  initCheckoutPage();
  initNewsletterForms();
  await loadProductsFromAPI();
  initShopPage();
  initProductPage();
  renderHomeProducts();
});

function initTheme() {
  const saved = localStorage.getItem('shoephile_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);

  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('shoephile_theme', next);
      updateThemeIcon(next);
    });
  });

  updateThemeIcon(saved);
}

function updateThemeIcon(theme) {
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.innerHTML = theme === 'dark'
      ? `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`
      : `<svg class="icon" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  });
}

function initHeader() {
  const header = document.querySelector('.site-header');
  if (!header) return;

  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 20);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function initMobileNav() {
  const btn = document.querySelector('.mobile-menu-btn');
  const nav = document.querySelector('.mobile-nav');
  const overlay = document.querySelector('.mobile-overlay');
  const closeBtn = document.querySelector('.mobile-nav-close');

  if (!btn || !nav) return;

  const open = () => {
    nav.classList.add('open');
    overlay?.classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  const close = () => {
    nav.classList.remove('open');
    overlay?.classList.remove('open');
    document.body.style.overflow = '';
  };

  btn.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  overlay?.addEventListener('click', close);
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
}

function initSearch() {
  const openBtns = document.querySelectorAll('[data-search-open]');
  const overlay = document.querySelector('.search-overlay');
  const closeBtn = document.querySelector('.search-close');
  const input = document.querySelector('.search-input');

  if (!overlay) return;

  openBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.classList.add('open');
      setTimeout(() => input?.focus(), 100);
    });
  });

  closeBtn?.addEventListener('click', () => overlay.classList.remove('open'));

  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') overlay.classList.remove('open');
  });

  document.querySelector('.search-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const q = input?.value.trim().toLowerCase();
    if (q) window.location.href = `shop.html?search=${encodeURIComponent(q)}`;
  });
}

function initFadeIn() {
  const els = document.querySelectorAll('.fade-in');
  if (!els.length) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  els.forEach(el => observer.observe(el));
}

function initNewsletterPopup() {
  const popup = document.querySelector('.newsletter-popup');
  if (!popup) return;
  if (sessionStorage.getItem('shoephile_popup_dismissed')) return;

  setTimeout(() => popup.classList.add('open'), 8000);

  popup.querySelector('.popup-close')?.addEventListener('click', () => {
    popup.classList.remove('open');
    sessionStorage.setItem('shoephile_popup_dismissed', '1');
  });

  popup.addEventListener('click', e => {
    if (e.target === popup) {
      popup.classList.remove('open');
      sessionStorage.setItem('shoephile_popup_dismissed', '1');
    }
  });

  popup.querySelector('form')?.addEventListener('submit', e => {
    e.preventDefault();
    if (typeof Cart !== 'undefined' && Cart.showToast) {
      Cart.showToast('Thank you for subscribing');
    }
    popup.classList.remove('open');
    sessionStorage.setItem('shoephile_popup_dismissed', '1');
  });
}

function initFAQ() {
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.parentElement;
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });
}

function initNewsletterForms() {
  document.querySelectorAll('.newsletter-form').forEach(form => {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const input = form.querySelector('input[type="email"]');
      const email = input ? input.value.trim() : '';

      try {
        const res = await fetch('/api/newsletter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');

        if (typeof Cart !== 'undefined' && Cart.showToast) {
          Cart.showToast(data.message || 'Thank you for subscribing');
        }
        form.reset();
      } catch (err) {
        if (typeof Cart !== 'undefined' && Cart.showToast) {
          Cart.showToast(err.message || 'Could not subscribe');
        }
      }
    });
  });
}

function createProductCard(product) {
  const inWish = typeof Cart !== 'undefined' && Cart.isInWishlist
    ? Cart.isInWishlist(product.id)
    : false;

  return `
    <article class="product-card fade-in" data-id="${product.id}">
      <div class="product-image-wrap">
        ${product.badge ? `<span class="product-badge">${product.badge}</span>` : ''}
        <button class="product-wishlist ${inWish ? 'active' : ''}" data-wishlist="${product.id}" aria-label="Add to wishlist">
          <svg class="icon-sm" viewBox="0 0 24 24" ${inWish ? 'fill="currentColor"' : ''}>
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
        <a href="product.html?id=${product.id}">
          <img src="${productImageUrl((product.images && product.images[0]) || '')}" alt="${product.name}" loading="lazy">
        </a>
        <div class="product-actions">
          <button class="btn btn-primary btn-sm" data-quick-add="${product.id}">Add to Bag</button>
          <a href="product.html?id=${product.id}" class="btn btn-outline btn-sm">Quick View</a>
        </div>
      </div>
      <div class="product-info">
        <p class="product-category">${product.category}</p>
        <h3 class="product-name"><a href="product.html?id=${product.id}">${product.name}</a></h3>
        <p class="product-price">${priceHtml(product)}</p>
      </div>
    </article>
  `;
}

function bindProductEvents(container) {
  if (!container) return;

  container.querySelectorAll('[data-wishlist]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const id = parseInt(btn.dataset.wishlist, 10);
      if (typeof Cart === 'undefined' || !Cart.toggleWishlist) return;

      const active = Cart.toggleWishlist(id);
      btn.classList.toggle('active', active);
      const svg = btn.querySelector('svg');
      if (svg) svg.setAttribute('fill', active ? 'currentColor' : 'none');
    });
  });

  container.querySelectorAll('[data-quick-add]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof Cart !== 'undefined' && Cart.addToCart) {
        Cart.addToCart(parseInt(btn.dataset.quickAdd, 10));
      }
    });
  });
}

function initShopPage() {
  const grid = document.getElementById('shop-grid');
  if (!grid) return;

  const urlParams = new URLSearchParams(window.location.search);
  let currentCategory = urlParams.get('category') || 'all';
  let currentSort = 'featured';
  const searchQuery = urlParams.get('search');

  function render() {
    let products = typeof filterProducts === 'function'
      ? filterProducts(currentCategory, currentSort)
      : ((typeof PRODUCTS !== 'undefined' ? PRODUCTS : null) || window.PRODUCTS || []);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      products = products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    }

    grid.innerHTML = products.length
      ? products.map(createProductCard).join('')
      : '<p class="text-center text-muted" style="grid-column:1/-1;padding:4rem 0;">No products found.</p>';

    bindProductEvents(grid);
    initFadeIn();
  }

  document.querySelectorAll('.filter-btn').forEach(btn => {
    if (btn.dataset.category === currentCategory) btn.classList.add('active');

    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.category;
      render();
    });
  });

  document.getElementById('sort-select')?.addEventListener('change', e => {
    currentSort = e.target.value;
    render();
  });

  render();
}

function initProductPage() {
  const container = document.getElementById('product-detail');
  if (!container) return;

  const id = new URLSearchParams(window.location.search).get('id') || '1';
  const product = typeof getProductById === 'function' ? getProductById(id) : null;

  if (!product) {
    container.innerHTML = `
      <div class="container text-center" style="padding:6rem 0;">
        <h2>Product not found</h2>
        <a href="shop.html" class="btn btn-primary" style="margin-top:1.5rem;">Back to Shop</a>
      </div>`;
    return;
  }

  let selectedSize = product.sizes[2] || product.sizes[0];
  let selectedColor = product.colors[0]?.name || '';
  let currentImage = 0;

  function render() {
    container.innerHTML = `
      <div class="container">
        <nav class="breadcrumb" style="margin-bottom:2rem;">
          <a href="index.html">Home</a> / <a href="shop.html">Shop</a> / ${product.name}
        </nav>
        <div class="product-detail-grid">
          <div class="product-gallery">
            <div class="gallery-thumbs">
              ${product.images.map((img, i) => `
                <div class="gallery-thumb ${i === currentImage ? 'active' : ''}" data-index="${i}">
                  <img src="${productImageUrl(img)}" alt="${product.name}">
                </div>
              `).join('')}
            </div>
            <div class="gallery-main">
              <img src="${productImageUrl(product.images[currentImage])}" alt="${product.name}">
            </div>
          </div>
          <div class="product-detail-info">
            <p class="product-category">${product.category}${product.badge ? ' · ' + product.badge : ''}</p>
            <h1>${product.name}</h1>
            <p class="product-detail-price">${priceHtml(product)}</p>
            <p class="product-detail-desc">${product.description}</p>
            <div class="option-group">
              <div class="option-label">Color — <span>${selectedColor}</span></div>
              <div class="color-options">
                ${product.colors.map(c => `
                  <button class="color-btn ${c.name === selectedColor ? 'active' : ''}"
                    style="background:${c.hex}" data-color="${c.name}" title="${c.name}" aria-label="${c.name}"></button>
                `).join('')}
              </div>
            </div>
            <div class="option-group">
              <div class="option-label">Size — EU <a href="#">Size Guide</a></div>
              <div class="size-options">
                ${product.sizes.map(s => `
                  <button class="size-btn ${s === selectedSize ? 'active' : ''}" data-size="${s}">${s}</button>
                `).join('')}
              </div>
            </div>
            <div class="product-detail-actions">
              <button class="btn btn-primary" id="add-to-cart-btn">Add to Bag</button>
              <button class="btn btn-outline" id="buy-now-btn">Buy Now</button>
              <button class="btn btn-ghost" id="wishlist-btn" aria-label="Wishlist">
                <svg class="icon" viewBox="0 0 24 24" ${typeof Cart !== 'undefined' && Cart.isInWishlist && Cart.isInWishlist(product.id) ? 'fill="currentColor"' : ''}>
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </button>
            </div>
            <div class="product-meta">
              <span>${product.details || ''}</span>
              <span>Standard shipping PKR 300 across Pakistan</span>
              <span>Returns within 30 days</span>
            </div>
          </div>
        </div>
        <section class="section" style="padding-top:2rem;">
          <h2 class="section-title text-center">You May Also Like</h2>
          <div class="product-grid" id="related-grid" style="margin-top:2rem;"></div>
        </section>
      </div>
    `;

    container.querySelectorAll('.gallery-thumb').forEach(thumb => {
      thumb.addEventListener('click', () => {
        currentImage = parseInt(thumb.dataset.index, 10);
        render();
      });
    });

    container.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedColor = btn.dataset.color;
        render();
      });
    });

    container.querySelectorAll('.size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedSize = parseInt(btn.dataset.size, 10);
        render();
      });
    });

    container.querySelector('#add-to-cart-btn')?.addEventListener('click', () => {
      if (typeof Cart !== 'undefined' && Cart.addToCart) {
        Cart.addToCart(product.id, selectedSize, selectedColor);
      }
    });

    container.querySelector('#buy-now-btn')?.addEventListener('click', () => {
      if (typeof Cart !== 'undefined' && Cart.addToCart) {
        Cart.addToCart(product.id, selectedSize, selectedColor);
        window.location.href = 'checkout.html';
      }
    });

    container.querySelector('#wishlist-btn')?.addEventListener('click', () => {
      if (typeof Cart !== 'undefined' && Cart.toggleWishlist) {
        Cart.toggleWishlist(product.id);
        render();
      }
    });

       const related = ((typeof PRODUCTS !== 'undefined' ? PRODUCTS : null) || window.PRODUCTS || []).filter(p => p.category === product.category && p.id !== product.id).slice(0, 4);
    const relatedGrid = container.querySelector('#related-grid');
    if (relatedGrid) {
      relatedGrid.innerHTML = related.map(createProductCard).join('');
      bindProductEvents(relatedGrid);
    }
  }

  render();
}

function initCartPage() {
  const container = document.getElementById('cart-content');
  if (!container) return;

  function render() {
    if (typeof Cart === 'undefined') return;

    const cart = Cart.getCart();
    if (cart.length === 0) {
      container.innerHTML = `
        <div class="empty-cart">
          <h2>Your bag is empty</h2>
          <p>Discover our latest collection and find your perfect pair.</p>
          <a href="shop.html" class="btn btn-primary">Shop Collection</a>
        </div>`;
      return;
    }

    const totals = (typeof Cart.getOrderTotals === 'function')
      ? Cart.getOrderTotals(0)
      : {
          subtotal: Cart.getCartTotal(),
          shippingFee: 300,
          total: Cart.getCartTotal() + 300,
          freeShipping: false,
          amountToFreeShipping: 0
        };

    const { subtotal, shippingFee: shipping, total, freeShipping, amountToFreeShipping = 0 } = totals;

    container.innerHTML = `
      <div class="cart-layout">
        <div class="cart-items">
          ${cart.map((item, i) => `
            <div class="cart-item">
              <div class="cart-item-image">
                <a href="product.html?id=${item.id}"><img src="${item.image}" alt="${item.name}"></a>
              </div>
              <div class="cart-item-info">
                <h3><a href="product.html?id=${item.id}">${item.name}</a></h3>
                <p class="cart-item-meta">Size: EU ${item.size} · Color: ${item.color}</p>
                <div class="qty-selector">
                  <button class="qty-btn" data-action="dec" data-index="${i}">−</button>
                  <span class="qty-value">${item.qty}</span>
                  <button class="qty-btn" data-action="inc" data-index="${i}">+</button>
                </div>
                <button class="cart-item-remove" data-remove="${i}">Remove</button>
              </div>
              <div class="cart-item-price">${formatPrice(item.price * item.qty)}</div>
            </div>
          `).join('')}
        </div>
        <div class="cart-summary">
          <h3>Order Summary</h3>
          <div class="summary-row"><span>Subtotal</span><span>${formatPrice(subtotal)}</span></div>
          <div class="summary-row"><span>Shipping</span><span>${freeShipping ? '<span style="color:var(--success)">FREE</span>' : formatPrice(shipping)}</span></div>
          <div class="summary-row total"><span>Total</span><span>${formatPrice(total)}</span></div>
          ${!freeShipping && amountToFreeShipping > 0
            ? `<p style="font-size:0.8rem;color:var(--rose);margin:0.75rem 0;text-align:center;">Add ${formatPrice(amountToFreeShipping)} more for free shipping</p>`
            : ''}
          <a href="checkout.html" class="btn btn-primary btn-full">Proceed to Checkout</a>
          <a href="shop.html" class="btn btn-ghost btn-full" style="margin-top:0.75rem;text-align:center;">Continue Shopping</a>
          <p style="font-size:0.75rem;color:var(--muted);margin-top:1rem;text-align:center;">Shipping PKR 300 · Free above PKR 3,000</p>
        </div>
      </div>`;

    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        const cart = Cart.getCart();
        const newQty = btn.dataset.action === 'inc' ? cart[idx].qty + 1 : cart[idx].qty - 1;
        Cart.updateQty(idx, newQty);
        render();
      });
    });

    container.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        Cart.removeFromCart(parseInt(btn.dataset.remove, 10));
        render();
      });
    });
  }

  render();
}

function initCheckoutPage() {
  const container = document.getElementById('checkout-content');
  if (!container) return;

  if (typeof Cart === 'undefined') return;

  const cart = Cart.getCart();
  if (cart.length === 0) {
    container.innerHTML = `
      <div class="empty-cart">
        <h2>Your bag is empty</h2>
        <p>Add items to your bag before checking out.</p>
        <a href="shop.html" class="btn btn-primary">Shop Collection</a>
      </div>`;
    return;
  }

  const ckTotals = (typeof Cart.getOrderTotals === 'function')
    ? Cart.getOrderTotals(0)
    : {
        subtotal: Cart.getCartTotal(),
        shippingFee: 300,
        total: Cart.getCartTotal() + 300,
        freeShipping: false
      };

  const { subtotal, shippingFee: shipping, total, freeShipping } = ckTotals;

  container.innerHTML = `
    <div class="checkout-layout">
      <div class="checkout-form">
        <form id="checkout-form">
          <div class="form-section">
            <h2>Contact Information</h2>
            <div class="form-group">
              <label for="email">Email Address</label>
              <input type="email" id="email" name="email" required placeholder="you@example.com">
            </div>
            <div class="form-group">
              <label for="phone">Phone Number (Pakistan)</label>
              <div class="phone-input-wrap">
                <span class="phone-prefix">+92</span>
                <input type="tel" id="phone" name="phone" inputmode="numeric" pattern="[0-9]{10}" maxlength="10" placeholder="3XXXXXXXXX" required>
              </div>
              <small style="color:var(--muted);font-size:0.75rem;">Enter 10 digits without leading 0 (e.g. 3001234567)</small>
            </div>
          </div>

          <div class="form-section">
            <h2>Shipping Address</h2>
            <div class="form-row">
              <div class="form-group">
                <label for="firstName">First Name</label>
                <input type="text" id="firstName" name="firstName" required>
              </div>
              <div class="form-group">
                <label for="lastName">Last Name</label>
                <input type="text" id="lastName" name="lastName" required>
              </div>
            </div>
            <div class="form-group">
              <label for="address">Address</label>
              <input type="text" id="address" name="address" required placeholder="Street address">
            </div>
            <div class="form-group">
              <label for="apartment">Apartment, suite, etc. (optional)</label>
              <input type="text" id="apartment" name="apartment">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="city">City</label>
                <input type="text" id="city" name="city" required>
              </div>
              <div class="form-group">
                <label for="province">Province</label>
                <select id="province" name="province" required>
                  <option value="">Select province</option>
                  <option value="Punjab">Punjab</option>
                  <option value="Sindh">Sindh</option>
                  <option value="Khyber Pakhtunkhwa">Khyber Pakhtunkhwa</option>
                  <option value="Balochistan">Balochistan</option>
                  <option value="Islamabad Capital Territory">Islamabad Capital Territory</option>
                  <option value="Gilgit-Baltistan">Gilgit-Baltistan</option>
                  <option value="Azad Jammu & Kashmir">Azad Jammu & Kashmir</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="postal">Postal Code</label>
                <input type="text" id="postal" name="postal" required>
              </div>
              <div class="form-group">
                <label for="country">Country</label>
                <select id="country" name="country" required>
                  <option value="Pakistan" selected>Pakistan</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label for="couponCode">Coupon code (optional)</label>
              <div style="display:flex;gap:0.5rem;">
                <input type="text" id="couponCode" name="couponCode" placeholder="e.g. WELCOME10" style="flex:1;">
                <button type="button" class="btn btn-outline" id="apply-coupon-btn" style="padding:0.75rem 1.25rem;">Apply</button>
              </div>
              <p id="coupon-message" style="font-size:0.8rem;margin-top:0.5rem;"></p>
            </div>
          </div>

          <div class="form-section">
            <h2>Payment Method</h2>
            <div class="payment-options">
              <label class="payment-option selected">
                <input type="radio" name="payment" value="cod" checked>
                <span>Cash on Delivery (COD)</span>
              </label>
              <label class="payment-option">
                <input type="radio" name="payment" value="card">
                <span>Debit / Credit Card</span>
              </label>
              <label class="payment-option">
                <input type="radio" name="payment" value="nayapay">
                <span>NayaPay</span>
              </label>
            </div>
            <div id="card-fields" class="payment-instructions">
              <p style="margin-bottom:0.75rem;">Card payments are processed securely. Full gateway integration can be connected later — your order will be recorded and our team will confirm payment.</p>
              <div class="form-group">
                <label for="cardNumber">Card Number</label>
                <input type="text" id="cardNumber" name="cardNumber" placeholder="1234 5678 9012 3456" autocomplete="cc-number">
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="expiry">Expiry</label>
                  <input type="text" id="expiry" name="expiry" placeholder="MM / YY" autocomplete="cc-exp">
                </div>
                <div class="form-group">
                  <label for="cvc">CVC</label>
                  <input type="text" id="cvc" name="cvc" placeholder="123" autocomplete="cc-csc">
                </div>
              </div>
            </div>
            <div id="nayapay-info" class="payment-instructions">
              <strong>NayaPay</strong><br>
              Pay securely with NayaPay. After placing your order you will receive confirmation and payment instructions. NayaPay credentials are configured server-side and never exposed in the browser.
            </div>
          </div>

          <button type="submit" class="btn btn-primary btn-full">Place Order — ${formatPrice(total)}</button>
          <p style="font-size:0.75rem;color:var(--muted);text-align:center;margin-top:1rem;">Your payment information is encrypted and secure.</p>
        </form>
      </div>

      <div class="order-summary-box">
        <h3>Order Summary</h3>
        ${cart.map(item => `
          <div class="order-item">
            <div class="order-item-img"><img src="${item.image}" alt="${item.name}"></div>
            <div class="order-item-info">
              <div class="name">${item.name}</div>
              <div class="meta">EU ${item.size} · ${item.color} · Qty ${item.qty}</div>
            </div>
            <div>${formatPrice(item.price * item.qty)}</div>
          </div>
        `).join('')}
        <div style="border-top:1px solid var(--border);margin-top:1rem;padding-top:1rem;">
          <div class="summary-row"><span>Subtotal</span><span>${formatPrice(subtotal)}</span></div>
          <div class="summary-row"><span>Shipping</span><span>${freeShipping ? '<span style="color:var(--success)">FREE</span>' : formatPrice(shipping)}</span></div>
          <div class="summary-row total"><span>Total</span><span>${formatPrice(total)}</span></div>
          <p style="font-size:0.75rem;color:var(--muted);margin-top:0.75rem;">Shipping PKR 300 · Free above PKR 3,000</p>
        </div>
      </div>
    </div>`;

  function updatePaymentUI(val) {
    ['card-fields', 'nayapay-info'].forEach(id => {
      const el = container.querySelector('#' + id);
      if (el) {
        el.classList.toggle('visible',
          (id === 'card-fields' && val === 'card') ||
          (id === 'nayapay-info' && val === 'nayapay')
        );
      }
    });
  }

  container.querySelectorAll('.payment-option').forEach(opt => {
    opt.addEventListener('click', () => {
      container.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const input = opt.querySelector('input');
      if (input) input.checked = true;
      updatePaymentUI(input?.value || 'cod');
    });
  });

  updatePaymentUI('cod');

  // Coupon apply
  container.querySelector('#apply-coupon-btn')?.addEventListener('click', async () => {
    const code = (container.querySelector('#couponCode')?.value || '').trim();
    const msg = container.querySelector('#coupon-message');

    if (!code) {
      if (msg) msg.textContent = 'Enter a coupon code.';
      return;
    }

    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal: Cart.getCartTotal() })
      });
      const data = await res.json();

      if (!res.ok || !data.valid) {
        window.__appliedCoupon = null;
        if (msg) {
          msg.style.color = 'var(--error)';
          msg.textContent = data.error || 'Invalid coupon';
        }
        return;
      }

      window.__appliedCoupon = data.code;
      if (msg) {
        msg.style.color = 'var(--success)';
        msg.textContent = `Applied: ${data.message} (−${formatPrice(data.discount)})`;
      }

      if (typeof Cart.getOrderTotals === 'function') {
        const t = Cart.getOrderTotals(data.discount || 0);
        const totalBtn = container.querySelector('button[type="submit"]');
        if (totalBtn) totalBtn.textContent = `Place Order — ${formatPrice(t.total)}`;
      }
    } catch (err) {
      if (msg) {
        msg.style.color = 'var(--error)';
        msg.textContent = 'Could not validate coupon.';
      }
    }
  });

  container.querySelector('#checkout-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const payment = form.querySelector('input[name="payment"]:checked')?.value || 'cod';

    let phoneValue;
    try {
      const digits = (form.phone?.value || '').replace(/\D/g, '');
      if (!/^3\d{9}$/.test(digits)) {
        alert('Please enter a valid Pakistani mobile number (10 digits starting with 3).');
        return;
      }
      phoneValue = '+92' + digits;
    } catch {
      return;
    }

    const payload = {
      email: form.email?.value?.trim(),
      phone: phoneValue,
      firstName: form.firstName?.value?.trim(),
      lastName: form.lastName?.value?.trim() || '',
      address: form.address?.value?.trim() || '',
      apartment: form.apartment?.value?.trim() || '',
      city: form.city?.value?.trim() || '',
      province: form.province?.value?.trim() || '',
      postal: form.postal?.value?.trim() || '',
      country: form.country?.value || 'Pakistan',
      payment,
      couponCode: (window.__appliedCoupon || form.couponCode?.value || '').trim() || undefined,
      items: cart,
      subtotal,
      shippingFee: shipping,
      total
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Order failed');

      Cart.clearCart();
      const on = data.order?.orderNumber || '';
      const when = data.order?.createdAtLocal || '';

      container.innerHTML = `
        <div class="empty-cart" style="max-width:500px;margin:0 auto;">
          <h2>Thank You</h2>
          <p style="margin-bottom:0.5rem;">Your order has been placed successfully.</p>
          ${on ? `<p style="margin-bottom:0.35rem;"><strong>Order ID:</strong> ${on}</p>` : ''}
          ${when ? `<p style="color:var(--muted);font-size:0.9rem;margin-bottom:0.5rem;">${when}</p>` : ''}
          <p style="color:var(--muted);font-size:0.9rem;margin-bottom:1.5rem;">We will contact you shortly to confirm your order. Save your Order ID to track status anytime.</p>
          <div style="display:flex;flex-wrap:wrap;gap:0.75rem;justify-content:center;">
            ${on ? `<a href="track.html?id=${encodeURIComponent(on)}" class="btn btn-primary">Track Order</a>` : ''}
            <a href="index.html" class="btn btn-outline">Return Home</a>
          </div>
        </div>`;

      if (Cart.updateBadges) Cart.updateBadges();
    } catch (err) {
      alert(err.message || 'Could not place order. Please try again.');
    }
  });
}

function renderHomeProducts() {
  const newArrivals = document.getElementById('new-arrivals-grid');
  const featured = document.getElementById('featured-grid');
  const bestsellers = document.getElementById('bestsellers-grid');
    const products = (typeof PRODUCTS !== 'undefined' && PRODUCTS.length)
    ? PRODUCTS
    : (window.PRODUCTS || []);

  if (newArrivals) {
    const items = products.filter(p => p.isNew || p.badge === 'New' || p.badge === 'Luxury').slice(0, 4);
    const list = items.length ? items : products.slice(0, 4);
    newArrivals.innerHTML = list.length
      ? list.map(createProductCard).join('')
      : '<p class="text-center text-muted" style="grid-column:1/-1;">No products yet. Add items from Admin.</p>';
    bindProductEvents(newArrivals);
  }

  if (featured) {
    const items = products.filter(p => p.featured).slice(0, 4);
    const list = items.length ? items : products.slice(0, 4);
    featured.innerHTML = list.length
      ? list.map(createProductCard).join('')
      : '<p class="text-center text-muted" style="grid-column:1/-1;">No products yet.</p>';
    bindProductEvents(featured);
  }

  if (bestsellers) {
    const items = products.filter(p => p.isBestSeller || p.badge === 'Bestseller').slice(0, 4);
    const list = items.length ? items : products.slice(0, 4);
    bestsellers.innerHTML = list.length ? list.map(createProductCard).join('') : '';
    if (list.length) bindProductEvents(bestsellers);
  }

  initFadeIn();
}

/* =========================================
   SHOEPHILE — Announcement Bar Rotation
   ========================================= */
const announcements = [
  "NEW ARRIVALS — SHOP NOW",
  "FREE SHIPPING ABOVE PKR 3,000",
  "10 DAYS EASY EXCHANGE"
];

let announcementIndex = 0;
const announcementText = document.getElementById("announcementText");

if (announcementText) {
  setInterval(() => {
    announcementText.classList.remove("fade-in");
    announcementText.classList.add("fade-out");

    setTimeout(() => {
      announcementIndex = (announcementIndex + 1) % announcements.length;
      announcementText.textContent = announcements[announcementIndex];

      announcementText.classList.remove("fade-out");
      announcementText.classList.add("fade-in");

      setTimeout(() => {
        announcementText.classList.remove("fade-in");
      }, 400);
    }, 400);
  }, 3500);
}