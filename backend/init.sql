-- Создание sequence для номеров чеков
CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 1;

-- Создание функции для генерации номера чека
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS TEXT AS $$
DECLARE
    year_part TEXT;
    seq_part TEXT;
BEGIN
    year_part := EXTRACT(YEAR FROM NOW())::TEXT;
    seq_part := LPAD(nextval('receipt_number_seq')::TEXT, 6, '0');
    RETURN year_part || '-' || seq_part;
END;
$$ LANGUAGE plpgsql;
