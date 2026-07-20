#!/bin/sh
set -eu

input_file=${1:?"Pass the policy template path"}
output_file=${2:?"Pass the rendered policy path"}

case ${S3_BUCKET:-} in
  "" | *[!a-z0-9.-]*)
    printf '%s\n' "S3_BUCKET must be a valid lowercase bucket name" >&2
    exit 1
    ;;
esac

template=
while IFS= read -r line || [ -n "$line" ]; do
  template="${template}${line}
"
done < "$input_file"

needle=__S3_BUCKET__
rendered=
remaining=$template
while [ "${remaining#*"$needle"}" != "$remaining" ]; do
  prefix=${remaining%%"$needle"*}
  rendered=$rendered$prefix$S3_BUCKET
  remaining=${remaining#*"$needle"}
done

printf '%s%s' "$rendered" "$remaining" > "$output_file"
