# Import users

Move users from Auth0, or from anything that can write a CSV, without asking them to sign up again. Their bcrypt passwords keep working.

The import is in the admin console, **Users** > **Import users**. A dry run reads the whole file, checks it against the accounts already in Ostiary and shows what would happen without writing anything. **Import** then checks the file again and creates the accounts.

## Limits

| | |
| --- | --- |
| Size | 10 MB of files per import (the user file and the hash export together) |
| Users | 50,000 per import |
| On Vercel | 4.5 MB per request (Vercel's function limit), so keep each import under that |
| Errors listed | The first 50 refused rows |

Split a larger export into several files and import them one after the other: users already imported are skipped.

## Import from Auth0

### 1. Export the users

Auth0 exports users with a job, from the Management API or the **User Import / Export** extension (Dashboard > Extensions).

With the Management API (a token with `read:users`):

```bash
curl -X POST "https://YOUR_TENANT.auth0.com/api/v2/jobs/users-exports" \
  -H "Authorization: Bearer $AUTH0_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "format": "json",
    "fields": [
      {"name": "user_id"}, {"name": "email"}, {"name": "email_verified"},
      {"name": "name"}, {"name": "given_name"}, {"name": "family_name"}, {"name": "nickname"},
      {"name": "username"}, {"name": "picture"}, {"name": "created_at"}, {"name": "blocked"}
    ]
  }'
```

Poll `GET /api/v2/jobs/{id}` until it is `completed`, download its `location` and unzip it (`gunzip users.json.gz`). The file has one JSON object per line; the extension's JSON array works too.

### 2. Get the password hashes (optional)

Auth0 never puts password hashes in an export. Ask Auth0 support for a **password hash export** of your database connection (paid plans). It comes as one JSON object per line:

```json
{"_id":{"$oid":"60425dc43519d90068f82973"},"email":"jane@example.com","email_verified":true,"passwordHash":"$2b$10$...","connection":"Username-Password-Authentication"}
```

Ostiary matches each hash to a user by ID (`_id` is the part of Auth0's `user_id` after `auth0|`), then by email. An address that appears twice with two different hashes (two Auth0 database connections) gets no hash rather than a guess.

> [!WARNING]
> Handle the hash export like a password database: anyone holding it can try to crack the passwords offline. Delete it once the import is done.

Without hashes, users sign in with an emailed code or **Forgot password?**, which sets a password on the account.

### 3. Run the import

1. In **Users** > **Import users**, choose the format **Auth0 user export (JSON)**.
2. Choose the **User file** and, if you have it, the **Password hash export (optional)**.
3. Choose **Run dry run** and read the counts: **To create**, **Skipped: email already used**, **Skipped: alias of an existing email**, **Invalid rows**, and the rows not imported with their reason.
4. Choose **Import N users**.

The hash export can also be imported on its own as the user file: its records have `email`, `email_verified` and `passwordHash`.

### How Auth0 fields are mapped

| Auth0 field | Ostiary |
| --- | --- |
| `email` | Email (required, lowercased) |
| `email_verified` | Email verified |
| `name`, else `given_name` + `family_name`, else `nickname` | Name (else the part of the email before `@`) |
| `username` | Username (3 to 30 letters, digits, `_` or `.`) |
| `picture` | Picture, when it is an `https://` URL |
| `created_at` | Account creation date |
| `blocked` | `true`: imported banned |
| `passwordHash` (or the hash export) | Password, bcrypt only |
| `user_id` | Joins the hash export, not stored |

## Import from a CSV file

A header row, then one user per row (comma-separated, `"` to quote a value). Columns, in any order:

| Column | |
| --- | --- |
| `email` | Required |
| `name` | Else the part of the email before `@` |
| `username` | 3 to 30 letters, digits, `_` or `.` |
| `emailVerified` | `true`/`false` (also `1`/`0`, `yes`/`no`); empty is `false` |
| `role` | `user` (default) or `admin`. `admin` rows are refused unless **Allow the admin role** is on |
| `passwordHash` | A bcrypt hash, optional |

```csv
email,name,username,emailVerified,role,passwordHash
jane@example.com,Jane Doe,jane.doe,true,user,$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
bob@example.com,Bob,,false,,
```

Any other column refuses the file, so a `password` column is never mistaken for imported. Plain-text passwords are not accepted.

1. In **Users** > **Import users**, choose the format **CSV** and the **User file**.
2. Turn on **Allow the admin role** only if the file has `admin` rows you mean to import.
3. Choose **Run dry run**, check the counts, then **Import N users**.

## How imported passwords work

Only bcrypt hashes are imported: `$2a$`, `$2b$` or `$2y$`, with a cost from 4 to 14 (Auth0 uses 10). A row with another format (MD5, SHA, Argon2, PBKDF2, a plain password) is refused in the dry run with its own reason.

At sign-in, a bcrypt hash is checked with bcrypt. Once the password matches, Ostiary hashes it again with scrypt (Better Auth's default, used for every new password) and replaces the bcrypt hash, so bcrypt hashes disappear as people sign in. The password is only used within that sign-in request. New and changed passwords are always scrypt.

## What is not imported

- **Social and enterprise identities** (Google, GitHub, SAML...): users sign in with that provider again. A social sign-in joins the imported account when the provider reports the same, verified email and the account's email is verified (never for admins or accounts with two-factor authentication). Otherwise the user signs in with the email first and connects the provider from their account. See [Social sign-in](social-sign-in.md#how-accounts-are-linked).
- **MFA enrolments** (authenticator apps, SMS, recovery codes) and **passkeys**: users set them up again from their account.
- **Auth0's `user_id`**: imported users get a new Ostiary ID, the `sub` of their tokens. Apps that store Auth0's `sub` should match their users again by email at first sign-in.
- `app_metadata`, `user_metadata`, Auth0 roles and permissions, organizations, sessions and refresh tokens. Every imported user joins the Public workspace, like any new account.

## Safety rules

- **Existing accounts are never changed.** An address that already has an account is skipped. With `EMAIL_DEDUP`, an address reaching the same inbox as an account's (`john.doe+x@gmail.com` and `johndoe@gmail.com`) is skipped too. Within the file, only the first row for an address (or inbox) is kept. A taken username refuses the row. An account created between the dry run and the import is skipped then.
- **No email is sent**: no verification, welcome or reset email. Unverified users verify their address at their first password sign-in, as usual.
- **No implicit admins.** Auth0 imports always create plain users; a CSV gives `admin` only with **Allow the admin role**. `ADMIN_EMAILS` never promotes an account at import; an imported account with an unverified address in `ADMIN_EMAILS` is promoted, like any account, once its owner proves the inbox. Make an imported admin by hand otherwise.
- **The import imports what the dry run showed.** Changing a file or an option drops the dry run; the import refuses files that differ from the ones checked (SHA-256).
- **One audit entry per import** (`user.import`): the file name, its SHA-256, the counts and the addresses of any admins created. Imports are not sign-ups: they are not counted in sign-up activity and send no `user.created` webhooks.

## If an import stops partway

The accounts are written 500 per database transaction, with their password and their Public workspace membership. If a batch fails, the import stops: the batches before it stay, and the result says how many rows were not written. Run the same file again to finish: users already imported are skipped.

## Related

- [Sign-in methods](sign-in-methods.md): emailed codes and password reset for users imported without a hash
- [Social sign-in](social-sign-in.md)
- [Configuration](configuration.md): `EMAIL_DEDUP`, `ADMIN_EMAILS`
