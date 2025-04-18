-- Index IF NOT EXISTS for fast lookup of usernames and emails
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_username ON "Admin"(username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_email ON "Admin"(email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_username ON "Staff"(username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_email ON "Staff"(email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_username ON "Customer"(username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_email ON "Customer"(email);

-- Index IF NOT EXISTS for faster product search by name
CREATE INDEX IF NOT EXISTS idx_product_name ON "Products" USING gin (to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_product_name_like ON "Products"(name text_pattern_ops);

-- Index IF NOT EXISTS for filtering by price range
CREATE INDEX IF NOT EXISTS idx_product_price ON "Products"(price);

-- Index IF NOT EXISTS for filtering by status
CREATE INDEX IF NOT EXISTS idx_product_status ON "Products"(status);

-- Index IF NOT EXISTS for filtering by category
CREATE INDEX IF NOT EXISTS idx_product_category ON "Products"(category);

-- Index IF NOT EXISTS for filtering by rating star
CREATE INDEX IF NOT EXISTS idx_rating_stars ON "Rating_Comment"(stars);

-- Index IF NOT EXISTS for searching by order ID
CREATE INDEX IF NOT EXISTS idx_order_id ON "Orders"(id);

-- Index IF NOT EXISTS for searching by order status
CREATE INDEX IF NOT EXISTS idx_order_status ON "Orders"(status);

-- Foreign key indexes for faster JOIN performance
CREATE INDEX IF NOT EXISTS idx_order_customer_id ON "Orders"(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_detail_order_id ON "Order_Detail"(order_id);
CREATE INDEX IF NOT EXISTS idx_order_detail_product_id ON "Order_Detail"(product_id);
CREATE INDEX IF NOT EXISTS idx_cart_customer_id ON "Cart"(customer_id);
CREATE INDEX IF NOT EXISTS idx_cart_item_cart_id ON "Cart_Item"(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_item_product_id ON "Cart_Item"(product_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_customer_id ON "Wishlist"(customer_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_product_id ON "Wishlist"(product_id);
CREATE INDEX IF NOT EXISTS idx_rating_customer_id ON "Rating_Comment"(customer_id);
CREATE INDEX IF NOT EXISTS idx_rating_product_id ON "Rating_Comment"(product_id);
CREATE INDEX IF NOT EXISTS idx_pc_config_customer_id ON "PC_Configuration"(customer_id);
CREATE INDEX IF NOT EXISTS idx_pc_config_product_id ON "PC_Configuration_Product"(product_id);

-- Indexes for faster many-to-many relationship queries with discounts
CREATE INDEX IF NOT EXISTS idx_order_discount_order_id ON "Order_Discount"(order_id);
CREATE INDEX IF NOT EXISTS idx_order_discount_discount_id ON "Order_Discount"(discount_id);

CREATE INDEX IF NOT EXISTS idx_customer_discount_customer_id ON "Customer_Discount"(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_discount_discount_id ON "Customer_Discount"(discount_id);

-- Index IF NOT EXISTS for latest login (for sorting or finding recent logins)
CREATE INDEX IF NOT EXISTS idx_admin_latest_login ON "Admin"(latest_login);
CREATE INDEX IF NOT EXISTS idx_staff_latest_login ON "Staff"(latest_login);
CREATE INDEX IF NOT EXISTS idx_customer_latest_login ON "Customer"(latest_login);

-- Index IF NOT EXISTS for created_at for faster sorting or filtering by creation date
CREATE INDEX IF NOT EXISTS idx_product_created_at ON "Products"(created_at);
CREATE INDEX IF NOT EXISTS idx_order_created_at ON "Orders"(created_at);
CREATE INDEX IF NOT EXISTS idx_pc_config_created_at ON "PC_Configuration"(created_at);

-- Add index IF NOT EXISTS for faster queries
CREATE INDEX IF NOT EXISTS idx_faq_status ON FAQ(status);
CREATE INDEX IF NOT EXISTS idx_faq_created_at ON FAQ(created_at);


-- Add index IF NOT EXISTS for faster queries
CREATE INDEX IF NOT EXISTS idx_viewed_products_customer_id ON "Viewed_Products"(customer_id);
CREATE INDEX IF NOT EXISTS idx_viewed_products_product_id ON "Viewed_Products"(product_id);
CREATE INDEX IF NOT EXISTS idx_viewed_products_viewed_at ON "Viewed_Products"(viewed_at);

-- Add index IF NOT EXISTS for User Behavior Tracking
CREATE INDEX IF NOT EXISTS idx_user_behavior_session_id ON "User_Behavior"(session_id);
CREATE INDEX IF NOT EXISTS idx_user_behavior_event_id ON "User_Behavior"(event_id);
CREATE INDEX IF NOT EXISTS idx_user_behavior_created_at ON "User_Behavior"(created_at);
CREATE INDEX IF NOT EXISTS idx_user_behavior_customer_id ON "User_Behavior"(customer_id);
CREATE INDEX IF NOT EXISTS idx_user_behavior_entity_id ON "User_Behavior"(entity_id);