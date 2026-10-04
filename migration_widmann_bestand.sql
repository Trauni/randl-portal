CREATE TABLE widmann_stock_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  mindestbestand INT NOT NULL DEFAULT 0,
  lexware_article_number VARCHAR(100),
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE widmann_stock_checks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  checked_by INT,
  checked_by_name VARCHAR(255),
  note TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (checked_by) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE widmann_stock_check_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  check_id INT NOT NULL,
  item_id INT,
  item_name VARCHAR(255) NOT NULL,
  mindestbestand INT NOT NULL DEFAULT 0,
  gezaehlt INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (check_id) REFERENCES widmann_stock_checks(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES widmann_stock_items(id) ON DELETE SET NULL
);
