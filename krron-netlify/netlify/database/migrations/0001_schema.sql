-- Krron – Datenbankschema (PostgreSQL / Netlify Database)

CREATE TABLE roles (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255),
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
  id          SERIAL PRIMARY KEY,
  perm_key    VARCHAR(60) NOT NULL UNIQUE,
  description VARCHAR(255)
);

CREATE TABLE role_permissions (
  role_id       INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
  id                    SERIAL PRIMARY KEY,
  email                 VARCHAR(190) NOT NULL UNIQUE,
  phone                 VARCHAR(30),
  display_name          VARCHAR(100),
  password_hash         VARCHAR(255) NOT NULL,
  role_id               INT NOT NULL REFERENCES roles(id),
  balance               NUMERIC(14,2) NOT NULL DEFAULT 0,
  force_password_change BOOLEAN NOT NULL DEFAULT TRUE,
  token_version         INT NOT NULL DEFAULT 0,   -- erhöhen = alle Sitzungen ungültig
  is_banned             BOOLEAN NOT NULL DEFAULT FALSE,
  ban_reason            VARCHAR(500),
  last_login_at         TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_role ON users(role_id);

CREATE TABLE categories (
  id         SERIAL PRIMARY KEY,
  parent_id  INT REFERENCES categories(id) ON DELETE SET NULL,
  name       VARCHAR(100) NOT NULL,
  slug       VARCHAR(120) NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id          SERIAL PRIMARY KEY,
  category_id INT REFERENCES categories(id) ON DELETE SET NULL,
  title       VARCHAR(190) NOT NULL,
  description TEXT,
  price       NUMERIC(14,2) NOT NULL CHECK (price >= 0),
  stock       INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image_url   VARCHAR(500),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sold_count  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_cat ON products(category_id);
CREATE INDEX idx_products_sold ON products(sold_count DESC);

-- type 'credit': 12-stelliger Guthaben-Code (value = Betrag)
-- type 'percent': Prozent-Gutschein (value = Prozent), optional auf Kategorie/Produkt
CREATE TABLE coupons (
  id          SERIAL PRIMARY KEY,
  code        CHAR(12) NOT NULL UNIQUE,
  type        VARCHAR(10) NOT NULL DEFAULT 'credit' CHECK (type IN ('credit','percent')),
  value       NUMERIC(14,2) NOT NULL CHECK (value > 0),
  category_id INT REFERENCES categories(id) ON DELETE SET NULL,
  product_id  INT REFERENCES products(id) ON DELETE SET NULL,
  max_uses    INT NOT NULL DEFAULT 1,
  used_count  INT NOT NULL DEFAULT 0,
  redeemed_by INT REFERENCES users(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE discounts (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  percent     NUMERIC(5,2) NOT NULL CHECK (percent > 0 AND percent <= 100),
  category_id INT REFERENCES categories(id) ON DELETE CASCADE,
  product_id  INT REFERENCES products(id) ON DELETE CASCADE,
  starts_at   TIMESTAMPTZ,
  ends_at     TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cart (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity   INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE TABLE delivery_zones (
  id        SERIAL PRIMARY KEY,
  name      VARCHAR(120) NOT NULL,
  fee       NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE orders (
  id               SERIAL PRIMARY KEY,
  user_id          INT NOT NULL REFERENCES users(id),
  status           VARCHAR(20) NOT NULL DEFAULT 'processing'
                   CHECK (status IN ('processing','express','in_delivery','delivered','cancelled')),
  delivery_zone_id INT REFERENCES delivery_zones(id) ON DELETE SET NULL,
  delivery_address VARCHAR(255) NOT NULL,
  payment_method   VARCHAR(10) NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','balance')),
  coupon_id        INT REFERENCES coupons(id) ON DELETE SET NULL,
  subtotal         NUMERIC(14,2) NOT NULL,
  discount_total   NUMERIC(14,2) NOT NULL DEFAULT 0,
  delivery_fee     NUMERIC(10,2) NOT NULL DEFAULT 0,
  total            NUMERIC(14,2) NOT NULL,
  cancel_reason    VARCHAR(500),
  cancelled_by     VARCHAR(10) CHECK (cancelled_by IN ('customer','admin')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);

CREATE TABLE order_items (
  id            SERIAL PRIMARY KEY,
  order_id      INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    INT REFERENCES products(id) ON DELETE SET NULL,
  product_title VARCHAR(190) NOT NULL,
  unit_price    NUMERIC(14,2) NOT NULL,
  quantity      INT NOT NULL
);
CREATE INDEX idx_oi_order ON order_items(order_id);

CREATE TABLE driver_notes (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id   INT REFERENCES orders(id) ON DELETE CASCADE,
  note       TEXT NOT NULL,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_dn_user ON driver_notes(user_id);

CREATE TABLE order_messages (
  id         SERIAL PRIMARY KEY,
  order_id   INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     VARCHAR(20),
  message    VARCHAR(500) NOT NULL,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_om_order ON order_messages(order_id);

CREATE TABLE reviews (
  id         SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating     SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE TABLE balance_transactions (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount     NUMERIC(14,2) NOT NULL,
  reason     VARCHAR(255),
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bt_user ON balance_transactions(user_id);

CREATE TABLE ui_blocks (
  id          SERIAL PRIMARY KEY,
  placement   VARCHAR(30) NOT NULL,
  type        VARCHAR(10) NOT NULL DEFAULT 'ad' CHECK (type IN ('hero','ad','tile','text')),
  title       VARCHAR(150),
  subtitle    VARCHAR(300),
  body        TEXT,
  button_text VARCHAR(60),
  link_url    VARCHAR(500),
  image_path  VARCHAR(500),
  image_alt   VARCHAR(150),
  image_fit   VARCHAR(10) NOT NULL DEFAULT 'cover' CHECK (image_fit IN ('cover','contain')),
  bg_color    CHAR(7),
  text_color  CHAR(7),
  height      SMALLINT NOT NULL DEFAULT 0,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at   TIMESTAMPTZ,
  ends_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ui_place ON ui_blocks(placement, sort_order);

CREATE TABLE settings (
  setting_key   VARCHAR(80) PRIMARY KEY,
  setting_value TEXT
);

-- Hochgeladene Bilder (Produkte, Banner, Logo). Auslieferung über /img/<id>.
CREATE TABLE media (
  id         SERIAL PRIMARY KEY,
  mime       VARCHAR(30) NOT NULL,
  data       BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
