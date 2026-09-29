# Production readiness execution plan

The [complete user brief](production-readiness-prompt.txt) is authoritative.
The [working checklist](production-readiness-checklist.md) copies every
original requirement into a checkbox. The [105-section tracker](production-readiness-tracker.md)
records the predeployment verdict for each section. This plan sets the order
of work; it does not reduce the checklist.

## Working rules

- Preserve the current uncommitted work. Record changes and verification before
  preparing a release commit.
- For each applicable checklist item, inspect the implementation, exercise the
  real user path or production-equivalent service, fix concrete defects, and
  rerun only the checks affected by the fix.
- Record command, environment, date, result, and remaining limit in the
  [evidence log](production-readiness-evidence.md). A passing unit test is not
  evidence that an external production integration works.
- Mark a tracker section verified before deployment when every applicable
  original bullet has relevant repository or production-equivalent runtime
  evidence. Explain non-applicable bullets and record external-only checks in
  the deployment handoff instead of treating all local work as zero progress.
- Walk the product as a new and returning user. Fix friction, unclear copy,
  awkward mobile controls, and inaccessible interactions even when tests pass.
- Keep security-sensitive test data in the isolated `nebqa` stack. Never put
  session cookies, passwords, tokens, or production secrets in the log.

## Stages

| Stage | Scope | Exit condition |
| --- | --- | --- |
| 1. Baseline and gaps | Review source, dirty tree, dependencies, current release report, and all 105 sections. Inventory missing evidence and prioritize user-critical failures. | A reproducible baseline and a specific queue of local and external gaps. |
| 2. User journeys | Anonymous, new, returning, mobile, keyboard, bad network, direct links, cross-tab, and adversarial flows. Include editor, play, social, profile, settings, uploads, emails, errors, and empty states. | Important flows work through the browser and API; defects have fixes and regression evidence. |
| 3. Quality and security | Accessibility, browser compatibility, SEO/metadata, performance, authorization, abuse limits, data integrity, logging, privacy, storage, and API contracts. | No known high-impact local defect remains; the required code and browser checks pass. |
| 4. Release mechanics | Clean install, migrations, image builds, worker/Beat, CI, scans, backup/restore, rollback, production config, and smoke instructions. | Exact release artifact has a passing gate and rehearsed deployment/rollback procedures. |
| 5. Deployment handoff | Domain, TLS, email, object storage, monitoring, alerts, external recovery, and scripted live smoke/rollback checks. | Predeployment checklist is complete; external configuration is supplied; deployment-only checks are automated and pass on the target environment. |

Stages 1–3 have substantial local evidence but remain open for itemized review
against every applicable original bullet. Stage 4 is in progress: the current
release candidate passed the exact-commit CI gate, but the final PR head must
pass it again after further changes. Registry promotion and rollback on the
target platform remain untested. Stage 5 has no real deployment evidence yet.
The aim is to complete product and repository QA before deployment, leaving
only environment-specific smoke and recovery checks after release.

## Immediate work queue

1. Work through the full copied checklist against repository paths and the
   isolated stack. Record each bullet's result; fix product friction and
   remaining invalid-input, media, keyboard, responsive, and outage cases.
2. Review the draft PR and target migration compatibility. Record the exact
   registry digests and rehearse rollback once a deployment platform exists.
3. Obtain the actual domain, DNS/TLS edge, production service endpoints,
   support/legal owner decisions, and access needed for the real deployment.
4. Configure production backups/monitoring, perform an off-site database and
   media restore drill, then run the full real-domain user and smoke sequence.

## Local milestones already exercised

Password reset and email delivery, true 404s, two-tab logout, offline draft
recovery, focus and active-action session expiry, media error presentation,
language filters at narrow and wide widths, publication requirements, and
production-image origin validation, notifications, account preferences,
multilingual long content, and email change have specific browser or server evidence in
the [evidence log](production-readiness-evidence.md). They remain separate from
the still-open production checklist boxes.
Signup and login sections 10–11 now have every applicable predeployment bullet
checked, including live email verification, resend, invalid credentials,
rate limiting, keyboard submission, and already-authenticated navigation.

## Launch blockers currently outside the local stack

The actual production domain, DNS/TLS edge, secrets, managed services,
transactional email domain, monitored support identity, legal/business
approval, error monitoring/alerts, off-site data and media restoration, and
real-load targets require target-environment access or owner decisions.
They remain open until verified; local substitutes do not close them.
