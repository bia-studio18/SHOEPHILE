# SHOEPHILE — Luxury Women's Footwear

Full-stack store: Express + MongoDB Atlas + static frontend (premium editorial design).

## Setup

```bash
cd SHOEPHILE
npm install
cp .env.example .env
# Edit .env: MONGODB_URI, ADMIN_PASSWORD, SMTP_PASS (Gmail App Password)
npm start
```

Open http://localhost:3000  
Admin: http://localhost:3000/admin.html (password from `ADMIN_PASSWORD` env)

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB Atlas connection string |
| `MONGODB_DB` | No | Database name (default `shoephile`) |
| `ADMIN_PASSWORD` | Yes | Admin panel password (never commit real value) |
| `ADMIN_EMAIL` | No | Optional admin email |
| `CONTACT_EMAIL` | Yes | Receives order + contact notifications |
| `SMTP_USER` / `SMTP_PASS` | For email | Gmail + App Password |

## Key features (Pakistan-ready)

- Currency: **PKR (Rs)** · Flat shipping **PKR 300**
- Payments: COD, JazzCash, Easypaisa, Debit/Credit Card
- Phone: +92 with Pakistani mobile validation
- Categories: **Flats** only
- Order & contact emails to `CONTACT_EMAIL`
- Admin: order filters (Pending / Processing / Delivered / Cancelled / Paid / Unpaid), search by name / order # / phone, multi-select product delete
- Logo: custom SHOEPHILE mark in header & footer

## Deploy (Vercel)

1. Connect repo or upload project  
2. Set env vars in Vercel project settings  
3. Build command: leave empty (or `npm install`)  
4. `vercel.json` routes all traffic through `server.js`

Without `SMTP_PASS`, forms still succeed; emails are logged to the server console.
