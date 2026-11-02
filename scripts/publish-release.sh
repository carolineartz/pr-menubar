#!/usr/bin/env bash
# Run by .github/workflows/release.yml after `pnpm dist:mac`: uploads the zip to
# a GitHub Release for $TAG, then points Casks/pr-menubar.rb at it on main.
set -euo pipefail

version=${TAG#v}
built="dist/PR Menubar-${version}-arm64-mac.zip"
[ -f "$built" ] || { echo "no $built: package.json version must match $TAG" >&2; exit 1; }
asset="pr-menubar-${version}-arm64.zip"
cp "$built" "$asset"

gh release create "$TAG" "$asset" --title "PR Menubar $TAG" --generate-notes
sha=$(shasum -a 256 "$asset" | cut -d' ' -f1)

git fetch origin main
git checkout -B main origin/main
sed -i '' \
  -e "s/^  version ['\"].*['\"]/  version '$version'/" \
  -e "s/^  sha256 ['\"].*['\"]/  sha256 '$sha'/" \
  Casks/pr-menubar.rb
git diff --quiet Casks/pr-menubar.rb && { echo "cask unchanged: sed patterns no longer match Casks/pr-menubar.rb" >&2; exit 1; }
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git commit -am "Cask: pr-menubar $version"
git push origin main
