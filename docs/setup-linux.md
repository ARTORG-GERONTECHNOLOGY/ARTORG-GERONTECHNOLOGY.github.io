<!-- The Linux setup has not been tested so far. -->

# Linux local setup

> **Not tested so far:** these instructions have not been run on Linux.
> Only the Windows build has been verified.

## Prerequisites

Use Git, a C/C++ compiler, Ruby development libraries, and managed Ruby 3.3.13.
The package example below is for Ubuntu/Debian; other distributions require their
own package-manager equivalents. See [Jekyll's Ubuntu guidance](https://jekyllrb.com/docs/installation/ubuntu/).

```sh
sudo apt-get update
sudo apt-get install git build-essential autoconf libssl-dev libyaml-dev zlib1g-dev libreadline-dev libffi-dev
```

Install and initialize [rbenv](https://github.com/rbenv/rbenv#installation) and its
[ruby-build plugin](https://github.com/rbenv/ruby-build#installation) using their
official instructions. If they are already installed, use the existing installation.
Then install and select the same Ruby version used by the Windows setup:

```sh
rbenv install -s 3.3.13
rbenv shell 3.3.13
ruby --version
```

The `rbenv shell` command requires rbenv's shell integration to be initialized.
Select Ruby again in each new terminal. This keeps project gems separate from the
distribution's system Ruby; do not use `sudo gem install`.
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

Use the repository Gemfile and lockfile. Store installed gems and preview output
in a platform-specific folder outside the repository.
Run this file-creation block once when setting up this platform:

```sh
mkdir -p ../.local/linux
cat > ../.local/linux/jekyll.yml <<'EOF'
url: "http://127.0.0.1:4000"
baseurl: ""
destination: "../.local/linux/site"
cache_dir: "../.local/linux/jekyll-cache"
EOF
```

After selecting Ruby, set these variables in each new terminal, from the repository
root, before running Bundler:

```sh
export BUNDLE_GEMFILE="$PWD/Gemfile"
export BUNDLE_PATH="$PWD/../.local/linux/gems"
export BUNDLE_USER_HOME="$PWD/../.local/linux/bundle-user"
export JEKYLL_ENV=development
```

Install Bundler under your managed Ruby, without `sudo`, and install dependencies:

```sh
gem install bundler -v 2.5.22 --no-document
bundle _2.5.22_ lock --add-platform ruby
bundle _2.5.22_ install
bundle check
```

Bundler adds this platform to the repository lockfile. Review that change before
committing; this platform remains untested.

## Build and preview

```sh
bundle exec jekyll build --config _config.yml,../.local/linux/jekyll.yml --disable-disk-cache
bundle exec jekyll serve --config _config.yml,../.local/linux/jekyll.yml --host 127.0.0.1 --port 4000 --disable-disk-cache
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
