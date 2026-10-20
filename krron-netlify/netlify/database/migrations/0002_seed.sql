-- Krron – Startdaten (Rollen, Rechte, Kategorien, Lieferzonen, Einstellungen, Demo-Produkte)

INSERT INTO roles (id, name, description, is_system) VALUES
  (1, 'Admin',     'Voller Zugriff auf das Adminpanel', TRUE),
  (2, 'Nutzer',    'Standard-Kunde',                    TRUE),
  (3, 'Lieferant', 'Sieht Bestellungen, ändert den Status', FALSE);
SELECT setval(pg_get_serial_sequence('roles','id'), 3);

INSERT INTO permissions (perm_key, description) VALUES
  ('admin.access',      'Adminpanel betreten'),
  ('users.manage',      'Nutzer erstellen, bearbeiten, sperren, Guthaben'),
  ('roles.manage',      'Rollen und Berechtigungen verwalten'),
  ('orders.view',       'Bestellungen und Fahrer-Notizen einsehen'),
  ('orders.manage',     'Bestellstatus ändern und stornieren'),
  ('products.manage',   'Produkte verwalten'),
  ('categories.manage', 'Kategorien verwalten'),
  ('coupons.manage',    'Gutscheine und Rabatte verwalten'),
  ('settings.manage',   'Banner, Ankündigungen, UI-Editor und Einstellungen');

INSERT INTO role_permissions (role_id, permission_id) SELECT 1, id FROM permissions;
INSERT INTO role_permissions (role_id, permission_id)
  SELECT 3, id FROM permissions WHERE perm_key IN ('admin.access','orders.view','orders.manage');

INSERT INTO categories (name, slug, sort_order) VALUES
  ('Elektronik',    'elektronik',    1),
  ('Fahrzeugteile', 'fahrzeugteile', 2),
  ('Lebensmittel',  'lebensmittel',  3),
  ('Kleidung',      'kleidung',      4),
  ('Haushalt',      'haushalt',      5);

INSERT INTO delivery_zones (name, fee) VALUES
  ('Los Santos – Innenstadt', 0),
  ('Sandy Shores', 25),
  ('Paleto Bay', 40);

INSERT INTO settings (setting_key, setting_value) VALUES
  ('shop_name', 'Krron'),
  ('banner_text', 'Willkommen bei Krron – Lieferung in ganz San Andreas!'),
  ('hero_subtitle', 'Entdecke Bestseller, Angebote und alles für dein Leben in San Andreas.'),
  ('footer_note', 'Krron ist ein fiktiver Shop für den Roleplay-Server. Alle Preise in Spielwährung.'),
  ('announcement', ''),
  ('cancel_window_hours', '6'),
  ('logo_path', ''),
  ('color_header', ''),
  ('color_nav', ''),
  ('color_accent', ''),
  ('color_button', '');

-- Demo-Produkte (ohne Bild – im Adminpanel ersetzen oder löschen)
INSERT INTO products (category_id, title, description, price, stock, sold_count)
SELECT c.id, v.title, v.descr, v.price, v.stock, v.sold
FROM (VALUES
  ('elektronik',    'Smartphone Nova X',        'Aktuelles Smartphone mit großem Display und langer Akkulaufzeit.', 899.00, 25, 14),
  ('elektronik',    'Kopfhörer Bass Pro',       'Kabellose Over-Ear-Kopfhörer mit Geräuschunterdrückung.',          149.90, 40, 22),
  ('fahrzeugteile', 'Sportauspuff Edelstahl',   'Universeller Sportauspuff für viele Fahrzeugmodelle.',             329.00, 12, 7),
  ('lebensmittel',  'Energy Drink 12er Pack',   'Zwölf Dosen für lange Nächte in Los Santos.',                       24.99, 100, 31),
  ('kleidung',      'Lederjacke Classic',       'Robuste Lederjacke im klassischen Schnitt.',                       189.00, 18, 9),
  ('haushalt',      'Kaffeemaschine Barista',   'Filterkaffee auf Knopfdruck, mit Timer.',                           79.50, 30, 5)
) AS v(cat, title, descr, price, stock, sold)
JOIN categories c ON c.slug = v.cat;

INSERT INTO discounts (name, percent, category_id)
SELECT 'Elektronik-Wochen', 10, id FROM categories WHERE slug = 'elektronik';
