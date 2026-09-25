# Architecture rules

- Edge Functions using an opaque `sb_secret_` database key must send it only as `apikey`, never as a bearer user token, so privileged writes retain service identity.