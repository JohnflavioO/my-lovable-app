# Architecture rules

- Edge Functions using an opaque `sb_secret_` database key must send it only as `apikey`, never as a bearer user token, so privileged writes retain service identity.
- Database triggers distinguish anonymous access with `auth.role() = 'anon'`; `auth.uid() IS NULL` also matches trusted service operations.
- Legacy quote payment validation may be bypassed only by service-role requests carrying the private restore marker from the authenticated backup function, preserving historical data without widening public writes.
- Quote editor state must guard dirty forms on dismissal and browser unload, offering draft save before discarding to prevent accidental data loss.
- Technical document views and PDF exports resolve client addresses through the shared client resolver; all PDFs reuse the same header and party blocks to keep document identities consistent.
- Quote client-link validation must honor server-validated manager company scope and admin access without changing public policies or record ownership.