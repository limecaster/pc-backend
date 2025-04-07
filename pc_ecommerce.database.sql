CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Admin Table
CREATE TABLE Admin (
    id SERIAL PRIMARY KEY,
    firstname VARCHAR(50) NOT NULL,
    lastname VARCHAR(50) NOT NULL,
    phone_number VARCHAR(20),
    username VARCHAR(50) UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    street TEXT,
    ward TEXT,
    district TEXT,
    city TEXT,
    latest_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Staff Table
CREATE TABLE Staff (
    id SERIAL PRIMARY KEY,
    firstname VARCHAR(50) NOT NULL,
    lastname VARCHAR(50) NOT NULL,
    phone_number VARCHAR(20),
    username VARCHAR(50) UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    email VARCHAR(100) UNIQUE NOT NULL,
    street TEXT,
    ward TEXT,
    district TEXT,
    city TEXT,
    latest_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Customer Table
CREATE TABLE Customer (
    id SERIAL PRIMARY KEY,
    firstname VARCHAR(50) NOT NULL,
    lastname VARCHAR(50) NOT NULL,
    phone_number VARCHAR(20),
    username VARCHAR(50) UNIQUE NOT NULL,
    password TEXT NOT NULL,
    avatar TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    email VARCHAR(100) UNIQUE NOT NULL,
    street TEXT,
    ward TEXT,
    district TEXT,
    city TEXT,
    latest_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Product Table
CREATE TABLE Product (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(15,2) NOT NULL,
    stock_quantity INT NOT NULL,
    status VARCHAR(50) NOT NULL,
    category VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Discount Table
CREATE TABLE Discount (
    id SERIAL PRIMARY KEY,
    discount_code VARCHAR(50) UNIQUE NOT NULL,
    discount_name VARCHAR(100) NOT NULL,
    discount_description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    discount_amount DECIMAL(15,2) NOT NULL,
    type VARCHAR(20) CHECK (type IN ('percentage', 'fixed')) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Order Table
CREATE TABLE Orders (
    id SERIAL PRIMARY KEY,
    customer_id INT REFERENCES Customer(id) ON DELETE SET NULL,
    total_price DECIMAL(15,2) NOT NULL,
    order_date TIMESTAMP DEFAULT NOW(),
    receive_date TIMESTAMP,
    status VARCHAR(50) NOT NULL,
    payment_method VARCHAR(50),
    delivery_address TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Order Detail Table
CREATE TABLE Order_Detail (
    id SERIAL PRIMARY KEY,
    order_id INT REFERENCES Orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES Product(id) ON DELETE SET NULL,
    product_quantity INT NOT NULL,
    sub_price DECIMAL(15,2) NOT NULL,
    discount_id INT REFERENCES Discount(id) ON DELETE SET NULL,
    discount_amount DECIMAL(15,2) DEFAULT 0,
    discount_type VARCHAR(20) CHECK (discount_type IN ('percentage', 'fixed', 'none')),
    original_price DECIMAL(15,2),
    final_price DECIMAL(15,2)
);

-- Wishlist Table
CREATE TABLE Wishlist (
    customer_id INT REFERENCES Customer(id) ON DELETE CASCADE,
    product_id UUID REFERENCES Product(id) ON DELETE CASCADE,
    PRIMARY KEY (customer_id, product_id)
);

-- Rating & Comment Table (Bound Together)
CREATE TABLE Rating_Comment (
    id SERIAL PRIMARY KEY,
    customer_id INT REFERENCES Customer(id) ON DELETE CASCADE,
    product_id UUID REFERENCES Product(id) ON DELETE CASCADE,
    stars INT CHECK (stars BETWEEN 1 AND 5) NOT NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Cart Table
CREATE TABLE Cart (
    id SERIAL PRIMARY KEY,
    status VARCHAR(50) NOT NULL,
    customer_id INT UNIQUE REFERENCES Customer(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Cart Item Table
CREATE TABLE Cart_Item (
    id SERIAL PRIMARY KEY,
    cart_id INT REFERENCES Cart(id) ON DELETE CASCADE,
    product_id UUID REFERENCES Product(id) ON DELETE SET NULL,
    product_quantity INT NOT NULL,
    sub_price DECIMAL(15,2) NOT NULL
);

-- Order - Discount Many-to-Many Relationship
CREATE TABLE Order_Discount (
    order_id INT REFERENCES Orders(id) ON DELETE CASCADE,
    discount_id INT REFERENCES Discount(id) ON DELETE CASCADE,
    PRIMARY KEY (order_id, discount_id)
);

-- Customer - Discount Many-to-Many Relationship
CREATE TABLE Customer_Discount (
    customer_id INT REFERENCES Customer(id) ON DELETE CASCADE,
    discount_id INT REFERENCES Discount(id) ON DELETE CASCADE,
    PRIMARY KEY (customer_id, discount_id)
);

-- PC Configuration Table
CREATE TABLE PC_Configuration (
    id SERIAL PRIMARY KEY,
    customer_id INT REFERENCES Customer(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    purpose TEXT,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- PC Configuration - Product Many-to-Many Relationship
CREATE TABLE PC_Configuration_Product (
    pc_configuration_id INT REFERENCES PC_Configuration(id) ON DELETE CASCADE,
    product_id UUID REFERENCES Product(id) ON DELETE CASCADE,
    PRIMARY KEY (pc_configuration_id, product_id)
);

-- User Behavior Tracking Table
CREATE TABLE User_Behavior (
    id SERIAL PRIMARY KEY,
    event_id UUID DEFAULT uuid_generate_v4(),
    customer_id INT REFERENCES Customer(id) ON DELETE SET NULL,
    session_id VARCHAR(255), -- For tracking anonymous users
    event_type VARCHAR(50) NOT NULL, -- e.g., 'product_click', 'add_to_cart', etc.
    entity_id VARCHAR(100), -- ID of the related entity (product, category, etc.)
    entity_type VARCHAR(50), -- Type of the entity (product, category, etc.)
    page_url TEXT, -- URL of the page where the event occurred
    referrer_url TEXT, -- Referrer URL
    device_info JSONB, -- Information about the device (browser, OS, etc.)
    ip_address VARCHAR(50),
    event_data JSONB, -- Additional event data
    created_at TIMESTAMP DEFAULT NOW()
);

-- Add index for faster queries
CREATE INDEX idx_user_behavior_event_type ON User_Behavior(event_type);
CREATE INDEX idx_user_behavior_customer_id ON User_Behavior(customer_id);
CREATE INDEX idx_user_behavior_entity_id ON User_Behavior(entity_id);
CREATE INDEX idx_user_behavior_created_at ON User_Behavior(created_at);

-- Viewed Products Table
CREATE TABLE Viewed_Products (
    id SERIAL PRIMARY KEY,
    customer_id INT REFERENCES Customer(id) ON DELETE CASCADE,
    product_id UUID REFERENCES Product(id) ON DELETE CASCADE,
    viewed_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(customer_id, product_id)
);

-- Add index for faster queries
CREATE INDEX idx_viewed_products_customer_id ON Viewed_Products(customer_id);
CREATE INDEX idx_viewed_products_product_id ON Viewed_Products(product_id);
CREATE INDEX idx_viewed_products_viewed_at ON Viewed_Products(viewed_at);
