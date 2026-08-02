#!/usr/bin/env bash

# Executing root deploy script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
exec "${DIR}/../deploy-vps.sh" "$@"
