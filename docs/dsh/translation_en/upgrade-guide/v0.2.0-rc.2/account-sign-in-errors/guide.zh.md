---
kind: upgrade-guide
description: "Account sign-in transport failures now report no-response instead of network."
---

# Account sign-in error codes

[English](guide.md) | 中文

## Change

`SignInErrorCode` adds `no-response`. Account state returned by `account/getState`, `account/startSignIn`, and `account/watch` reports this code when fetch fails before returning a Response, including a single-request timeout. These failures previously reported `network`. HTTP response errors still report `network`; authorization-attempt expiry still reports `expired`.

## Migration

1. Add `no-response` to validators and exhaustive handlers for `SignInAttemptView.errorCode` in clients of the account API or `@deepseek-ai/dsh-deepseek-account`.
2. Show network troubleshooting for `no-response`. Keep generic failure handling for `network`, which also covers HTTP and account-detail retrieval failures.
3. Confirm the client accepts a failed login with `errorCode: 'no-response'` and offers retry, while an HTTP error response retains generic failure handling.
