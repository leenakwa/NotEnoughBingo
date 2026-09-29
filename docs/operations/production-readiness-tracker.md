# Production readiness prompt tracker

The [complete user prompt](production-readiness-prompt.txt) is copied byte-for-byte
from the attachment. It is the authoritative checklist for this work; this index
does not replace any bullet, final sequence, or definition of done in that file.

- Source: 105 numbered sections, 40643 bytes.
- SHA-256: `7b920f477e1087c2fe456f7bdbafef11e00e7be8ca17bc8ec99f180c274b65d9`.
- Current evidence: [local release assessment](release-assessment-2026-09-29.md).
- A box below means the **entire applicable section** has been verified on the
  actual production deployment. None is checked from local tests alone.

## Section index

- [ ] 1. BASIC LAUNCH DETAILS
- [ ] 2. FIRST-SCREEN / PRODUCT CLARITY
- [ ] 3. NAVIGATION
- [ ] 4. UI STATES
- [ ] 5. LOADING UX
- [ ] 6. ERROR HANDLING
- [ ] 7. FORMS
- [ ] 8. BUTTONS AND CONTROLS
- [ ] 9. DESTRUCTIVE ACTIONS
- [ ] 10. SIGNUP
- [ ] 11. LOGIN
- [ ] 12. PASSWORD RESET
- [ ] 13. LOGOUT
- [ ] 14. AUTHORIZATION
- [ ] 15. ONBOARDING
- [ ] 16. EMPTY STATES
- [ ] 17. SEARCH
- [ ] 18. TABLES AND LISTS
- [ ] 19. FILE UPLOADS
- [ ] 20. IMAGES
- [ ] 21. RESPONSIVE DESIGN
- [ ] 22. TOUCH UX
- [ ] 23. KEYBOARD UX
- [ ] 24. ACCESSIBILITY
- [ ] 25. COPY AND PLACEHOLDERS
- [ ] 26. LONG-CONTENT TORTURE TEST
- [ ] 27. DATES AND TIME
- [ ] 28. NUMBERS
- [ ] 29. LOCALIZATION / INTERNATIONALIZATION
- [ ] 30. 404 HANDLING
- [ ] 31. GLOBAL / 500 ERROR HANDLING
- [ ] 32. OFFLINE / BAD NETWORK
- [ ] 33. BROWSER COMPATIBILITY
- [ ] 34. PERFORMANCE
- [ ] 35. FONTS
- [ ] 36. SEO FOR PUBLIC PAGES
- [ ] 37. SOCIAL SHARING
- [ ] 38. DOMAIN AND DNS
- [ ] 39. HTTPS / TLS
- [ ] 40. ENVIRONMENT VARIABLES
- [ ] 41. SECRETS
- [ ] 42. DATABASE
- [ ] 43. DATA INTEGRITY
- [ ] 44. BACKUPS
- [ ] 45. EMAILS
- [ ] 46. NOTIFICATIONS
- [ ] 47. OAUTH / SOCIAL LOGIN
- [ ] 48. PAYMENTS
- [ ] 49. WEBHOOKS
- [ ] 50. SECURITY HEADERS
- [ ] 51. COOKIES
- [ ] 52. BASIC SECURITY ABUSE TESTS
- [ ] 53. RATE LIMITING
- [ ] 54. AI/LLM FEATURES
- [ ] 55. PRIVACY
- [ ] 56. ACCOUNT SETTINGS
- [ ] 57. TEAMS / ORGANIZATIONS
- [ ] 58. BROWSER STORAGE
- [ ] 59. CACHE
- [ ] 60. SERVICE WORKER / PWA
- [ ] 61. ANALYTICS
- [ ] 62. PRODUCT METRICS
- [ ] 63. ERROR TRACKING
- [ ] 64. LOGGING
- [ ] 65. MONITORING
- [ ] 66. ALERTS
- [ ] 67. HEALTH ENDPOINT
- [ ] 68. CRON / SCHEDULED JOBS
- [ ] 69. QUEUES / WORKERS
- [ ] 70. PRODUCTION BUILD
- [ ] 71. DEPENDENCIES
- [ ] 72. CI/CD
- [ ] 73. TESTS
- [ ] 74. PRODUCTION SMOKE TEST
- [ ] 75. BROWSER CONSOLE
- [ ] 76. NETWORK PANEL
- [ ] 77. HTTP STATUS CODES
- [ ] 78. REDIRECTS
- [ ] 79. STATIC ASSETS
- [ ] 80. PUBLIC FILE EXPOSURE
- [ ] 81. SOURCE MAPS
- [ ] 82. API READINESS
- [ ] 83. CORS
- [ ] 84. FEATURE FLAGS
- [ ] 85. DEBUG ARTIFACTS
- [ ] 86. TEST / DEMO ACCOUNTS
- [ ] 87. ADMIN PANEL
- [ ] 88. SUPPORT
- [ ] 89. LEGAL / BUSINESS FOOTER
- [ ] 90. FOOTER
- [ ] 91. PAGE METADATA
- [ ] 92. FAVICON SET
- [ ] 93. SCROLL BEHAVIOR
- [ ] 94. MODALS
- [ ] 95. DROPDOWNS / POPOVERS
- [ ] 96. Z-INDEX / OVERLAY STACK
- [ ] 97. TOASTS / TRANSIENT FEEDBACK
- [ ] 98. ACTION FEEDBACK
- [ ] 99. REFRESH TEST
- [ ] 100. OPEN-IN-NEW-TAB TEST
- [ ] 101. MULTIPLE TABS
- [ ] 102. SESSION EXPIRATION
- [ ] 103. VERSION / DEPLOYMENT COMPATIBILITY
- [ ] 104. ROLLBACK
- [ ] 105. FINAL EXECUTION SEQUENCE

## Current distinction

The local release assessment records passed code checks, isolated full-stack
browser flows, and known local limits. It does not attest to the 105 sections
on a live production domain. Before checking any section, record concrete
evidence for its relevant bullets and mark non-applicable items explicitly.

The source inventory found no current OAuth/social login, payments, incoming
webhooks, AI/LLM features, or teams/organizations. Sections 47–49, 54, and 57
are conditional and currently have no product flow; the evidence log records
the source checks. Section 60 has no PWA implementation, but stale browser
worker/cache behavior still needs checking on the actual deployment.

The CI Release gate passed on `d629a7153c5b33ddf6ece438bdc98faf2d428067`.
The remaining launch gates are release review and promotion, operator/legal/
support decisions, production DNS/TLS/managed services and monitoring, off-site
database plus media restore, and measurements on the real deployment. The
evidence log now covers several local degraded-network,
cross-tab/session, direct-link, upload, and input cases. The remaining local
items and production-only proofs are tracked in the execution plan.
