create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  category text default '',
  supplier text default '',
  notes text default '',
  created_at timestamp with time zone default now()
);

create table if not exists batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  product_id uuid references products(id) on delete cascade not null,
  quantity int not null,
  remaining int not null,
  unit_cost numeric not null,
  bought_at date not null default current_date,
  created_at timestamp with time zone default now()
);

create table if not exists ads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  ggmax_id text default '',
  status text default 'ativo',
  created_at timestamp with time zone default now()
);

create table if not exists ad_options (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  ad_id uuid references ads(id) on delete cascade not null,
  product_id uuid references products(id) on delete cascade not null,
  label text not null,
  multiplier int not null,
  price numeric not null,
  created_at timestamp with time zone default now()
);

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  ad_id uuid references ads(id),
  option_id uuid references ad_options(id),
  product_id uuid references products(id),
  quantity int not null,
  revenue numeric not null,
  cost numeric not null,
  profit numeric not null,
  sold_at timestamp with time zone default now()
);

create table if not exists webhook_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  source text default 'ggmax',
  status text not null default 'received',
  raw_payload jsonb,
  parsed jsonb,
  error text,
  created_at timestamp with time zone default now()
);

alter table products add column if not exists category text default '';
alter table products add column if not exists supplier text default '';
alter table products add column if not exists notes text default '';
alter table ads add column if not exists ggmax_id text default '';
alter table ads add column if not exists status text default 'ativo';

alter table products enable row level security;
alter table batches enable row level security;
alter table ads enable row level security;
alter table ad_options enable row level security;
alter table sales enable row level security;
alter table webhook_logs enable row level security;

drop policy if exists "Users can manage own products" on products;
drop policy if exists "Users can manage own batches" on batches;
drop policy if exists "Users can manage own ads" on ads;
drop policy if exists "Users can manage own ad options" on ad_options;
drop policy if exists "Users can manage own sales" on sales;
drop policy if exists "Users can read own webhook logs" on webhook_logs;

create policy "Users can manage own products" on products for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own batches" on batches for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own ads" on ads for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own ad options" on ad_options for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own sales" on sales for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can read own webhook logs" on webhook_logs for select using (auth.uid() = user_id);
