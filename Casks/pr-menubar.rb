cask 'pr-menubar' do
  version '0.11.0'
  sha256 '0000000000000000000000000000000000000000000000000000000000000000'

  # The release workflow rewrites version and sha256 on every tag.
  url "https://github.com/carolineartz/pr-menubar/releases/download/v#{version}/pr-menubar-#{version}-arm64.zip"
  name 'PR Menubar'
  desc 'Menubar app for GitHub PRs: what should I do next?'
  homepage 'https://github.com/carolineartz/pr-menubar'

  depends_on arch: :arm64
  # The app reads your GitHub token from `gh auth token`.
  depends_on formula: 'gh'

  app 'PR Menubar.app'

  # Unsigned build: clear the download quarantine so Gatekeeper opens it.
  postflight_steps do
    run '/usr/bin/xattr', args: ['-dr', 'com.apple.quarantine', '{{appdir}}/PR Menubar.app']
  end

  uninstall quit: 'com.carolineartz.pr-menubar',
            login_item: 'PR Menubar'

  zap trash: [
    '~/Library/Application Support/pr-menubar',
    '~/Library/Application Support/pr-menubar-mock'
  ]
end
