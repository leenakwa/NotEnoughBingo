# Engineering documentation

This directory contains product, architecture and operations documentation.
The repository audit records the original prototype; current implementation
status and deployment requirements are documented separately.

## Product and architecture

- [Repository audit](audit.md)
- [Target architecture](architecture.md)
- [Domain model](domain-model.md)
- [Primary user flows](user-flows.md)
- [API boundaries](api-boundaries.md)
- [Security and media](security-media.md)
- [Migration plan](migration-plan.md)
- [Implementation status](implementation-status.md)

## Operations

- [Operations runbook](operations/runbook.md)
- [Production deployment baseline](operations/production-deployment.md)
- [Backup and restore](operations/backups.md)
- [Local release assessment (2026-09-29)](operations/release-assessment-2026-09-29.md)
- [Complete user production-readiness prompt](operations/production-readiness-prompt.txt)
- [Complete working checklist](operations/production-readiness-checklist.md)
- [Production-readiness section tracker](operations/production-readiness-tracker.md)
- [Production-readiness evidence log](operations/production-readiness-evidence.md)

These documents describe intended invariants and boundaries. The OpenAPI
document, database migrations, and executable tests are the authoritative
implementation contracts as the application is built.
