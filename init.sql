-- ============================================================
-- STOCKNEST - ORACLE DATABASE SCHEMA
-- Run this in SQL Workshop → SQL Commands
-- ============================================================

-- Drop existing objects
BEGIN
    FOR c IN (SELECT table_name FROM user_tables 
              WHERE table_name IN ('STOCK_MOVEMENTS', 'PRODUCTS', 'WAREHOUSES', 'USERS', 'AUDIT_LOG')) LOOP
        EXECUTE IMMEDIATE 'DROP TABLE ' || c.table_name || ' CASCADE CONSTRAINTS';
    END LOOP;
    FOR c IN (SELECT sequence_name FROM user_sequences 
              WHERE sequence_name LIKE 'SEQ_%') LOOP
        EXECUTE IMMEDIATE 'DROP SEQUENCE ' || c.sequence_name;
    END LOOP;
END;
/

-- 1. USERS TABLE
CREATE TABLE users (
    user_id         NUMBER PRIMARY KEY,
    full_name       VARCHAR2(100) NOT NULL,
    username        VARCHAR2(50) UNIQUE NOT NULL,
    email           VARCHAR2(100) UNIQUE NOT NULL,
    password_hash   VARCHAR2(255) NOT NULL,
    role            VARCHAR2(20) DEFAULT 'viewer' CHECK (role IN ('manager', 'viewer', 'auditor')),
    created_at      TIMESTAMP DEFAULT SYSTIMESTAMP,
    last_login      TIMESTAMP,
    is_active       CHAR(1) DEFAULT 'Y' CHECK (is_active IN ('Y', 'N'))
);

-- 2. WAREHOUSES TABLE
CREATE TABLE warehouses (
    warehouse_id    NUMBER PRIMARY KEY,
    name            VARCHAR2(100) NOT NULL,
    location        VARCHAR2(200) NOT NULL,
    capacity        NUMBER NOT NULL,
    created_at      TIMESTAMP DEFAULT SYSTIMESTAMP,
    created_by      NUMBER REFERENCES users(user_id)
);

-- 3. PRODUCTS TABLE
CREATE TABLE products (
    product_id      NUMBER PRIMARY KEY,
    name            VARCHAR2(100) NOT NULL,
    sku             VARCHAR2(50) UNIQUE NOT NULL,
    qty             NUMBER DEFAULT 0 NOT NULL,
    warehouse_id    NUMBER REFERENCES warehouses(warehouse_id),
    min_stock_level NUMBER DEFAULT 3,
    created_at      TIMESTAMP DEFAULT SYSTIMESTAMP,
    created_by      NUMBER REFERENCES users(user_id),
    updated_at      TIMESTAMP DEFAULT SYSTIMESTAMP,
    updated_by      NUMBER REFERENCES users(user_id)
);

-- 4. STOCK MOVEMENTS TABLE
CREATE TABLE stock_movements (
    movement_id     NUMBER PRIMARY KEY,
    product_id      NUMBER REFERENCES products(product_id),
    movement_type   VARCHAR2(10) CHECK (movement_type IN ('RECEIVE', 'SHIP')),
    quantity        NUMBER NOT NULL,
    movement_date   TIMESTAMP DEFAULT SYSTIMESTAMP,
    performed_by    NUMBER REFERENCES users(user_id),
    notes           VARCHAR2(500)
);

-- 5. AUDIT LOG TABLE
CREATE TABLE audit_log (
    audit_id        NUMBER PRIMARY KEY,
    user_id         NUMBER REFERENCES users(user_id),
    action_type     VARCHAR2(50),
    action_details  VARCHAR2(1000),
    action_date     TIMESTAMP DEFAULT SYSTIMESTAMP,
    ip_address      VARCHAR2(50)
);

-- Create sequences
CREATE SEQUENCE seq_users START WITH 100;
CREATE SEQUENCE seq_warehouses START WITH 100;
CREATE SEQUENCE seq_products START WITH 100;
CREATE SEQUENCE seq_movements START WITH 100;
CREATE SEQUENCE seq_audit START WITH 100;

-- Insert seed data (passwords are plain text for demo)
INSERT INTO users (user_id, full_name, username, email, password_hash, role) 
VALUES (1, 'Muthukumar', 'muthukumar', 'muthukumarvanaja78@gmail.com', 'password123', 'manager');

INSERT INTO users (user_id, full_name, username, email, password_hash, role) 
VALUES (2, 'Viewer User', 'viewer', 'viewer@stocknest.com', 'viewer123', 'viewer');

INSERT INTO users (user_id, full_name, username, email, password_hash, role) 
VALUES (3, 'Auditor User', 'auditor', 'auditor@stocknest.com', 'auditor123', 'auditor');

INSERT INTO warehouses (warehouse_id, name, location, capacity, created_by) 
VALUES (1, 'Main Warehouse', 'Chicago, IL', 200, 1);

INSERT INTO warehouses (warehouse_id, name, location, capacity, created_by) 
VALUES (2, 'East Warehouse', 'Newark, NJ', 150, 1);

INSERT INTO products (product_id, name, sku, qty, warehouse_id, min_stock_level, created_by) 
VALUES (1, 'Widget A', 'WID-001', 12, 1, 3, 1);

INSERT INTO products (product_id, name, sku, qty, warehouse_id, min_stock_level, created_by) 
VALUES (2, 'Widget B', 'WID-002', 5, 1, 3, 1);

INSERT INTO products (product_id, name, sku, qty, warehouse_id, min_stock_level, created_by) 
VALUES (3, 'Gadget C', 'GAD-003', 8, 2, 3, 1);

INSERT INTO products (product_id, name, sku, qty, warehouse_id, min_stock_level, created_by) 
VALUES (4, 'Gadget D', 'GAD-004', 3, 2, 3, 1);

INSERT INTO products (product_id, name, sku, qty, warehouse_id, min_stock_level, created_by) 
VALUES (5, 'Tool E', 'TOL-005', 20, 1, 3, 1);

INSERT INTO products (product_id, name, sku, qty, warehouse_id, min_stock_level, created_by) 
VALUES (6, 'Tool F', 'TOL-006', 0, 2, 3, 1);

INSERT INTO products (product_id, name, sku, qty, warehouse_id, min_stock_level, created_by) 
VALUES (7, 'Part G', 'PAR-007', 7, 1, 3, 1);

INSERT INTO products (product_id, name, sku, qty, warehouse_id, min_stock_level, created_by) 
VALUES (8, 'Part H', 'PAR-008', 2, 2, 3, 1);

INSERT INTO products (product_id, name, sku, qty, warehouse_id, min_stock_level, created_by) 
VALUES (9, 'Material I', 'MAT-009', 15, 1, 3, 1);

INSERT INTO products (product_id, name, sku, qty, warehouse_id, min_stock_level, created_by) 
VALUES (10, 'Material J', 'MAT-010', 4, 2, 3, 1);

COMMIT;