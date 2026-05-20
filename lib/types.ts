export type Product = {
  id: string;
  user_id: string;
  name: string;
  category: string | null;
  supplier: string | null;
  notes: string | null;
  created_at: string;
};

export type Batch = {
  id: string;
  user_id: string;
  product_id: string;
  quantity: number;
  remaining: number;
  unit_cost: number;
  bought_at: string;
  created_at: string;
};

export type Ad = {
  id: string;
  user_id: string;
  title: string;
  ggmax_id: string | null;
  status: string | null;
  created_at: string;
};

export type AdOption = {
  id: string;
  user_id: string;
  ad_id: string;
  product_id: string;
  label: string;
  multiplier: number;
  price: number;
  created_at: string;
};

export type Sale = {
  id: string;
  user_id: string;
  ad_id: string | null;
  option_id: string | null;
  product_id: string | null;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  sold_at: string;
};
