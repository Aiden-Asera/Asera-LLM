-- Migration: Add new columns to clients table
-- Run this if you have an existing clients table

-- Add new columns to existing clients table
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS products_services TEXT,
ADD COLUMN IF NOT EXISTS client_page_info TEXT;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_clients_contact_email ON public.clients(contact_email);
CREATE INDEX IF NOT EXISTS idx_clients_products_services ON public.clients USING gin(to_tsvector('english', products_services));

-- Update the sample data to include the new columns
UPDATE public.clients 
SET 
    contact_email = 'admin@demo.com',
    products_services = 'AI Consulting, LLM Development, Notion Integration',
    client_page_info = 'Demo client for testing purposes. This client demonstrates the multi-tenant functionality of the Asera LLM system.'
WHERE id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'; 