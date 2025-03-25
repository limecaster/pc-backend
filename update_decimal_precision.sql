-- Update Products table (note the plural form)
ALTER TABLE "Products" ALTER COLUMN "price" TYPE DECIMAL(15,2);
-- Update original_price column that already exists
ALTER TABLE "Products" ALTER COLUMN "original_price" TYPE DECIMAL(15,2);

-- Update Discount table
DO $$
BEGIN
    -- Check which table name actually exists (Discount or Discounts)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Discount') THEN
        ALTER TABLE "Discount" ALTER COLUMN "discount_amount" TYPE DECIMAL(15,2);
        -- Check if column exists before altering
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'Discount' AND column_name = 'total_savings_amount') THEN
            ALTER TABLE "Discount" ALTER COLUMN "total_savings_amount" TYPE DECIMAL(15,2);
        END IF;
    ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Discounts') THEN
        ALTER TABLE "Discounts" ALTER COLUMN "discount_amount" TYPE DECIMAL(15,2);
        -- Check if column exists before altering
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'Discounts' AND column_name = 'total_savings_amount') THEN
            ALTER TABLE "Discounts" ALTER COLUMN "total_savings_amount" TYPE DECIMAL(15,2);
        END IF;
    END IF;
END$$;

-- Update Cart_Item table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Cart_Item') THEN
        ALTER TABLE "Cart_Item" ALTER COLUMN "sub_price" TYPE DECIMAL(15,2);
    ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Cart_Items') THEN
        ALTER TABLE "Cart_Items" ALTER COLUMN "sub_price" TYPE DECIMAL(15,2);
    END IF;
END$$;

-- Update Orders table
ALTER TABLE "Orders" ALTER COLUMN "total_price" TYPE DECIMAL(15,2);

-- Update Order_Detail table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Order_Detail') THEN
        ALTER TABLE "Order_Detail" ALTER COLUMN "sub_price" TYPE DECIMAL(15,2);
    ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Order_Details') THEN
        ALTER TABLE "Order_Details" ALTER COLUMN "sub_price" TYPE DECIMAL(15,2);
    END IF;
END$$;

-- Update order_items table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN
        ALTER TABLE "order_items" ALTER COLUMN "price" TYPE DECIMAL(15,2);
    ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Order_Items') THEN
        ALTER TABLE "Order_Items" ALTER COLUMN "price" TYPE DECIMAL(15,2);
    END IF;
END$$;

-- Remove the migration log insertion if that table doesn't exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'migration_log') THEN
        INSERT INTO "migration_log" (migration_name, applied_at, details)
        VALUES ('update_decimal_precision', NOW(), 'Updated decimal fields to DECIMAL(15,2)') 
        ON CONFLICT DO NOTHING;
    END IF;
END$$;
