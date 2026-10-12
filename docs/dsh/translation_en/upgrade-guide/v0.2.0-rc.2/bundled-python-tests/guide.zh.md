---
kind: upgrade-guide
description: "The bundled NumPy and pandas do not include their upstream test suites."
---

# NumPy and pandas upstream tests require a separate environment

[English](guide.md) | 中文

## Change

The Desktop and Python SDK runtime distributions previously included the NumPy and pandas test directories. The bundled distributions now trim those directories, so scripts that import their test modules or run their complete upstream test suites need a separately installed environment. Data processing, Office authoring, `numpy.testing`, `pandas.testing`, and `pandas._testing` remain available.

## Migration

1. If a script imports `numpy.*.tests` or `pandas.tests`, install the original NumPy and pandas distributions and their upstream test dependencies in a separate Python environment. Keep that environment outside the Harness managed runtime directory, which an upgrade replaces.
2. Run the affected script or upstream test suite with that environment's interpreter. Scripts that use only library features or the retained testing helper APIs need no changes.
3. Confirm the previously failing test module imports and the related scripts both run successfully in the separate interpreter. The bundled versions are recorded in the [runtime lock file](../../../../scripts/primary-runtime/lock.json).
