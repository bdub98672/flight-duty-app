# Flight & Duty Log

Deployable Next.js + Supabase app for Part 135-style duty, rest, totals, currency tracking, monthly sign-off, and audit events.

## 1. Install
```bash
npm install
```

## 2. Set environment variables
Copy `.env.example` to `.env.local` and fill in your Supabase values.

## 3. Create Supabase tables
Run the SQL in `supabase/schema.sql` in the Supabase SQL editor.

## 4. Start locally
```bash
npm run dev
```

## 5. Deploy
Push this project to GitHub and import it into Vercel.

## Notes
- The included RLS policies are open for testing only.
- Before production use, replace them with real user-based policies.
