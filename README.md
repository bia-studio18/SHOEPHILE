# SHOEPHILE — Love Affair with Shoes

Premium women's flats e-commerce. Express + MongoDB Atlas + static frontend.

**Theme:** Ivory `#FFF8F3` + Soft Rose Pink `#D8A0A8` / Deep Rose `#B97883`  
**Typography:** Cormorant Garamond + Jost  
**Location:** Lahore, Pakistan · Currency: PKR

## Setup

```bash
cd SHOEPHILE
npm install
cp .env.example .env
# Edit .env: MONGODB_URI, ADMIN_PASSWORD, SMTP_PASS (Gmail App Password)
npm start
```

- Store: http://localhost:3000  
- Admin: http://localhost:3000/admin.html (password from `ADMIN_PASSWORD`)

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB Atlas connection string |
| `MONGODB_DB` | No | Database name (default `shoephile`) |
| `ADMIN_PASSWORD` | Yes | Admin panel password |
| `CONTACT_EMAIL` | Yes | Receives order + contact notifications |
| `SMTP_USER` / `SMTP_PASS` | For email | Gmail + App Password |

## Key features

- **Products:** Multi-image, color names, sizes 36–41, stock by size+color, featured / new / best-seller flags, SKU
- **Cart & Checkout:** Guest checkout, free shipping above PKR 3,000, server-side totals
- **Payments:** COD · Card · NayaPay (structure ready; credentials via env later)
- **Coupons:** Admin create/edit, server-validated on order
- **Reviews:** Customer submit → pending → admin approve → public display
- **Orders:** Full status timeline, tracking page, admin filters
- **Email:** Order confirmation to customer + admin notification
- **Policies:** Shipping, Returns (10-day), Privacy, Terms, FAQ
- **SEO:** Meta, OG, robots.txt, sitemap

## Deploy (Vercel)

1. Connect repo  
2. Set env vars in Vercel project settings  
3. Build: leave empty or `npm install`  
4. `vercel.json` routes all traffic through `server.js`

Without `SMTP_PASS`, forms still succeed; emails are logged to the console.

## Collections (MongoDB)

- `products` — existing, extended with stock / flags  
- `orders` — existing, extended with discount / coupon  
- `subscribers` — existing  
- `coupons` — new  
- `reviews` — new  
