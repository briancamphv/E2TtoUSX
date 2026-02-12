#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <directory-containing-drive-zips>"
  exit 1
fi

input_dir="$1"

if [[ ! -d "$input_dir" ]]; then
  echo "Error: directory not found: $input_dir"
  exit 1
fi

shopt -s nullglob
zip_files=("$input_dir"/drive-*.zip)
shopt -u nullglob

if [[ ${#zip_files[@]} -eq 0 ]]; then
  echo "No matching zip files found in $input_dir (pattern: drive-*.zip)"
  exit 0
fi

for zip_file in "${zip_files[@]}"; do
  zip_base="$(basename "$zip_file")"
  unzipdir="${zip_base%.zip}"
  target_dir="$HOME/Downloads/$unzipdir"

  echo "Processing: $zip_base"
  mkdir -p "$target_dir"
  unzip -o -q "$zip_file" -d "$target_dir"

  echo "Files extracted to: $target_dir"
  mapfile -t extracted_files < <(find "$target_dir" -type f | sort)

  if [[ ${#extracted_files[@]} -eq 0 ]]; then
    echo "No files found after unzip for $zip_base; skipping"
    continue
  fi

  printf '%s\n' "${extracted_files[@]}"

  first_file_name="$(basename "${extracted_files[0]}")"
  IFS=' ' read -r -a name_parts <<< "$first_file_name"

  if [[ ${#name_parts[@]} -lt 2 ]]; then
    echo "Could not derive bookname from first file: $first_file_name (expected '_' delimited name)"
    continue
  fi

  language="${name_parts[0]}"
  bookname="${name_parts[1]}"
  currentDateTime=$(date +"%m%d%Y_%H%M")

  report_file="./reports/${language}_${bookname}_error_report_${currentDateTime}.txt"

  echo "bookname: $bookname"
  echo "Running: node reportParsingErrors.js $report_file $target_dir"
  node reportParsingErrors.js "$report_file" --templates "$target_dir"
done
