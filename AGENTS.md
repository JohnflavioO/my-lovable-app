# Architecture rules

- Edge Functions using an opaque `sb_secret_` database key must send it only as `apikey`, never as a bearer user token, so privileged writes retain service identity.
- Database triggers distinguish anonymous access with `auth.role() = 'anon'`; `auth.uid() IS NULL` also matches trusted service operations.
- Legacy quote payment validation may be bypassed only by service-role requests carrying the private restore marker from the authenticated backup function, preserving historical data without widening public writes.