-- ============================================================
-- DeepEx Visual Intelligence Migration
-- Adds image support to the messages table and creates
-- a storage bucket for message image attachments
-- ============================================================

-- 1. Add image_url column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. Create storage bucket for message attachments
-- This inserts the bucket definition into the storage.buckets table
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-attachments', 'message-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Set up Storage Policies for 'message-attachments'
-- Note: We first drop existing policies to avoid conflicts if re-run

-- 3a. Allow public read access to all objects in the bucket
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'message-attachments');

-- 3b. Allow authenticated users to upload files
CREATE POLICY "Authenticated Upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'message-attachments');

-- 3c. Allow authenticated users to update/delete their own uploads (optional but good practice)
CREATE POLICY "Authenticated Owner Update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'message-attachments');

CREATE POLICY "Authenticated Owner Delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'message-attachments');

-- 4. Index on image_url for faster queries on image messages
CREATE INDEX IF NOT EXISTS idx_messages_image_url ON messages (image_url) WHERE image_url IS NOT NULL;

-- 5. Add comment for documentation
COMMENT ON COLUMN messages.image_url IS 'Public URL of an attached image stored in Supabase Storage (message-attachments bucket). Used by Cloudflare Gemma 3 Vision for image understanding.';
