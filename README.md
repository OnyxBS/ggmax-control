# GGMAX Control FULL Blue Fixed

Versão limpa e corrigida.

## Rodar

```bash
npm install
npm run dev
```

## Supabase

Rode `supabase/schema.sql` no SQL Editor.

## Webhook GGMAX

Rota:

```txt
/api/ggmax/webhook
```

URL online:

```txt
https://ggmax-control.vercel.app/api/ggmax/webhook
```

Na Vercel, adicione:

```txt
SUPABASE_SERVICE_ROLE_KEY
```

## Deploy

```bash
git init
git add .
git commit -m "full blue fixed"
git branch -M main
git remote add origin https://github.com/OnyxBS/ggmax-control.git
git push -u origin main --force
```
