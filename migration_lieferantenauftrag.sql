CREATE TABLE lieferanten_auftraege (
  id INT AUTO_INCREMENT PRIMARY KEY,
  auftragsnummer VARCHAR(20) NOT NULL UNIQUE,
  lieferant_lexware_id VARCHAR(64) NOT NULL,
  lieferant_name VARCHAR(255) NOT NULL,
  kopfhinweis TEXT,
  ersteller_employee_id INT NOT NULL,
  status ENUM('offen','erledigt') NOT NULL DEFAULT 'offen',
  pdf_pfad VARCHAR(500),
  erstellt_am DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ersteller_employee_id) REFERENCES employees(id)
);

CREATE TABLE lieferanten_auftrag_positionen (
  id INT AUTO_INCREMENT PRIMARY KEY,
  auftrag_id INT NOT NULL,
  position INT NOT NULL,
  stueckzahl INT NOT NULL,
  bezeichnung VARCHAR(255) NOT NULL,
  notiz TEXT,
  FOREIGN KEY (auftrag_id) REFERENCES lieferanten_auftraege(id) ON DELETE CASCADE
);
