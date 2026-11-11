<!-- The macOS setup has not been tested so far. -->

# macOS local setup

> **Not tested so far:** these instructions have not been run on macOS.
> Only the Windows build has been verified.

## Prerequisites

Use Git, Xcode Command Line Tools, and a managed Ruby 3.3.13 installation.
Do not use the Ruby bundled with macOS. The approach below follows
[Jekyll's macOS guidance](https://jekyllrb.com/docs/installation/macos/).

Install [Homebrew](https://brew.sh/) using its official instructions if needed.
With Homebrew available, install and select Ruby in the current terminal:

```sh
xcode-select --install
brew install chruby ruby-install
ruby-install ruby 3.3.13
source "$(brew --prefix)/opt/chruby/share/chruby/chruby.sh"
chruby ruby-3.3.13
ruby --version
```

If Xcode Command Line Tools are already installed, skip the first command.
In each new terminal, repeat the `source` and `chruby` commands to select Ruby,
or configure your shell following the official Jekyll guide.
## Get the source

If you already have the repository, open a terminal in its root. For a new checkout,
run these commands from the parent workspace directory:

```sh
git clone https://github.com/ARTORG-GERONTECHNOLOGY/ARTORG-GERONTECHNOLOGY.github.io.git
cd ARTORG-GERONTECHNOLOGY.github.io
```

The parent workspace is not a Git repository; do not run `git init` there.
All following commands run from the website repository root.

## Prepare local dependencies

The current checkout has no committed Gemfile or lockfile. Use a platform-specific
folder outside the repository so the Windows runtime and lockfile remain intact.
Run this file-creation block once when setting up this platform:

```sh
mkdir -p ../.local/macos
cat > ../.local/macos/Gemfile <<'EOF'
source "https://rubygems.org"
gem "jekyll", "4.4.1"
gem "webrick", "1.9.1"
EOF
cat > ../.local/macos/jekyll.yml <<'EOF'
url: "http://127.0.0.1:4000"
baseurl: ""
destination: "../.local/macos/site"
cache_dir: "../.local/macos/jekyll-cache"
EOF
```

After selecting Ruby, set these variables in each new terminal, from the repository
root, before running Bundler:

```sh
export BUNDLE_GEMFILE="$PWD/../.local/macos/Gemfile"
export BUNDLE_PATH="$PWD/../.local/macos/gems"
export BUNDLE_USER_HOME="$PWD/../.local/macos/bundle-user"
export JEKYLL_ENV=development
```

Install Bundler under your managed Ruby, without `sudo`, and install dependencies:

```sh
gem install bundler -v 2.5.22 --no-document
bundle _2.5.22_ install
bundle check
```

Keep the generated `../.local/macos/Gemfile.lock` for subsequent installs.
Jekyll and WEBrick use the Windows setup's pinned versions; native gems and the
resolved dependency lock are specific to this platform and remain unverified.

## Build and preview

```sh
bundle exec jekyll build --config _config.yml,../.local/macos/jekyll.yml --disable-disk-cache
bundle exec jekyll serve --config _config.yml,../.local/macos/jekyll.yml --host 127.0.0.1 --port 4000 --disable-disk-cache
```

Open <http://127.0.0.1:4000/>. Leave the terminal running; press **Ctrl+C** to stop.
Refresh the browser after edits. Generated output stays in the sibling `.local`
folder. Keep production `_config.yml` and `CNAME` unchanged.

## Check the setup

Confirm that the build succeeds, then open the homepage, both proposal listings,
search, and representative proposal pages. Check styles and menu navigation.
The existing theme requires Internet access for external scripts and fonts.
Record the installed versions and any platform-specific problems before describing
this setup as tested.

## Troubleshooting

- **Wrong Ruby or permission errors:** reselect your managed Ruby and check
  `ruby --version` and `which ruby`. Do not install gems using `sudo`.
- **Gemfile not found:** set the environment variables above from the repository root.
- **Native extension failures:** check that the compiler and development libraries
  required by your Ruby installation are installed.
- **Port 4000 occupied:** stop the other local preview before starting this one.
- **File changes are not detected:** add `--force_polling` to the serve command.
- **Missing external styles/scripts:** check Internet access and browser errors.

[Back to README](../README.md)
