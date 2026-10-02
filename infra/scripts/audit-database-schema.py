"""Compare installed application indexes, constraints and columns without writes.

Run through the backend's ``manage.py shell``. The report contains schema
metadata only, and does not print rows, credentials or connection settings.
"""

import json

from django.apps import apps
from django.db import connection, models

app_labels = {
    "accounts",
    "analytics",
    "bingos",
    "common",
    "exports",
    "media_assets",
    "moderation",
    "notifications",
    "plays",
    "social",
}
counts = {
    "tables": 0,
    "explicit_indexes": 0,
    "explicit_constraints": 0,
    "unique_fields": 0,
    "foreign_keys": 0,
    "nullable_columns": 0,
}
issues = []
tables = []
with connection.cursor() as cursor:
    for model in apps.get_models():
        if model._meta.app_label not in app_labels or not model._meta.managed:
            continue
        table = model._meta.db_table
        actual = connection.introspection.get_constraints(cursor, table)
        columns = {
            c.name: c
            for c in connection.introspection.get_table_description(cursor, table)
        }
        counts["tables"] += 1
        for index in model._meta.indexes:
            counts["explicit_indexes"] += 1
            if index.name not in actual or not actual[index.name]["index"]:
                issues.append(f"{table}: missing index {index.name}")
        for constraint in model._meta.constraints:
            counts["explicit_constraints"] += 1
            if constraint.name not in actual:
                issues.append(f"{table}: missing constraint {constraint.name}")
            elif (
                isinstance(constraint, models.UniqueConstraint)
                and not actual[constraint.name]["unique"]
            ):
                issues.append(f"{table}: constraint {constraint.name} is not unique")
            elif (
                isinstance(constraint, models.CheckConstraint)
                and not actual[constraint.name]["check"]
            ):
                issues.append(f"{table}: constraint {constraint.name} is not a check")
        for field in model._meta.local_fields:
            if field.column not in columns:
                issues.append(f"{table}: missing column {field.column}")
                continue
            counts["nullable_columns"] += int(field.null)
            if bool(columns[field.column].null_ok) != field.null:
                issues.append(f"{table}.{field.column}: nullability differs")
            matching = [c for c in actual.values() if c["columns"] == [field.column]]
            if field.unique:
                counts["unique_fields"] += 1
                if not any(c["unique"] or c["primary_key"] for c in matching):
                    issues.append(f"{table}.{field.column}: missing uniqueness")
            if field.is_relation and field.many_to_one or field.one_to_one:
                counts["foreign_keys"] += 1
                expected = (
                    field.remote_field.model._meta.db_table,
                    field.target_field.column,
                )
                if not any(c["foreign_key"] == expected for c in matching):
                    issues.append(f"{table}.{field.column}: foreign key target differs")
        tables.append(
            {
                "table": table,
                "declared_indexes": [i.name for i in model._meta.indexes],
                "declared_constraints": [c.name for c in model._meta.constraints],
            }
        )
print(json.dumps({"counts": counts, "issues": issues, "tables": tables}, indent=2))
if issues:
    raise SystemExit(1)
