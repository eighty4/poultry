#!/bin/sh
set -e

install_git_hook() {
    local _hook=".git/hooks/$1"
    if [ -e "$_hook" ]; then
      echo "$_hook already exists"
      exit 1
    fi
    ln -s $(realpath ci_verify.sh) $_hook
    echo "linked ci_verify.sh to $_hook"
    exit 0
}

for arg in "$@"; do
  case $arg in
    "--on-git-commit")
      install_git_hook pre-commit;;
    "--on-git-push")
      install_git_hook pre-push;;
  esac
done

if ! command -v "pnpm" &> /dev/null; then
  _url="https://pnpm.io/installation"
  echo "\033[31merror:\033[0m pnpm is required for contributing\n\n  $_url\n"
  exit 1
fi

# run through all the checks done for ci

pnpm build
pnpm fmtcheck
