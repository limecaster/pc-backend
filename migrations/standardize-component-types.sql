-- Update component types to standardized format
-- CPU types
UPDATE PC_Configuration_Product 
SET component_type = 'CPU'
WHERE component_type IN ('CPU', 'Cpu', 'cpu');

-- CPU Cooler types
UPDATE PC_Configuration_Product 
SET component_type = 'CPU Cooler'
WHERE component_type IN ('CPUCooler', 'CPU Cooler', 'Cpu Cooler', 'Tản nhiệt CPU');

-- Motherboard types
UPDATE PC_Configuration_Product 
SET component_type = 'Motherboard'
WHERE component_type IN ('Motherboard', 'Bo mạch chủ', 'Main', 'Mainboard');

-- Graphics Card types
UPDATE PC_Configuration_Product 
SET component_type = 'Graphics Card'
WHERE component_type IN ('GraphicsCard', 'Graphics Card', 'GPU', 'Card đồ họa');

-- RAM types
UPDATE PC_Configuration_Product 
SET component_type = 'RAM'
WHERE component_type IN ('RAM', 'Memory', 'Bộ nhớ');

-- Storage types
UPDATE PC_Configuration_Product 
SET component_type = 'Storage'
WHERE component_type IN ('InternalHardDrive', 'Storage', 'SSD', 'HDD', 'Ổ cứng', 'Lưu trữ', 'Ổ SSD');

-- Case types
UPDATE PC_Configuration_Product 
SET component_type = 'Case'
WHERE component_type IN ('Case', 'Vỏ case', 'PC Case');

-- Power Supply types
UPDATE PC_Configuration_Product 
SET component_type = 'Power Supply'
WHERE component_type IN ('PowerSupply', 'Power Supply', 'PSU', 'Nguồn', 'Bộ nguồn');

-- Update details to store original component type if not already there
UPDATE PC_Configuration_Product 
SET details = jsonb_set(
    CASE 
        WHEN details IS NULL THEN '{}'::jsonb 
        ELSE details 
    END, 
    '{originalComponentType}', 
    to_jsonb(component_type)
)
WHERE details IS NULL OR NOT details ? 'originalComponentType';
