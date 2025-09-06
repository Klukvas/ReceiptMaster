-- Create a user manually in the database
-- Replace the values below with your desired user data

-- First, you need to hash the password using bcrypt
-- You can use an online bcrypt generator or Node.js:
-- const bcrypt = require('bcrypt');
-- const hashedPassword = await bcrypt.hash('your-password', 10);
-- console.log(hashedPassword);

INSERT INTO "user" (
    id,
    email,
    password,
    first_name,
    last_name,
    is_active,
    created_at,
    updated_at
) VALUES (
    gen_random_uuid(),
    'user@example.com',
    '$2b$10$YourHashedPasswordHere', -- Replace with actual bcrypt hash
    'John',
    'Doe',
    true,
    NOW(),
    NOW()
);

-- To generate a bcrypt hash, you can use this Node.js one-liner:
-- node -e "const bcrypt = require('bcrypt'); bcrypt.hash('password123', 10).then(hash => console.log(hash));"
