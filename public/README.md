# SHOEPHILE — Luxury Women's Footwear

A complete, production-ready e-commerce website for **SHOEPHILE**, a premium women's footwear brand.

Inspired by the minimal editorial aesthetic of Celine, Polène, and Aeyde.

---

## Features

- **Homepage** — Full-bleed hero, New Arrivals, Bestsellers, Featured Collection, Brand Story, Reviews, Instagram gallery, Newsletter
- **Shop** — Product grid with category filters, sorting, and search
- **Product Detail** — Multi-image gallery, size & color selection, add to cart / buy now, reviews, related products
- **Shopping Cart** — Quantity controls, remove items, order summary, free shipping threshold
- **Checkout** — Contact & shipping forms, payment options (Card / PayPal / COD), order summary, success state
- **About** — Brand story, craftsmanship, values, quality promise
- **Contact** — Contact form, email, social links, FAQ accordion

### Extra

- Fully responsive (mobile, tablet, desktop)
- Sticky navigation + mobile hamburger menu
- Dark / light mode toggle
- Wishlist (localStorage)
- Shopping cart with persistent storage
- Product search overlay
- Newsletter popup
- Smooth fade-in animations
- Toast notifications
- SEO-friendly structure & meta tags

---

## Folder Structure

```
SHOEPHILE/
├── index.html
├── shop.html
├── product.html
├── cart.html
├── checkout.html
├── about.html
├── contact.html
├── css/
│   └── style.css
├── js/
│   ├── main.js
│   ├── products.js
│   └── cart.js
├── images/
└── README.md
```

---

## Getting Started

1. Open the project folder.
2. Serve with any static server, or open `index.html` directly in a browser.

**Recommended (local server):**

```bash
# Python
python -m http.server 8000

# Node (npx)
npx serve .
```

Then visit `http://localhost:8000`.

---

## Tech Stack

- HTML5
- CSS3 (custom properties, Grid, Flexbox)
- Vanilla JavaScript (ES6+)
- Google Fonts — Cormorant Garamond + Jost
- Unsplash images (placeholder product photography)

No frameworks or build tools required.

---

## Design System

| Token        | Value                    |
|--------------|--------------------------|
| Background   | Ivory `#faf9f7`          |
| Text         | Near-black `#1a1a1a`     |
| Accent       | Warm taupe / dusty pink  |
| Display font | Cormorant Garamond       |
| Body font    | Jost                     |

---

## Notes

- Cart and wishlist data persist in `localStorage`.
- Product data lives in `js/products.js` — edit this file to add or update products.
- Images are loaded from Unsplash; replace with your own assets in production.
- Payment is simulated; integrate a real gateway for live use.

---

© 2026 SHOEPHILE. Designed for commercial launch readiness.
