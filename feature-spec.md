# Feature: Password Reset Endpoint

## What to build
Add a POST /auth/reset-password endpoint that allows users to reset their password by providing their email and a new password.

## Acceptance criteria
1. POST /auth/reset-password accepts { email, new_password }
2. Validates new_password is at least 8 characters
3. If email not found, return 404 {"error": "User not found"}
4. Updates password_hash in the users table using hash_password()
5. Resets login_attempts to 0 on successful reset
6. Returns 200 {"message": "Password reset successfully"}

## Files to modify
- app/routes/auth.py — add the new route
- app/models/user.py — add update_password() function

## Notes
- Use the existing hash_password() function from models/user.py
- Follow the same pattern as the existing /auth/login route
