# Windows local setup

The local environment is stored in the workspace's `.local` directory, alongside
this repository. It is intentionally uncommitted. Ruby is not added to your
permanent PATH; activate it separately in each PowerShell terminal.

Requirements: Windows x64, PowerShell, Git, and Internet access for initial
installation and the existing theme's external browser assets. The installed
versions are RubyInstaller+Devkit 3.3.13-1 (Ruby 3.3.13), Bundler 2.5.22,
Jekyll 4.4.1, and WEBrick 1.9.1. The complete dependency versions are locked in
the repository's `Gemfile.lock`.

From this repository directory, install/check the local dependencies:

```powershell
& ..\.local\setup.ps1
. ..\.local\env.ps1
bundle check
```

`setup.ps1` downloads Ruby from the official RubyInstaller GitHub release when
needed, verifies its pinned SHA256, installs Ruby and its build tools into
`../.local/ruby`, and runs `bundle install`. It does not configure the system PATH
or file associations. The environment script uses Windows short paths for the
Ruby runtime to avoid Bundler's problem with spaces in RUBYOPT. It sets this terminal's Ruby PATH,
Bundler manifest/dependency paths, and `JEKYLL_ENV=development`.

## Build

Run from the website repository root after activating the environment:

```powershell
bundle exec jekyll build --config _config.yml,../.local/jekyll.yml --disable-disk-cache
```

Generated HTML/CSS goes to `../.local/site`. Local configuration overrides the
preview URL and output/cache paths. Keep `_config.yml` and `CNAME` unchanged.
The runtime, gems, and generated output stay outside the website repository.

## Run the preview

```powershell
& ..\.local\serve.ps1
```

Open <http://127.0.0.1:4000/>. Leave the terminal running and press **Ctrl+C** to
stop. Source edits trigger rebuilds; refresh the browser to see the result.
The script uses polling for Windows file watching and binds only to loopback.

The equivalent command after activating the environment is:

```powershell
bundle exec jekyll serve --config _config.yml,../.local/jekyll.yml --host 127.0.0.1 --port 4000 --force_polling --disable-disk-cache
```

For a hidden background preview:

```powershell
& ..\.local\serve.ps1 -Background
```

Its logs are `../.local/preview.log` and `../.local/preview-error.log`, and its
process ID is saved to `../.local/preview.pid`. Stop that background preview with:

```powershell
Stop-Process -Id (Get-Content ..\.local\preview.pid)
```

## Another checkout or machine

Clone the website repository into a workspace:

```powershell
git clone https://github.com/ARTORG-GERONTECHNOLOGY/ARTORG-GERONTECHNOLOGY.github.io.git
cd ARTORG-GERONTECHNOLOGY.github.io
```

The repository contains the dependency manifest and lockfile. The preview
helper scripts remain local. Copy these small setup files from the prepared
workspace into a sibling `.local` directory: `setup.ps1`, `env.ps1`, `serve.ps1`,
and `jekyll.yml`. Do not copy Ruby, installed gems,
caches, logs, or generated HTML; run `setup.ps1` to install them. Keep the website
directory named `ARTORG-GERONTECHNOLOGY.github.io` for the preview helper.

The build can also be reproduced from a clean source copy using the same local
installed dependencies (set `BUNDLE_GEMFILE` to the extracted Gemfile first):

```powershell
git archive HEAD --format=zip --output=../.local/verification-source.zip
Expand-Archive ../.local/verification-source.zip ../.local/verification-source
Push-Location ../.local/verification-source
try {
    bundle exec jekyll build --config _config.yml,../jekyll.yml --destination ../verification-site --disable-disk-cache
} finally {
    Pop-Location
}
```

Use a new extraction directory if it already exists. This builds the committed
source; it does not include uncommitted changes.

## Troubleshooting

- **`bundle` or `ruby` is not recognized:** run `. ..\.local\env.ps1` in the
  current terminal from the repository root.
- **Dependencies are missing:** run `& ..\.local\setup.ps1`. Native extensions
  require the bundled MSYS2 build tools; allow the installation to finish.
- **Port 4000 is occupied:** stop the existing preview before starting another.
  The initial setup may already have a background preview running.
- **CSS, fonts, or menu scripts are missing:** the existing theme uses external
  CDNs and Google Fonts. Check Internet access and browser errors. Local site
  generation alone does not make those external dependencies available offline.
- **Sass deprecation warnings:** the legacy styles use syntax deprecated by newer
  Sass releases. Review the build's final result; these warnings are not proof
  of a failed build. Updating theme styles belongs to a later feature step.

## Verification recorded on 2026-11-11

The regular build and a clean-source build both succeeded. Generated pages for
all five current and five older proposals, local assets, valid search JSON, and
five RSS entries were checked. The server log reports the preview running at
http://127.0.0.1:4000/. The supervising user confirmed the browser check on
2026-11-11. Browser verification was performed by the user; automated checks
covered the build and generated files. No production deployment was performed.


[Back to README](../README.md)
