CREATE DATABASE IF NOT EXISTS financial_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE financial_db;

CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    type ENUM('income', 'expense') NOT NULL
);

CREATE TABLE transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    description VARCHAR(100) NOT NULL,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    type ENUM('income', 'expense') NOT NULL,
    category_id INT,
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Dados iniciais
INSERT INTO categories (name, type) VALUES
('Salário', 'income'),
('Freelance', 'income'),
('Aluguel', 'expense'),
('Alimentação', 'expense'),
('Transporte', 'expense'),
('Lazer', 'expense');