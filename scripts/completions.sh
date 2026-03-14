#!/bin/sh
set -e
rm -rf completions
mkdir completions
for sh in bash zsh fish; do
	go run ./apps/cli completion "$sh" >"completions/hyperlocalise.$sh"
done
