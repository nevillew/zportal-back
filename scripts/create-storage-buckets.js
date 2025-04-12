const { createClient } = require('@supabase/supabase-js');

// Replace these with your Supabase URL and anon key from the Supabase dashboard
// Project Settings > API > URL and anon key
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables must be set.');
  console.error('You can find these values in the Supabase dashboard under Project Settings > API.');
  console.error('Run this script with:');
  console.error('SUPABASE_URL=your_url SUPABASE_ANON_KEY=your_key node scripts/create-storage-buckets.js');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// List of buckets to create
const buckets = [
  {
    name: 'company-logos', // Changed underscore to hyphen
    public: true,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/svg+xml'],
    fileSizeLimit: 5 * 1024 * 1024, // 5MB
  },
  {
    name: 'user-avatars', // Changed underscore to hyphen
    public: true,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/svg+xml'],
    fileSizeLimit: 2 * 1024 * 1024, // 2MB
  },
  {
    name: 'task-attachments', // Changed underscore to hyphen
    public: false,
    allowedMimeTypes: ['*'],
    fileSizeLimit: 50 * 1024 * 1024, // 50MB
  },
  {
    name: 'meeting-recordings', // Changed underscore to hyphen
    public: false,
    allowedMimeTypes: ['video/mp4', 'audio/mpeg', 'audio/mp4'],
    fileSizeLimit: 500 * 1024 * 1024, // 500MB
  },
  {
    name: 'training-images', // Changed underscore to hyphen
    public: true,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/svg+xml'],
    fileSizeLimit: 10 * 1024 * 1024, // 10MB
  },
  {
    name: 'training-content', // Changed underscore to hyphen
    public: false,
    allowedMimeTypes: ['application/pdf', 'video/mp4', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    fileSizeLimit: 100 * 1024 * 1024, // 100MB
  },
  {
    name: 'certificates',
    public: true,
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    fileSizeLimit: 5 * 1024 * 1024, // 5MB
  },
  {
    name: 'badge-images', // Changed underscore to hyphen
    public: true,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/svg+xml'],
    fileSizeLimit: 1 * 1024 * 1024, // 1MB
  },
  {
    name: 'generated-documents', // Changed underscore to hyphen
    public: false,
    allowedMimeTypes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    fileSizeLimit: 20 * 1024 * 1024, // 20MB
  },
];

async function createBuckets() {
  console.log('Creating storage buckets...');
  
  for (const bucket of buckets) {
    try {
      // Check if bucket already exists
      const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
      
      if (listError) {
        throw listError;
      }
      
      const bucketExists = existingBuckets.some(b => b.name === bucket.name);
      
      if (bucketExists) {
        console.log(`Bucket '${bucket.name}' already exists. Skipping.`);
        continue;
      }
      
      // Create the bucket
      const { data, error } = await supabase.storage.createBucket(bucket.name, {
        public: bucket.public,
        allowedMimeTypes: bucket.allowedMimeTypes,
        fileSizeLimit: bucket.fileSizeLimit,
      });
      
      if (error) {
        throw error;
      }
      
      console.log(`Created bucket: ${bucket.name}`);
    } catch (error) {
      console.error(`Error creating bucket '${bucket.name}':`, error.message);
    }
  }
  
  console.log('Storage bucket creation completed.');
}

createBuckets();
