const { createClient } = require('@supabase/supabase-js');

// Replace these with your Supabase URL and anon key from the Supabase dashboard
// Project Settings > API > URL and anon key
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables must be set.');
  console.error('You can find these values in the Supabase dashboard under Project Settings > API.');
  console.error('Run this script with:');
  console.error('SUPABASE_URL=your_url SUPABASE_ANON_KEY=your_key node scripts/setup-storage-policies.js');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Define the storage policies
const policies = [
  // company_logos bucket policies
  {
    bucket: 'company_logos',
    policies: [
      {
        name: 'Allow public read access to company logos',
        definition: {
          operation: 'SELECT',
          expression: 'true',
          role: 'anon',
        },
      },
      {
        name: 'Allow staff to upload company logos',
        definition: {
          operation: 'INSERT',
          expression: "(storage.foldername(name))[1] = 'public' AND auth.role() = 'authenticated' AND (SELECT is_staff FROM user_profiles WHERE user_id = auth.uid())",
          role: 'authenticated',
        },
      },
      {
        name: 'Allow staff to update company logos',
        definition: {
          operation: 'UPDATE',
          expression: "(storage.foldername(name))[1] = 'public' AND auth.role() = 'authenticated' AND (SELECT is_staff FROM user_profiles WHERE user_id = auth.uid())",
          role: 'authenticated',
        },
      },
      {
        name: 'Allow staff to delete company logos',
        definition: {
          operation: 'DELETE',
          expression: "(storage.foldername(name))[1] = 'public' AND auth.role() = 'authenticated' AND (SELECT is_staff FROM user_profiles WHERE user_id = auth.uid())",
          role: 'authenticated',
        },
      },
    ],
  },
  
  // user_avatars bucket policies
  {
    bucket: 'user_avatars',
    policies: [
      {
        name: 'Allow public read access to user avatars',
        definition: {
          operation: 'SELECT',
          expression: 'true',
          role: 'anon',
        },
      },
      {
        name: 'Allow users to upload their own avatar',
        definition: {
          operation: 'INSERT',
          expression: "auth.role() = 'authenticated' AND (storage.foldername(name))[1] = auth.uid()::text",
          role: 'authenticated',
        },
      },
      {
        name: 'Allow users to update their own avatar',
        definition: {
          operation: 'UPDATE',
          expression: "auth.role() = 'authenticated' AND (storage.foldername(name))[1] = auth.uid()::text",
          role: 'authenticated',
        },
      },
      {
        name: 'Allow users to delete their own avatar',
        definition: {
          operation: 'DELETE',
          expression: "auth.role() = 'authenticated' AND (storage.foldername(name))[1] = auth.uid()::text",
          role: 'authenticated',
        },
      },
    ],
  },
  
  // task_attachments bucket policies
  {
    bucket: 'task_attachments',
    policies: [
      {
        name: 'Allow authenticated users to read task attachments for their company',
        definition: {
          operation: 'SELECT',
          expression: `
            auth.role() = 'authenticated' AND 
            EXISTS (
              SELECT 1 FROM tasks t
              JOIN sections s ON t.section_id = s.id
              JOIN projects p ON s.project_id = p.id
              JOIN company_users cu ON p.company_id = cu.company_id
              WHERE 
                cu.user_id = auth.uid() AND
                (storage.foldername(name))[1] = t.id::text
            )
          `,
          role: 'authenticated',
        },
      },
      {
        name: 'Allow authenticated users to upload task attachments for their tasks',
        definition: {
          operation: 'INSERT',
          expression: `
            auth.role() = 'authenticated' AND 
            EXISTS (
              SELECT 1 FROM tasks t
              JOIN sections s ON t.section_id = s.id
              JOIN projects p ON s.project_id = p.id
              JOIN company_users cu ON p.company_id = cu.company_id
              WHERE 
                cu.user_id = auth.uid() AND
                (storage.foldername(name))[1] = t.id::text
            )
          `,
          role: 'authenticated',
        },
      },
      {
        name: 'Allow authenticated users to delete their own task attachments',
        definition: {
          operation: 'DELETE',
          expression: `
            auth.role() = 'authenticated' AND 
            (
              -- User is staff
              (SELECT is_staff FROM user_profiles WHERE user_id = auth.uid()) OR
              -- User uploaded the file
              (storage.foldername(name))[2] = auth.uid()::text
            )
          `,
          role: 'authenticated',
        },
      },
    ],
  },
  
  // meeting_recordings bucket policies
  {
    bucket: 'meeting_recordings',
    policies: [
      {
        name: 'Allow authenticated users to read meeting recordings for their company',
        definition: {
          operation: 'SELECT',
          expression: `
            auth.role() = 'authenticated' AND 
            EXISTS (
              SELECT 1 FROM company_users cu
              WHERE 
                cu.user_id = auth.uid() AND
                cu.company_id::text = (storage.foldername(name))[1]
            )
          `,
          role: 'authenticated',
        },
      },
      {
        name: 'Allow staff to upload meeting recordings',
        definition: {
          operation: 'INSERT',
          expression: `
            auth.role() = 'authenticated' AND 
            (SELECT is_staff FROM user_profiles WHERE user_id = auth.uid())
          `,
          role: 'authenticated',
        },
      },
      {
        name: 'Allow staff to delete meeting recordings',
        definition: {
          operation: 'DELETE',
          expression: `
            auth.role() = 'authenticated' AND 
            (SELECT is_staff FROM user_profiles WHERE user_id = auth.uid())
          `,
          role: 'authenticated',
        },
      },
    ],
  },
  
  // training_images bucket policies
  {
    bucket: 'training_images',
    policies: [
      {
        name: 'Allow public read access to training images',
        definition: {
          operation: 'SELECT',
          expression: 'true',
          role: 'anon',
        },
      },
      {
        name: 'Allow staff to upload training images',
        definition: {
          operation: 'INSERT',
          expression: `
            auth.role() = 'authenticated' AND 
            (SELECT is_staff FROM user_profiles WHERE user_id = auth.uid())
          `,
          role: 'authenticated',
        },
      },
      {
        name: 'Allow staff to update training images',
        definition: {
          operation: 'UPDATE',
          expression: `
            auth.role() = 'authenticated' AND 
            (SELECT is_staff FROM user_profiles WHERE user_id = auth.uid())
          `,
          role: 'authenticated',
        },
      },
      {
        name: 'Allow staff to delete training images',
        definition: {
          operation: 'DELETE',
          expression: `
            auth.role() = 'authenticated' AND 
            (SELECT is_staff FROM user_profiles WHERE user_id = auth.uid())
          `,
          role: 'authenticated',
        },
      },
    ],
  },
  
  // training_content bucket policies
  {
    bucket: 'training_content',
    policies: [
      {
        name: 'Allow authenticated users to read training content for their company',
        definition: {
          operation: 'SELECT',
          expression: `
            auth.role() = 'authenticated' AND 
            EXISTS (
              SELECT 1 FROM company_users cu
              WHERE 
                cu.user_id = auth.uid() AND
                cu.company_id::text = (storage.foldername(name))[1]
            )
          `,
          role: 'authenticated',
        },
      },
      {
        name: 'Allow staff to upload training content',
        definition: {
          operation: 'INSERT',
          expression: `
            auth.role() = 'authenticated' AND 
            (SELECT is_staff FROM user_profiles WHERE user_id = auth.uid())
          `,
          role: 'authenticated',
        },
      },
      {
        name: 'Allow staff to update training content',
        definition: {
          operation: 'UPDATE',
          expression: `
            auth.role() = 'authenticated' AND 
            (SELECT is_staff FROM user_profiles WHERE user_id = auth.uid())
          `,
          role: 'authenticated',
        },
      },
      {
        name: 'Allow staff to delete training content',
        definition: {
          operation: 'DELETE',
          expression: `
            auth.role() = 'authenticated' AND 
            (SELECT is_staff FROM user_profiles WHERE user_id = auth.uid())
          `,
          role: 'authenticated',
        },
      },
    ],
  },
  
  // certificates bucket policies
  {
    bucket: 'certificates',
    policies: [
      {
        name: 'Allow public read access to certificates',
        definition: {
          operation: 'SELECT',
          expression: 'true',
          role: 'anon',
        },
      },
      {
        name: 'Allow staff to upload certificates',
        definition: {
          operation: 'INSERT',
          expression: `
            auth.role() = 'authenticated' AND 
            (SELECT is_staff FROM user_profiles WHERE user_id = auth.uid())
          `,
          role: 'authenticated',
        },
      },
      {
        name: 'Allow staff to update certificates',
        definition: {
          operation: 'UPDATE',
          expression: `
            auth.role() = 'authenticated' AND 
            (SELECT is_staff FROM user_profiles WHERE user_id = auth.uid())
          `,
          role: 'authenticated',
        },
      },
      {
        name: 'Allow staff to delete certificates',
        definition: {
          operation: 'DELETE',
          expression: `
            auth.role() = 'authenticated' AND 
            (SELECT is_staff FROM user_profiles WHERE user_id = auth.uid())
          `,
          role: 'authenticated',
        },
      },
    ],
  },
  
  // badge_images bucket policies
  {
    bucket: 'badge_images',
    policies: [
      {
        name: 'Allow public read access to badge images',
        definition: {
          operation: 'SELECT',
          expression: 'true',
          role: 'anon',
        },
      },
      {
        name: 'Allow staff to upload badge images',
        definition: {
          operation: 'INSERT',
          expression: `
            auth.role() = 'authenticated' AND 
            (SELECT is_staff FROM user_profiles WHERE user_id = auth.uid())
          `,
          role: 'authenticated',
        },
      },
      {
        name: 'Allow staff to update badge images',
        definition: {
          operation: 'UPDATE',
          expression: `
            auth.role() = 'authenticated' AND 
            (SELECT is_staff FROM user_profiles WHERE user_id = auth.uid())
          `,
          role: 'authenticated',
        },
      },
      {
        name: 'Allow staff to delete badge images',
        definition: {
          operation: 'DELETE',
          expression: `
            auth.role() = 'authenticated' AND 
            (SELECT is_staff FROM user_profiles WHERE user_id = auth.uid())
          `,
          role: 'authenticated',
        },
      },
    ],
  },
  
  // generated_documents bucket policies
  {
    bucket: 'generated_documents',
    policies: [
      {
        name: 'Allow authenticated users to read their own generated documents',
        definition: {
          operation: 'SELECT',
          expression: `
            auth.role() = 'authenticated' AND 
            (
              -- User is staff
              (SELECT is_staff FROM user_profiles WHERE user_id = auth.uid()) OR
              -- Document belongs to user
              (storage.foldername(name))[1] = auth.uid()::text OR
              -- Document belongs to user's company
              EXISTS (
                SELECT 1 FROM company_users cu
                WHERE 
                  cu.user_id = auth.uid() AND
                  cu.company_id::text = (storage.foldername(name))[1]
              )
            )
          `,
          role: 'authenticated',
        },
      },
      {
        name: 'Allow staff to upload generated documents',
        definition: {
          operation: 'INSERT',
          expression: `
            auth.role() = 'authenticated' AND 
            (SELECT is_staff FROM user_profiles WHERE user_id = auth.uid())
          `,
          role: 'authenticated',
        },
      },
      {
        name: 'Allow staff to delete generated documents',
        definition: {
          operation: 'DELETE',
          expression: `
            auth.role() = 'authenticated' AND 
            (SELECT is_staff FROM user_profiles WHERE user_id = auth.uid())
          `,
          role: 'authenticated',
        },
      },
    ],
  },
];

async function setupStoragePolicies() {
  console.log('Setting up storage policies...');
  
  for (const { bucket, policies } of policies) {
    console.log(`\nConfiguring policies for bucket: ${bucket}`);
    
    try {
      // Get existing policies for the bucket
      const { data: existingPolicies, error: getPoliciesError } = await supabase
        .storage
        .from(bucket)
        .getPolicies();
      
      if (getPoliciesError) {
        console.error(`Error getting policies for bucket '${bucket}':`, getPoliciesError.message);
        continue;
      }
      
      // Delete existing policies
      if (existingPolicies && existingPolicies.length > 0) {
        console.log(`Removing ${existingPolicies.length} existing policies...`);
        
        for (const policy of existingPolicies) {
          const { error: deletePolicyError } = await supabase
            .storage
            .from(bucket)
            .deletePolicy(policy.id);
          
          if (deletePolicyError) {
            console.error(`Error deleting policy '${policy.name}':`, deletePolicyError.message);
          }
        }
      }
      
      // Create new policies
      for (const policy of policies) {
        console.log(`Creating policy: ${policy.name}`);
        
        const { error: createPolicyError } = await supabase
          .storage
          .from(bucket)
          .createPolicy(policy.name, policy.definition);
        
        if (createPolicyError) {
          console.error(`Error creating policy '${policy.name}':`, createPolicyError.message);
        }
      }
      
      console.log(`Policies for bucket '${bucket}' configured successfully.`);
    } catch (error) {
      console.error(`Error configuring policies for bucket '${bucket}':`, error.message);
    }
  }
  
  console.log('\nStorage policy setup completed.');
}

setupStoragePolicies();
