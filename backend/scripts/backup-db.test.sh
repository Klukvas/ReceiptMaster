#!/bin/bash

# Проверяет backup-db.sh на настоящем BusyBox date. aws, pg_dump и текущее время поддельные,
# поэтому тест не ходит в сеть и не требует базы. Запуск из корня репозитория:
#
#   docker run --rm --network none -v "$PWD/backend/scripts:/scripts:ro" \
#       postgres:15-alpine bash /scripts/backup-db.test.sh

set -uo pipefail

if ! /bin/date --help 2>&1 | grep -q BusyBox; then
    echo "Run this test in postgres:15-alpine: it has to exercise BusyBox date" >&2
    exit 2
fi

BACKUP_SCRIPT="$(dirname "$0")/backup-db.sh"
BACKUP_NAME="backup_db_test_$$"
LOCAL_BACKUP="/tmp/$BACKUP_NAME.sql.gz"
DEFAULT_NOW="2026-10-30 12:00:00"

WORK=$(mktemp -d)
AWS_CALLS="$WORK/aws-calls"
S3_LISTING="$WORK/s3-listing"
FAILURES=0
CURRENT_TEST=""
OUTPUT=""
STATUS=0
FAKE_NOW=0

cleanup() {
    rm -rf "$WORK"
    rm -f "$LOCAL_BACKUP"
}
trap cleanup EXIT

mkdir "$WORK/bin"

cat > "$WORK/bin/pg_dump" <<'FAKE'
#!/bin/bash
echo "-- fake dump"
FAKE

# Часы подменяет тест, а разбор и форматирование остаются за настоящим BusyBox date
cat > "$WORK/bin/date" <<'FAKE'
#!/bin/bash
case "${1:-}" in
    +%s)
        echo "$FAKE_NOW"
        ;;
    -d)
        if [ -n "${FAKE_DATE_OUTPUT:-}" ]; then
            echo "$FAKE_DATE_OUTPUT"
        else
            exec /bin/date "$@"
        fi
        ;;
    *)
        exec /bin/date -d "@$FAKE_NOW" "$@"
        ;;
esac
FAKE

cat > "$WORK/bin/aws" <<'FAKE'
#!/bin/bash
echo "$*" >> "$AWS_CALLS"

case "$2" in
    cp)
        # Загрузка должна увидеть готовый дамп: удалить его раньше времени нельзя
        [ -s "${@: -2:1}" ] || { echo "source file is missing" >&2; exit 1; }
        if [ -n "${FAKE_CP_FAIL:-}" ]; then
            echo "upload: simulated failure" >&2
            exit 1
        fi
        ;;
    ls)
        if [ -n "${FAKE_LS_FAIL:-}" ]; then
            echo "An error occurred (AccessDenied) when calling the ListObjectsV2 operation" >&2
            exit 1
        fi
        cat "$S3_LISTING"
        ;;
    rm)
        target=${!#}
        if [ "${target##*/}" = "${FAKE_RM_FAIL_FOR:-}" ]; then
            echo "delete: simulated failure" >&2
            exit 1
        fi
        ;;
esac
FAKE

chmod +x "$WORK/bin/pg_dump" "$WORK/bin/date" "$WORK/bin/aws"

set_now() {
    FAKE_NOW=$(TZ=UTC /bin/date -d "$1" +%s)
}

reset_case() {
    : > "$AWS_CALLS"
    : > "$S3_LISTING"
    rm -f "$LOCAL_BACKUP"
    set_now "$DEFAULT_NOW"
}

list_objects() {
    local name
    for name in "$@"; do
        printf '2026-10-01 03:00:04   12345678 %s\n' "$name" >> "$S3_LISTING"
    done
}

run_backup() {
    OUTPUT=$(env PATH="$WORK/bin:$PATH" TZ=UTC \
        AWS_CALLS="$AWS_CALLS" S3_LISTING="$S3_LISTING" FAKE_NOW="$FAKE_NOW" \
        DB_HOST=db DB_PORT=5432 DB_USERNAME=tester DB_NAME=testdb \
        BACKUP_S3_BUCKET=test-bucket \
        "$@" bash "$BACKUP_SCRIPT" "$BACKUP_NAME" 2>&1)
    STATUS=$?
}

fail() {
    echo "  FAIL [$CURRENT_TEST]: $1"
    printf '%s\n' "$OUTPUT" | sed 's/^/    | /'
    FAILURES=$((FAILURES + 1))
}

assert_status() {
    [ "$STATUS" -eq "$1" ] || fail "expected exit $1, got $STATUS"
}

assert_output_contains() {
    case "$OUTPUT" in
        *"$1"*) ;;
        *) fail "expected output to contain: $1" ;;
    esac
}

assert_delete_attempts() {
    local attempts
    attempts=$(grep '^s3 rm ' "$AWS_CALLS" | sed 's|.*/||' | sort | tr '\n' ' ')
    [ "${attempts% }" = "$1" ] || fail "expected deletes [$1], got [${attempts% }]"
}

assert_no_retention_calls() {
    if grep -Eq '^s3 (ls|rm) ' "$AWS_CALLS"; then
        fail "expected no ls or rm calls, got: $(tr '\n' ';' < "$AWS_CALLS")"
    fi
}

assert_local_backup_removed() {
    [ ! -e "$LOCAL_BACKUP" ] || fail "expected $LOCAL_BACKUP to be removed"
}

assert_local_backup_kept() {
    [ -s "$LOCAL_BACKUP" ] || fail "expected $LOCAL_BACKUP to be kept"
}

assert_cutoff() {
    reset_case
    set_now "$1"
    run_backup BACKUP_RETENTION_DAYS="$2"
    assert_status 0
    assert_output_contains "(before $3)"
}

test_cutoff_crosses_month_year_and_leap_day() {
    assert_cutoff "2026-10-30 12:00:00" 30 20260930
    assert_cutoff "2026-10-30 12:00:00" 1 20261029
    assert_cutoff "2026-01-15 12:00:00" 30 20251216
    assert_cutoff "2028-03-01 12:00:00" 30 20280131
}

test_deletes_only_backups_before_the_cutoff() {
    list_objects backup_20260928_030000.sql.gz backup_20260929_235959.sql.gz \
        backup_20260930_000000.sql.gz backup_20261028_030000.sql.gz
    run_backup
    assert_status 0
    assert_delete_attempts "backup_20260928_030000.sql.gz backup_20260929_235959.sql.gz"
    assert_output_contains "2 deleted, 0 failed"
    assert_output_contains "Backup complete"
    assert_local_backup_removed
}

test_leaves_other_object_names_alone() {
    list_objects pre_migration_20200101_030000.sql.gz backup_manual.sql.gz \
        backup_20200101.sql.gz backup_20200101_030000.sql \
        my_backup_20200101_030000.sql.gz backup_20200101_030000.sql.gz.part
    printf '                           PRE archive/\n' >> "$S3_LISTING"
    run_backup
    assert_status 0
    assert_delete_attempts ""
}

test_uploads_before_touching_old_backups() {
    list_objects backup_20200101_030000.sql.gz
    run_backup
    assert_status 0
    case "$(head -n 1 "$AWS_CALLS")" in
        "s3 cp "*) ;;
        *) fail "expected the upload to be the first S3 call" ;;
    esac
}

test_empty_retention_days_means_30() {
    run_backup BACKUP_RETENTION_DAYS=
    assert_status 0
    assert_output_contains "older than 30 days (before 20260930)"
}

test_failed_upload_keeps_local_backup_and_skips_retention() {
    list_objects backup_20200101_030000.sql.gz
    run_backup FAKE_CP_FAIL=1
    assert_status 1
    assert_output_contains "upload: simulated failure"
    assert_output_contains "Error: upload failed, local backup kept: $LOCAL_BACKUP"
    assert_no_retention_calls
    assert_local_backup_kept
}

test_failed_listing_is_reported_and_local_backup_removed() {
    list_objects backup_20200101_030000.sql.gz
    run_backup FAKE_LS_FAIL=1
    assert_status 1
    assert_output_contains "AccessDenied"
    assert_output_contains "Error: could not list s3://test-bucket/backups/"
    assert_output_contains "Error: S3 retention failed"
    assert_delete_attempts ""
    assert_local_backup_removed
}

test_failed_delete_is_reported_and_the_rest_still_run() {
    list_objects backup_20200101_030000.sql.gz backup_20200102_030000.sql.gz \
        backup_20200103_030000.sql.gz
    run_backup FAKE_RM_FAIL_FOR=backup_20200102_030000.sql.gz
    assert_status 1
    assert_output_contains "Error: could not delete backup_20200102_030000.sql.gz"
    assert_output_contains "2 deleted, 1 failed"
    assert_delete_attempts "backup_20200101_030000.sql.gz backup_20200102_030000.sql.gz backup_20200103_030000.sql.gz"
    assert_local_backup_removed
}

test_rejects_bad_retention_days() {
    local value
    for value in abc 0 -5 7d 010 "1 + 1"; do
        reset_case
        list_objects backup_20200101_030000.sql.gz
        run_backup BACKUP_RETENTION_DAYS="$value"
        assert_status 1
        assert_output_contains "BACKUP_RETENTION_DAYS must be a positive integer, got '$value'"
        assert_no_retention_calls
        assert_local_backup_removed
    done
}

test_refuses_implausible_cutoff_date() {
    local value
    for value in not-a-date 2026 20991231; do
        reset_case
        list_objects backup_20200101_030000.sql.gz
        run_backup FAKE_DATE_OUTPUT="$value"
        assert_status 1
        assert_output_contains "Error: invalid retention cutoff date '$value'"
        assert_no_retention_calls
        assert_local_backup_removed
    done
}

test_passes_endpoint_to_every_s3_call() {
    list_objects backup_20200101_030000.sql.gz
    run_backup S3_ENDPOINT=http://s3.test:9000
    assert_status 0
    local calls_without_endpoint
    calls_without_endpoint=$(grep -vc -- '--endpoint-url http://s3.test:9000' "$AWS_CALLS")
    [ "$calls_without_endpoint" -eq 0 ] || fail "$calls_without_endpoint S3 calls lost the endpoint"
}

test_without_bucket_keeps_backup_locally() {
    run_backup BACKUP_S3_BUCKET=
    assert_status 0
    assert_output_contains "backup saved locally"
    assert_local_backup_kept
    [ ! -s "$AWS_CALLS" ] || fail "expected no S3 calls"
}

for test_case in $(declare -F | awk '$3 ~ /^test_/ { print $3 }'); do
    CURRENT_TEST=$test_case
    reset_case
    failures_before=$FAILURES
    "$test_case"
    if [ "$FAILURES" -eq "$failures_before" ]; then
        echo "  ok   $test_case"
    fi
done

if [ "$FAILURES" -gt 0 ]; then
    echo "FAILED: $FAILURES assertion(s)"
    exit 1
fi
echo "PASSED"
