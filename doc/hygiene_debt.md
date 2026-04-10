# Hygiene Debt Registry

This document tracks the precision linting and type-checking violations identified during the "Surgical CI Pass" that have been deferred to unblock the current release cycle. 

## Python Debt (flake8)
- [x] **Unused Imports**: Audit all core execution scripts for secondary unused imports (F401) beyond `Dict` and `Any`.
- [x] **Formatting**: Resolve `E501` (line length) violations in legacy files without using `# flake8: noqa`.

## Web Debt (ESLint & TSC)
- [x] **Implicit any**: Restore `"strict": true` compliance across all components by replacing remaining `: unknown` placeholders with specific interfaces.
- [x] **Variable Shadowing**: Complete the audit for shadowing of variables like `id`, `data`, and `result` in large components like `page.tsx`.
- [x] **Hook Dependencies**: Audit `useEffect` dependency arrays for missing or exhaustive dependencies.

## Infrastructure Debt
- [x] **Logs Visibility**: Restore direct access to GitHub Actions logs or integrate `gh` CLI for forensic debugging.
- [x] **Blocking CI**: Once the above debt is cleared, remove `continue-on-error: true` from `.github/workflows/ci.yml`.
